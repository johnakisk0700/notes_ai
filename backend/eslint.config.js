import js from "@eslint/js";
import globals from "globals";
import unusedImports from "eslint-plugin-unused-imports";
import prettier from "eslint-config-prettier";
import tseslint from "typescript-eslint";

// Backend is Express-on-Bun (Node-flavored, no React). Mirrors the frontend's
// auto-fixing rules: dead-import removal + `import type` enforcement.
export default tseslint.config(
  { ignores: ["dist"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.ts"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.node, Bun: "readonly" },
    },
    plugins: {
      "unused-imports": unusedImports,
    },
    rules: {
      // Auto-remove dead imports on --fix; unused vars are a warning (never
      // auto-deleted). Prefix intentionally-unused names with `_`.
      "@typescript-eslint/no-unused-vars": "off",
      "unused-imports/no-unused-imports": "error",
      "unused-imports/no-unused-vars": [
        "warn",
        { vars: "all", varsIgnorePattern: "^_", args: "after-used", argsIgnorePattern: "^_" },
      ],
      // Enforce `import type { … }`; fully auto-fixable.
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "separate-type-imports" },
      ],
      // Express handlers are intentionally loosely typed (req/res) and the
      // tsconfig sets noImplicitAny:false — don't block lint on explicit any.
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  // Must be last: defer formatting to Prettier.
  prettier
);
