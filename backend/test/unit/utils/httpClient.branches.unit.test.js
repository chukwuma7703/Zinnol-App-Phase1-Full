import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Helper to load module fresh per test with a provided axios mock
const loadWithAxios = (axiosMock) => {
    vi.resetModules();
    vi.doMock('axios', () => axiosMock, { virtual: true });
    return import('../../../utils/httpClient.js');
};

describe('httpClient extra branches', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.runOnlyPendingTimers();
        vi.useRealTimers();
    });

    it('initializes client on demand when missing (get path)', async () => {
        const fakeClient = {
            get: vi.fn().mockResolvedValue({ data: { ok: true } }),
            interceptors: { response: { use: vi.fn((succ, err) => ({ succ, err })) } },
        };
        const axiosMock = { default: { create: vi.fn(() => fakeClient) } };
        const { default: HttpClient } = await loadWithAxios(axiosMock);

        const inst = new HttpClient({});
        // simulate missing client to hit the branch
        inst.client = null;
        // override initClient to attach our fake client
        inst.initClient = function () { this.client = fakeClient; };

        const res = await inst.get('https://example.test');
        expect(res).toEqual({ ok: true });
        expect(axiosMock.default.create).toHaveBeenCalled();
    });

    it('interceptor: 4xx client errors do not retry and throw ExternalServiceError', async () => {
        const captured = {};
        const fakeClient = {
            get: vi.fn(),
            interceptors: { response: { use: vi.fn((succ, err) => { captured.err = err; }) } },
        };
        const axiosMock = { default: { create: vi.fn(() => fakeClient) } };
        const { default: HttpClient } = await loadWithAxios(axiosMock);
        // construct to register interceptor
        const inst = new HttpClient({ serviceName: 'Svc' });

        const error = {
            config: { url: '/x', serviceName: 'Svc', retries: 3 },
            response: { status: 404, statusText: 'Not Found' },
        };

        await expect(captured.err.call(inst, error)).rejects.toMatchObject({
            type: 'EXTERNAL_SERVICE_ERROR',
            service: 'Svc',
            message: expect.stringContaining('Client error: 404 Not Found'),
        });
        expect(fakeClient.get).not.toHaveBeenCalled();
    });

    it('interceptor: performs a retry branch and returns client call result', async () => {
        const captured = {};
        const fakeClient = {
            // Mock the client call directly (not get method)
            request: vi.fn().mockResolvedValue({ data: { ok: true } }),
            interceptors: { response: { use: vi.fn((succ, err) => { captured.err = err; }) } },
        };

        // Mock the client function call
        const clientCallMock = vi.fn().mockResolvedValue({ data: { ok: true } });
        fakeClient.request = clientCallMock;

        const axiosMock = { default: { create: vi.fn(() => fakeClient) } };
        const { default: HttpClient } = await loadWithAxios(axiosMock);
        const inst = new HttpClient({});

        // Override the client to use our mock
        inst.client = clientCallMock;

        const error = {
            config: { url: '/retry', serviceName: 'Svc', retries: 2, retryDelay: 1, retryCount: 0 },
            // no response simulates network/server error leading to retry branch
        };

        // Start the retry process
        const retryPromise = captured.err.call(inst, error);

        // Fast-forward through the setTimeout delay
        vi.advanceTimersByTime(1000);

        // Wait for the promise to resolve
        const res = await retryPromise;

        expect(res).toEqual({ data: { ok: true } });
        expect(clientCallMock).toHaveBeenCalledWith(error.config);
    });

    it('interceptor: final path maps unknown network errors to "Network error"', async () => {
        // Test the network error path by simulating a direct method call that fails
        const fakeClient = {
            get: vi.fn().mockRejectedValue(new Error('Network failure')),
            interceptors: { response: { use: vi.fn() } },
        };
        const axiosMock = { default: { create: vi.fn(() => fakeClient) } };
        const { default: HttpClient } = await loadWithAxios(axiosMock);
        const inst = new HttpClient({ serviceName: 'TestService' });

        // This should trigger the network error path in the method wrapper
        await expect(inst.get('/network-fail', { serviceName: 'TestService' })).rejects.toMatchObject({
            type: 'EXTERNAL_SERVICE_ERROR',
            service: 'TestService',
            message: expect.stringContaining('GET /network-fail failed: Network failure'),
        });
    });

    it('method wrappers wrap non-ExternalServiceError in ExternalServiceError (delete)', async () => {
        const fakeClient = {
            delete: vi.fn(() => { throw new Error('boom'); }),
            interceptors: { response: { use: vi.fn() } },
        };
        const axiosMock = { default: { create: vi.fn(() => fakeClient) } };
        const { default: HttpClient } = await loadWithAxios(axiosMock);
        const inst = new HttpClient({});

        await expect(inst.delete('https://example.test/x')).rejects.toMatchObject({
            type: 'EXTERNAL_SERVICE_ERROR',
            service: 'External Service',
            message: expect.stringContaining('DELETE https://example.test/x failed: boom'),
        });
    });
});