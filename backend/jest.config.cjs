module.exports = {
  testEnvironment: "node",
  testMatch: [
    "**/__tests__/**/*.js",
    "**/?(*.)+(spec|test).js"
  ],
  extensionsToTreatAsEsm: [],
  moduleNameMapper: {
    '^(.+)\\.js$': '$1',
  },
  transform: {}, // disable babel-jest
  collectCoverage: true,
  collectCoverageFrom: [
    "controllers/**/*.js",
    "routes/**/*.js",
    "models/**/*.js",
    "services/**/*.js",
    "middleware/**/*.js",
    "utils/**/*.js"
  ],
  coverageThreshold: {
    global: {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90
    }
  }
};
