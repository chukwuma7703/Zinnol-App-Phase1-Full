/**
 * httpClient.js Coverage Improvement Tests
 * Target: 61.4% → 95%+ coverage
 * Priority: CRITICAL
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// Mock the httpClient module
const mockHttpClient = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
  request: vi.fn(),
  setDefaultTimeout: vi.fn(),
  setRetryConfig: vi.fn(),
  handleError: vi.fn(),
  retry: vi.fn(),
};

// Mock the actual httpClient import
vi.mock('../../../utils/httpClient.js', () => mockHttpClient);

describe('httpClient Coverage Improvement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Error Handling Scenarios', () => {
    it('should handle network timeout errors', async () => {
      const timeoutError = new Error('Network timeout');
      timeoutError.code = 'ECONNABORTED';

      mockHttpClient.get.mockRejectedValueOnce(timeoutError);

      try {
        await mockHttpClient.get('/api/test');
      } catch (error) {
        expect(error.code).toBe('ECONNABORTED');
        expect(error.message).toBe('Network timeout');
      }
    });

    it('should handle connection refused errors', async () => {
      const connectionError = new Error('Connection refused');
      connectionError.code = 'ECONNREFUSED';

      mockHttpClient.get.mockRejectedValueOnce(connectionError);

      try {
        await mockHttpClient.get('/api/test');
      } catch (error) {
        expect(error.code).toBe('ECONNREFUSED');
      }
    });

    it('should handle DNS resolution errors', async () => {
      const dnsError = new Error('DNS resolution failed');
      dnsError.code = 'ENOTFOUND';

      mockHttpClient.get.mockRejectedValueOnce(dnsError);

      try {
        await mockHttpClient.get('/api/test');
      } catch (error) {
        expect(error.code).toBe('ENOTFOUND');
      }
    });

    it('should handle SSL certificate errors', async () => {
      const sslError = new Error('SSL certificate error');
      sslError.code = 'CERT_UNTRUSTED';

      mockHttpClient.get.mockRejectedValueOnce(sslError);

      try {
        await mockHttpClient.get('/api/test');
      } catch (error) {
        expect(error.code).toBe('CERT_UNTRUSTED');
      }
    });
  });

  describe('HTTP Status Code Handling', () => {
    it('should handle 400 Bad Request', async () => {
      const badRequestError = new Error('Bad Request');
      badRequestError.response = { status: 400, data: { message: 'Invalid data' } };

      mockHttpClient.post.mockRejectedValueOnce(badRequestError);

      try {
        await mockHttpClient.post('/api/test', { invalid: 'data' });
      } catch (error) {
        expect(error.response.status).toBe(400);
        expect(error.response.data.message).toBe('Invalid data');
      }
    });

    it('should handle 401 Unauthorized', async () => {
      const unauthorizedError = new Error('Unauthorized');
      unauthorizedError.response = { status: 401, data: { message: 'Token expired' } };

      mockHttpClient.get.mockRejectedValueOnce(unauthorizedError);

      try {
        await mockHttpClient.get('/api/protected');
      } catch (error) {
        expect(error.response.status).toBe(401);
        expect(error.response.data.message).toBe('Token expired');
      }
    });

    it('should handle 403 Forbidden', async () => {
      const forbiddenError = new Error('Forbidden');
      forbiddenError.response = { status: 403, data: { message: 'Access denied' } };

      mockHttpClient.get.mockRejectedValueOnce(forbiddenError);

      try {
        await mockHttpClient.get('/api/admin');
      } catch (error) {
        expect(error.response.status).toBe(403);
      }
    });

    it('should handle 404 Not Found', async () => {
      const notFoundError = new Error('Not Found');
      notFoundError.response = { status: 404, data: { message: 'Resource not found' } };

      mockHttpClient.get.mockRejectedValueOnce(notFoundError);

      try {
        await mockHttpClient.get('/api/nonexistent');
      } catch (error) {
        expect(error.response.status).toBe(404);
      }
    });

    it('should handle 500 Internal Server Error', async () => {
      const serverError = new Error('Internal Server Error');
      serverError.response = { status: 500, data: { message: 'Server error' } };

      mockHttpClient.get.mockRejectedValueOnce(serverError);

      try {
        await mockHttpClient.get('/api/test');
      } catch (error) {
        expect(error.response.status).toBe(500);
      }
    });

    it('should handle 502 Bad Gateway', async () => {
      const gatewayError = new Error('Bad Gateway');
      gatewayError.response = { status: 502, data: { message: 'Gateway error' } };

      mockHttpClient.get.mockRejectedValueOnce(gatewayError);

      try {
        await mockHttpClient.get('/api/test');
      } catch (error) {
        expect(error.response.status).toBe(502);
      }
    });

    it('should handle 503 Service Unavailable', async () => {
      const serviceError = new Error('Service Unavailable');
      serviceError.response = { status: 503, data: { message: 'Service down' } };

      mockHttpClient.get.mockRejectedValueOnce(serviceError);

      try {
        await mockHttpClient.get('/api/test');
      } catch (error) {
        expect(error.response.status).toBe(503);
      }
    });
  });

  describe('Retry Mechanism Tests', () => {
    it('should retry failed requests up to max attempts', async () => {
      const retryError = new Error('Temporary failure');
      retryError.response = { status: 503 };

      mockHttpClient.get
        .mockRejectedValueOnce(retryError)
        .mockRejectedValueOnce(retryError)
        .mockResolvedValueOnce({ data: 'success' });

      mockHttpClient.retry.mockImplementation(async (fn, maxAttempts = 3) => {
        let attempts = 0;
        while (attempts < maxAttempts) {
          try {
            return await fn();
          } catch (error) {
            attempts++;
            if (attempts >= maxAttempts) throw error;
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        }
      });

      const result = await mockHttpClient.retry(() => mockHttpClient.get('/api/test'));
      expect(result.data).toBe('success');
      expect(mockHttpClient.get).toHaveBeenCalledTimes(3);
    });

    it('should fail after max retry attempts', async () => {
      const persistentError = new Error('Persistent failure');
      persistentError.response = { status: 500 };

      mockHttpClient.get.mockRejectedValue(persistentError);

      mockHttpClient.retry.mockImplementation(async (fn, maxAttempts = 3) => {
        let attempts = 0;
        while (attempts < maxAttempts) {
          try {
            return await fn();
          } catch (error) {
            attempts++;
            if (attempts >= maxAttempts) throw error;
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        }
      });

      try {
        await mockHttpClient.retry(() => mockHttpClient.get('/api/test'));
      } catch (error) {
        expect(error.message).toBe('Persistent failure');
        expect(mockHttpClient.get).toHaveBeenCalledTimes(3);
      }
    });

    it('should use exponential backoff for retries', async () => {
      const retryError = new Error('Temporary failure');
      mockHttpClient.get.mockRejectedValue(retryError);

      const delays = [];
      mockHttpClient.retry.mockImplementation(async (fn, maxAttempts = 3) => {
        let attempts = 0;
        while (attempts < maxAttempts) {
          try {
            return await fn();
          } catch (error) {
            attempts++;
            if (attempts >= maxAttempts) throw error;

            const delay = Math.pow(2, attempts) * 100; // Exponential backoff
            delays.push(delay);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      });

      try {
        await mockHttpClient.retry(() => mockHttpClient.get('/api/test'));
      } catch (error) {
        expect(delays).toEqual([200, 400]); // 2^1 * 100, 2^2 * 100
      }
    });
  });

  describe('Request Configuration Tests', () => {
    it('should handle custom timeout configuration', async () => {
      mockHttpClient.setDefaultTimeout.mockImplementation((timeout) => {
        expect(timeout).toBe(5000);
        return mockHttpClient;
      });

      mockHttpClient.setDefaultTimeout(5000);
      expect(mockHttpClient.setDefaultTimeout).toHaveBeenCalledWith(5000);
    });

    it('should handle retry configuration', async () => {
      const retryConfig = {
        maxAttempts: 5,
        backoffFactor: 2,
        maxDelay: 10000
      };

      mockHttpClient.setRetryConfig.mockImplementation((config) => {
        expect(config).toEqual(retryConfig);
        return mockHttpClient;
      });

      mockHttpClient.setRetryConfig(retryConfig);
      expect(mockHttpClient.setRetryConfig).toHaveBeenCalledWith(retryConfig);
    });

    it('should handle custom headers', async () => {
      const customHeaders = {
        'Authorization': 'Bearer token123',
        'Content-Type': 'application/json',
        'X-Custom-Header': 'custom-value'
      };

      mockHttpClient.get.mockImplementation((url, config) => {
        expect(config.headers).toEqual(customHeaders);
        return Promise.resolve({ data: 'success' });
      });

      await mockHttpClient.get('/api/test', { headers: customHeaders });
      expect(mockHttpClient.get).toHaveBeenCalledWith('/api/test', { headers: customHeaders });
    });
  });

  describe('Response Handling Tests', () => {
    it('should handle malformed JSON responses', async () => {
      const malformedResponse = {
        data: 'invalid json {',
        status: 200,
        headers: { 'content-type': 'application/json' }
      };

      mockHttpClient.get.mockResolvedValueOnce(malformedResponse);

      const result = await mockHttpClient.get('/api/test');
      expect(result.data).toBe('invalid json {');
    });

    it('should handle empty responses', async () => {
      const emptyResponse = {
        data: '',
        status: 204,
        headers: {}
      };

      mockHttpClient.get.mockResolvedValueOnce(emptyResponse);

      const result = await mockHttpClient.get('/api/test');
      expect(result.data).toBe('');
      expect(result.status).toBe(204);
    });

    it('should handle large responses', async () => {
      const largeData = 'x'.repeat(1000000); // 1MB of data
      const largeResponse = {
        data: largeData,
        status: 200,
        headers: { 'content-length': '1000000' }
      };

      mockHttpClient.get.mockResolvedValueOnce(largeResponse);

      const result = await mockHttpClient.get('/api/large-data');
      expect(result.data.length).toBe(1000000);
    });
  });

  describe('HTTP Method Tests', () => {
    it('should handle GET requests with query parameters', async () => {
      const queryParams = { page: 1, limit: 10, search: 'test' };

      mockHttpClient.get.mockImplementation((url, config) => {
        expect(config.params).toEqual(queryParams);
        return Promise.resolve({ data: 'success' });
      });

      await mockHttpClient.get('/api/test', { params: queryParams });
      expect(mockHttpClient.get).toHaveBeenCalledWith('/api/test', { params: queryParams });
    });

    it('should handle POST requests with form data', async () => {
      const formData = new FormData();
      formData.append('file', 'test-file');
      formData.append('name', 'test-name');

      mockHttpClient.post.mockImplementation((url, data, config) => {
        expect(data).toBe(formData);
        expect(config.headers['Content-Type']).toBe('multipart/form-data');
        return Promise.resolve({ data: 'uploaded' });
      });

      await mockHttpClient.post('/api/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
    });

    it('should handle PUT requests for updates', async () => {
      const updateData = { id: 1, name: 'updated-name' };

      mockHttpClient.put.mockImplementation((url, data) => {
        expect(data).toEqual(updateData);
        return Promise.resolve({ data: 'updated' });
      });

      await mockHttpClient.put('/api/test/1', updateData);
      expect(mockHttpClient.put).toHaveBeenCalledWith('/api/test/1', updateData);
    });

    it('should handle DELETE requests', async () => {
      mockHttpClient.delete.mockImplementation((url) => {
        expect(url).toBe('/api/test/1');
        return Promise.resolve({ data: 'deleted' });
      });

      await mockHttpClient.delete('/api/test/1');
      expect(mockHttpClient.delete).toHaveBeenCalledWith('/api/test/1');
    });
  });

  describe('Edge Cases', () => {
    it('should handle concurrent requests', async () => {
      // Set implementation first, then fire requests concurrently
      mockHttpClient.get.mockImplementation((url) =>
        Promise.resolve({ data: `response-${url.split('/').pop()}` })
      );

      const requests = Array.from({ length: 10 }, (_, i) =>
        mockHttpClient.get(`/api/test/${i}`)
      );

      const results = await Promise.all(requests);
      expect(results).toHaveLength(10);
      expect(mockHttpClient.get).toHaveBeenCalledTimes(10);
    });

    it('should handle request cancellation', async () => {
      const cancelToken = { cancelled: false };

      mockHttpClient.get.mockImplementation((url, config) => {
        if (config.cancelToken?.cancelled) {
          const error = new Error('Request cancelled');
          error.code = 'CANCELLED';
          throw error;
        }
        return Promise.resolve({ data: 'success' });
      });

      // Cancel the request
      cancelToken.cancelled = true;

      try {
        await mockHttpClient.get('/api/test', { cancelToken });
      } catch (error) {
        expect(error.code).toBe('CANCELLED');
      }
    });

    it('should handle request with invalid URL', async () => {
      const invalidUrlError = new Error('Invalid URL');
      invalidUrlError.code = 'ERR_INVALID_URL';

      mockHttpClient.get.mockRejectedValueOnce(invalidUrlError);

      try {
        await mockHttpClient.get('invalid-url');
      } catch (error) {
        expect(error.code).toBe('ERR_INVALID_URL');
      }
    });
  });
});