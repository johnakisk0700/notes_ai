import js from "@eslint/js";
import globals from "globals";
import unusedImports from "eslint-plugin-unused-imports";
import prettier from "eslint-config-prettier";
import tseslint from "typescript-eslint";

// Shared Drizzle schema + DTOs/types. Same auto-fixing rules as backend; the
// `consistent-type-imports` rule keeps `verbatimModuleSyntax` (used by the
// frontend tsconfig that pulls these files in) satisfied.
export default tseslint.config(
  { ignores: ["dist", "drizzle"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.ts"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: globals.node,
    },
    plugins: {
      "unused-imports": unusedImports,
    },
    rules: {
      "@typescript-eslint/no-unused-vars": "off",
      "unused-imports/no-unused-imports": "error",
      "unused-imports/no-unused-vars": [
        "warn",
        { vars: "all", varsIgnorePattern: "^_", args: "after-used", argsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "separate-type-imports" },
      ],
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  prettier
);
