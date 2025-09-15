// Modern ESLint flat config for TypeScript (ESLint v9+)
// Using CommonJS syntax to align with tsconfig.json's "module": "commonjs"
const tseslint = require('@typescript-eslint/eslint-plugin');
const tsParser = require('@typescript-eslint/parser');

module.exports = [
  {
    // Add all ignore patterns here, taken from .eslintignore
    ignores: [
      "node_modules/",
      "dist/",
      ".cache/",
      "output/",
      "src/generated/",
      "*.js", // This config itself is a .js file, so we ignore it here
    ]
  },
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: "./tsconfig.json",
        sourceType: "module",
        ecmaVersion: 2022,
      },
    },
    plugins: {
      "@typescript-eslint": tseslint,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      "@typescript-eslint/no-unused-vars": "error", // Changed from default to error
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/no-explicit-any": "warn"
    },
  }
];