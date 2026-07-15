export default [
  {
    files: ["public/**/*.js", "test/**/*.js", "tests/**/*.js", "*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { document: "readonly", URL: "readonly" }
    },
    rules: {
      "no-unused-vars": "error",
      "no-undef": "error",
      semi: ["error", "always"],
      quotes: ["error", "double"]
    }
  }
];
