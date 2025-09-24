import { jest, describe, it, expect, beforeEach } from "@jest/globals";

// Mock logger and cache
jest.unstable_mockModule("../utils/logger.js", () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.unstable_mockModule("../config/cache.js", () => ({
  getCache: jest.fn(),
  setCache: jest.fn(),
}));

// Import after mocking
const requestTrackingModule = await import("../middleware/requestTracking.js");
const { requestTracking, slowRequestLogger, apiUsageTracker } = requestTrackingModule;
const logger = (await import("../utils/logger.js")).default;
const { getCache, setCache } = await import("../config/cache.js");

describe("Request Tracking Middleware", () => {
  let mockReq, mockRes, mockNext;

  beforeEach(() => {
    jest.clearAllMocks();

    mockReq = {
      headers: {},
      method: "GET",
      originalUrl: "/test",
      ip: "127.0.0.1",
      get: jest.fn(() => "test-user-agent"),
    };

    mockRes = {
      setHeader: jest.fn(),
      statusCode: 200,
      json: jest.fn(),
      on: jest.fn(),
    };

    mockNext = jest.fn();
  });

  describe("requestTracking", () => {
    it("should generate request ID and set headers", () => {
      requestTracking(mockReq, mockRes, mockNext);

      expect(mockReq.id).toBeDefined();
      expect(typeof mockReq.id).toBe("string");
      expect(mockReq.id.length).toBeGreaterThan(0);
      expect(mockRes.setHeader).toHaveBeenCalledWith("X-Request-ID", mockReq.id);
      expect(mockReq.startTime).toBeDefined();
      expect(typeof mockReq.startTime).toBe("number");
      expect(logger.info).toHaveBeenCalledWith("Incoming request", expect.objectContaining({
        requestId: mockReq.id,
        method: "GET",
        url: "/test",
        ip: "127.0.0.1",
        userAgent: "test-user-agent",
      }));
      expect(mockNext).toHaveBeenCalled();
    });

    it("should use existing request ID from headers", () => {
      mockReq.headers["x-request-id"] = "existing-id";

      requestTracking(mockReq, mockRes, mockNext);

      expect(mockReq.id).toBe("existing-id");
      expect(mockRes.setHeader).toHaveBeenCalledWith("X-Request-ID", "existing-id");
    });

    it("should log response and add timing headers when json is called", () => {
      // Store the original json function
      const originalJson = mockRes.json;

      requestTracking(mockReq, mockRes, mockNext);

      const testData = { message: "test" };

      // Call the overridden json method
      mockRes.json(testData);

      expect(logger.info).toHaveBeenCalledWith("Request completed", expect.objectContaining({
        requestId: mockReq.id,
        method: "GET",
        url: "/test",
        status: 200,
        responseTime: expect.stringMatching(/\d+ms/),
      }));
      expect(mockRes.setHeader).toHaveBeenCalledWith("X-Response-Time", expect.stringMatching(/\d+ms/));
      // The original json should still be called
      expect(mockRes.json).not.toBe(originalJson); // Should be overridden
    });
  });

  describe("slowRequestLogger", () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it("should log slow requests above threshold", () => {
      const threshold = 100;
      const middleware = slowRequestLogger(threshold);

      middleware(mockReq, mockRes, mockNext);

      // Simulate finish event after delay
      const finishCallback = mockRes.on.mock.calls.find(call => call[0] === "finish")[1];
      jest.advanceTimersByTime(150);

      finishCallback();

      expect(logger.warn).toHaveBeenCalledWith("Slow request detected", expect.objectContaining({
        requestId: mockReq.id,
        method: "GET",
        url: "/test",
        duration: "150ms",
        threshold: "100ms",
      }));
    });

    it("should not log fast requests", () => {
      const threshold = 1000;
      const middleware = slowRequestLogger(threshold);

      middleware(mockReq, mockRes, mockNext);

      const finishCallback = mockRes.on.mock.calls.find(call => call[0] === "finish")[1];
      jest.advanceTimersByTime(100);

      finishCallback();

      expect(logger.warn).not.toHaveBeenCalled();
    });
  });

  describe("apiUsageTracker", () => {
    beforeEach(() => {
      jest.useFakeTimers();
      // Set a fixed date for testing
      jest.setSystemTime(new Date("2024-01-01T12:00:00Z"));
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it("should skip tracking if no user", async () => {
      await apiUsageTracker(mockReq, mockRes, mockNext);

      expect(getCache).not.toHaveBeenCalled();
      expect(setCache).not.toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalled();
    });

    it("should track API usage for authenticated user", async () => {
      mockReq.user = { _id: "user123" };
      getCache.mockResolvedValue(5);
      setCache.mockResolvedValue();

      await apiUsageTracker(mockReq, mockRes, mockNext);

      expect(getCache).toHaveBeenCalledWith("api_usage:user123:2024-01-01");
      expect(setCache).toHaveBeenCalledWith("api_usage:user123:2024-01-01", 6, 86400);
      expect(mockRes.setHeader).toHaveBeenCalledWith("X-API-Usage-Today", 6);
      expect(mockNext).toHaveBeenCalled();
    });

    it("should handle cache errors gracefully", async () => {
      mockReq.user = { _id: "user123" };
      getCache.mockRejectedValue(new Error("Cache error"));

      await apiUsageTracker(mockReq, mockRes, mockNext);

      expect(logger.error).toHaveBeenCalledWith("API usage tracking failed", {
        error: "Cache error",
      });
      expect(mockNext).toHaveBeenCalled();
    });

    it("should initialize usage count to 1 for new users", async () => {
      mockReq.user = { _id: "newuser" };
      getCache.mockResolvedValue(null);

      await apiUsageTracker(mockReq, mockRes, mockNext);

      expect(setCache).toHaveBeenCalledWith("api_usage:newuser:2024-01-01", 1, 86400);
      expect(mockRes.setHeader).toHaveBeenCalledWith("X-API-Usage-Today", 1);
    });
  });
});
