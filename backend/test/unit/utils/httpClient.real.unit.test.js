import { describe, it, expect, beforeEach, afterEach, beforeAll, vi } from "vitest";

describe("HttpClient (real) - basic functionality", () => {
    let HttpClient;
    let ExternalServiceError;

    beforeAll(async () => {
        // Import the classes we need to test
        const httpClientModule = await import('../../../utils/httpClient.js');
        const appErrorModule = await import('../../../utils/AppError.js');
        HttpClient = httpClientModule.default;
        ExternalServiceError = appErrorModule.ExternalServiceError;
    });

    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.runOnlyPendingTimers();
        vi.useRealTimers();
    });

    it("creates HttpClient instance with default options", () => {
        const client = new HttpClient();
        expect(client.options).toEqual({});
        expect(client.client).toBeDefined();
    });

    it("creates HttpClient instance with custom options", () => {
        const options = { timeout: 5000, retries: 1, serviceName: "TestService" };
        const client = new HttpClient(options);
        expect(client.options).toEqual(options);
        expect(client.client).toBeDefined();
    });

    it("handles method wrapper error transformation", async () => {
        const client = new HttpClient({ serviceName: "TestService" });

        // Mock the client to throw a regular error
        client.client = {
            get: vi.fn().mockRejectedValue(new Error("Network failure"))
        };

        await expect(client.get("/test", { serviceName: "TestService" }))
            .rejects.toMatchObject({
                type: 'EXTERNAL_SERVICE_ERROR',
                service: 'TestService',
                message: expect.stringContaining('GET /test failed: Network failure')
            });
    });

    it("passes through ExternalServiceError without wrapping", async () => {
        const client = new HttpClient({ serviceName: "TestService" });
        const originalError = new ExternalServiceError("OriginalService", "Original error");

        // Mock the client to throw an ExternalServiceError
        client.client = {
            get: vi.fn().mockRejectedValue(originalError)
        };

        await expect(client.get("/test"))
            .rejects.toBe(originalError);
    });

    it("re-initializes client when missing", async () => {
        const client = new HttpClient({ serviceName: "TestService" });

        // Mock successful response
        const mockGet = vi.fn().mockResolvedValue({ data: "success" });

        // Force drop the internal axios instance
        client.client = null;

        // Mock initClient to set up our mock
        client.initClient = vi.fn(() => {
            client.client = { get: mockGet };
        });

        const data = await client.get("/test");
        expect(data).toBe("success");
        expect(client.initClient).toHaveBeenCalled();
        expect(mockGet).toHaveBeenCalledWith("/test", expect.any(Object));
    });

    it("successfully handles GET requests", async () => {
        const client = new HttpClient({ serviceName: "TestService" });
        client.client = {
            get: vi.fn().mockResolvedValue({ data: { result: "success" } })
        };

        const data = await client.get("/test");
        expect(data).toEqual({ result: "success" });
    });

    it("successfully handles POST requests", async () => {
        const client = new HttpClient({ serviceName: "TestService" });
        client.client = {
            post: vi.fn().mockResolvedValue({ data: { created: true } })
        };

        const data = await client.post("/test", { name: "test" });
        expect(data).toEqual({ created: true });
    });

    it("successfully handles PUT requests", async () => {
        const client = new HttpClient({ serviceName: "TestService" });
        client.client = {
            put: vi.fn().mockResolvedValue({ data: { updated: true } })
        };

        const data = await client.put("/test", { name: "updated" });
        expect(data).toEqual({ updated: true });
    });

    it("successfully handles DELETE requests", async () => {
        const client = new HttpClient({ serviceName: "TestService" });
        client.client = {
            delete: vi.fn().mockResolvedValue({ data: { deleted: true } })
        };

        const data = await client.delete("/test");
        expect(data).toEqual({ deleted: true });
    });

    it("uses default service name when not provided", async () => {
        const client = new HttpClient();
        client.client = {
            get: vi.fn().mockRejectedValue(new Error("Test error"))
        };

        await expect(client.get("/test"))
            .rejects.toMatchObject({
                type: 'EXTERNAL_SERVICE_ERROR',
                service: 'External Service',
                message: expect.stringContaining('GET /test failed: Test error')
            });
    });

    it("uses config serviceName when provided in method call", async () => {
        const client = new HttpClient();
        client.client = {
            get: vi.fn().mockRejectedValue(new Error("Test error"))
        };

        await expect(client.get("/test", { serviceName: "ConfigService" }))
            .rejects.toMatchObject({
                type: 'EXTERNAL_SERVICE_ERROR',
                service: 'ConfigService',
                message: expect.stringContaining('GET /test failed: Test error')
            });
    });
});
