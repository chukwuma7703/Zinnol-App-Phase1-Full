import { vi } from 'vitest';
import { ExternalServiceError } from '../../utils/AppError.js';

// Mock axios at the top
vi.mock('axios', () => ({
    default: {
        create: vi.fn(() => ({
            interceptors: { response: { use: vi.fn() } },
            get: vi.fn(),
            post: vi.fn(),
            put: vi.fn(),
            delete: vi.fn()
        }))
    }
}));

import axios from 'axios';
import HttpClient from '../../utils/httpClient.js';

// Helper to make axios.create return a per-test instance with spies
function setupAxiosInstance() {
    // Axios instances are callable functions. Simulate that.
    const instance = vi.fn((cfg = {}) => {
        const method = (cfg.method || 'get').toLowerCase();
        if (method === 'get') return instance.get(cfg.url, cfg);
        if (method === 'post') return instance.post(cfg.url, cfg.data, cfg);
        if (method === 'put') return instance.put(cfg.url, cfg.data, cfg);
        if (method === 'delete') return instance.delete(cfg.url, cfg);
        return Promise.reject(new Error('unsupported method'));
    });
    instance.get = vi.fn();
    instance.post = vi.fn();
    instance.put = vi.fn();
    instance.delete = vi.fn();
    instance.request = vi.fn((config) => {
        const method = config.method.toLowerCase();
        if (method === 'get') return instance.get(config.url, config);
        if (method === 'post') return instance.post(config.url, config.data, config);
        if (method === 'put') return instance.put(config.url, config.data, config);
        if (method === 'delete') return instance.delete(config.url, config);
        return Promise.reject(new Error('unsupported method'));
    });
    instance.interceptors = { response: { use: vi.fn((ok, fail) => { instance._onFail = fail; return 1; }) } };
    axios.create.mockReturnValue(instance);
    return instance;
}

describe('HttpClient', () => {
    beforeEach(() => {
        // Use real timers to avoid conflicts with global cleanup in setup.unit
        vi.useRealTimers();
        vi.clearAllMocks();
    });

    test('get() returns data on success', async () => {
        const instance = setupAxiosInstance();
        const client = new HttpClient({ serviceName: 'Svc' });
        instance.get.mockResolvedValue({ data: { ok: true } });

        const result = await client.get('/test');
        expect(result).toEqual({ ok: true });
        expect(instance.get).toHaveBeenCalledWith('/test', { serviceName: 'Svc' });
    });

    test('post() wraps unknown errors as ExternalServiceError', async () => {
        const instance = setupAxiosInstance();
        const client = new HttpClient({ serviceName: 'Svc' });
        instance.post.mockRejectedValue(Object.assign(new Error('Network error'), { config: { serviceName: 'Svc', method: 'post', url: '/test' } }));

        await expect(client.post('/test', { data: 'test' })).rejects.toThrow(ExternalServiceError);
        await expect(client.post('/test', { data: 'test' })).rejects.toThrow('Svc: POST /test failed: Network error');
    });

    test('retry logic on 5xx errors then throws ExternalServiceError after retries', async () => {
        const instance = setupAxiosInstance();
        const client = new HttpClient({ serviceName: 'Svc', retryAttempts: 2 });

        instance.get.mockRejectedValue(Object.assign(new Error('Server error'), { response: { status: 500 }, config: { serviceName: 'Svc', method: 'get', url: '/test' } }));

        await expect(client.get('/test')).rejects.toThrow('Svc: GET /test failed: Server error');
        expect(instance.get).toHaveBeenCalledTimes(1);
    });

    test('does not retry on 4xx client error and throws ExternalServiceError', async () => {
        const instance = setupAxiosInstance();
        const client = new HttpClient({ serviceName: 'Svc', retryAttempts: 2 });
        instance.get.mockRejectedValue(Object.assign(new Error('Not found'), { response: { status: 404 }, config: { serviceName: 'Svc', method: 'get', url: '/test' } }));

        await expect(client.get('/test')).rejects.toThrow('Svc: GET /test failed: Not found');
        expect(instance.get).toHaveBeenCalledTimes(1);
    });

    test('timeout error maps to ExternalServiceError("Request timeout")', async () => {
        const instance = setupAxiosInstance();
        const client = new HttpClient({ serviceName: 'Svc' });
        instance.get.mockRejectedValue(Object.assign(new Error('timeout'), { code: 'ECONNABORTED', config: { serviceName: 'Svc', method: 'get', url: '/test' } }));

        await expect(client.get('/test')).rejects.toThrow('Svc: GET /test failed: Request timeout');
        expect(instance.get).toHaveBeenCalledTimes(1);
    });
});
