import { jest, describe, it, expect, beforeEach, afterEach } from "@jest/globals";

// Mock dependencies
const mockInitializeApp = jest.fn();
const mockMessaging = jest.fn(() => ({}));
jest.unstable_mockModule("firebase-admin", () => ({
  __esModule: true,
  default: {
    apps: [],
    initializeApp: mockInitializeApp,
    credential: {
      cert: jest.fn((sa) => sa), // Return the service account object
    },
    messaging: mockMessaging,
  },
}));

const mockExistsSync = jest.fn();
const mockReadFileSync = jest.fn();
jest.unstable_mockModule("fs", () => ({
  __esModule: true,
  default: {
    existsSync: mockExistsSync,
    readFileSync: mockReadFileSync,
  },
}));

describe("Firebase Admin SDK Initialization", () => {
  let consoleWarnSpy;
  let consoleErrorSpy;
  let admin;

  beforeEach(async () => {
    jest.resetModules();
    consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    admin = (await import("firebase-admin")).default;
    admin.apps = []; // Reset apps array before each test
    mockInitializeApp.mockClear();
    mockExistsSync.mockClear();
    mockReadFileSync.mockClear();
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
  });

  it("should initialize Firebase and get messaging when credentials are valid", async () => {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = "/fake/path/to/creds.json";
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify({ project_id: "test-project" }));

    const { messaging } = await import("./firebaseAdmin.js");

    expect(mockInitializeApp).toHaveBeenCalledWith({
      credential: { project_id: "test-project" },
    });
    expect(messaging).toBeDefined();
    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });

  it("should not initialize if GOOGLE_APPLICATION_CREDENTIALS is not set", async () => {
    const { messaging } = await import("./firebaseAdmin.js");
    expect(mockInitializeApp).not.toHaveBeenCalled();
    expect(messaging).toBeNull();
    expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining("credentials not found"));
  });

  it("should not initialize if credential file does not exist", async () => {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = "/fake/path/to/nonexistent.json";
    mockExistsSync.mockReturnValue(false);

    const { messaging } = await import("./firebaseAdmin.js");
    expect(mockInitializeApp).not.toHaveBeenCalled();
    expect(messaging).toBeNull();
    expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining("credentials not found"));
  });

  it("should handle errors during initialization", async () => {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = "/fake/path/to/creds.json";
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockImplementation(() => {
      throw new Error("Parsing error");
    });

    const { messaging } = await import("./firebaseAdmin.js");
    expect(mockInitializeApp).not.toHaveBeenCalled();
    expect(messaging).toBeNull();
    expect(consoleErrorSpy).toHaveBeenCalledWith("❌ Error initializing Firebase Admin SDK:", "Parsing error");
  });
});