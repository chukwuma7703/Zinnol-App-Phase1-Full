import { jest, describe, it, expect } from "@jest/globals";

describe("Logger", () => {
  it("should import logger without errors", async () => {
    process.env.NODE_ENV = 'test';
    process.env.LOG_LEVEL = 'error';

    const loggerModule = await import("./logger.js");
    const logger = loggerModule.default;

    expect(logger).toBeDefined();
    expect(typeof logger).toBe('object');
  });
});
