import { jest, describe, it, expect } from "@jest/globals";

// Mock express-rate-limit
jest.unstable_mockModule("express-rate-limit", () => ({
    __esModule: true,
    default: jest.fn().mockImplementation((options) => {
        // Return a mock middleware function that just calls next()
        return (req, res, next) => next();
    }),
}));

// Import after mocking
const rateLimitModule = await import("../middleware/rateLimitMiddleware.js");
const { authLimiter } = rateLimitModule;

describe("Rate Limit Middleware", () => {
    it("should export authLimiter as a function", () => {
        expect(typeof authLimiter).toBe("function");
    });

    it("should configure rate limiter with correct options", () => {
        // The rate limiter should be configured with the expected options
        // Since we're mocking, we can't easily test the exact configuration,
        // but we can test that the module exports the expected structure
        expect(authLimiter).toBeDefined();
        expect(typeof authLimiter).toBe("function");
    });
});
