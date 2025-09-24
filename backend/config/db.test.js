import { jest, describe, it, expect, beforeEach, afterEach } from "@jest/globals";

// Mock mongoose before importing the db connection function
const mockMongooseConnect = jest.fn();
jest.unstable_mockModule("mongoose", () => ({
  __esModule: true,
  default: {
    connect: mockMongooseConnect,
  },
}));

// Dynamically import the module to be tested
const { default: connectDB } = await import("./db.js");

describe("Database Connection", () => {
  let consoleLogSpy;
  let consoleErrorSpy;
  let processExitSpy;

  beforeEach(() => {
    // Spy on console methods and process.exit
    consoleLogSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    // Mock process.exit to prevent tests from terminating, and to check if it's called.
    processExitSpy = jest.spyOn(process, "exit").mockImplementation((code) => {
      // Throw an error to be caught in the test, confirming exit was called.
      throw new Error(`process.exit called with code ${code}`);
    });

    // Clear mocks before each test
    mockMongooseConnect.mockClear();
  });

  afterEach(() => {
    // Restore original implementations
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
  });

  it("should connect to the database successfully and log the host", async () => {
    // Arrange: mock a successful connection
    mockMongooseConnect.mockResolvedValue({
      connection: { host: "testhost" },
    });
    process.env.MONGO_URI = "mongodb://localhost/testdb";

    // Act
    await connectDB();

    // Assert
    expect(mockMongooseConnect).toHaveBeenCalledWith("mongodb://localhost/testdb");
    expect(consoleLogSpy).toHaveBeenCalledWith("✅ MongoDB Connected: testhost");
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it("should log an error and exit the process on connection failure", async () => {
    const connectionError = new Error("Connection failed");
    mockMongooseConnect.mockRejectedValue(connectionError);

    // Act & Assert: Expect the process.exit mock to throw an error
    await expect(connectDB()).rejects.toThrow("process.exit called with code 1");
    expect(consoleErrorSpy).toHaveBeenCalledWith(`✗ Error: ${connectionError.message}`);
  });
});