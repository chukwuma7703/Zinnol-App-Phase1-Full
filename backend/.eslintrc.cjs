module.exports = {
    env: {
      node: true,
      es2021: true,
      k6: true,
    },
    extends: ["eslint:recommended", "google", "prettier"],
    parserOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
    },
    rules: {
      "no-unused-vars": ["warn", { "argsIgnorePattern": "^_", "varsIgnorePattern": "^_" }],
      "no-empty": "warn",
      "require-jsdoc": "off",
    },
  };
  