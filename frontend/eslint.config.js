import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import unusedImports from 'eslint-plugin-unused-imports'
import prettier from 'eslint-config-prettier'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      'unused-imports': unusedImports,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      // Auto-remove dead imports on `--fix`. Unused *variables* are only a
      // warning and are never auto-deleted: this codebase keeps intentionally
      // half-wired symbols, so removing them is a human decision. Prefix with
      // `_` to silence intentionally-unused names.
      '@typescript-eslint/no-unused-vars': 'off',
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': [
        'warn',
        { vars: 'all', varsIgnorePattern: '^_', args: 'after-used', argsIgnorePattern: '^_' },
      ],
      // Enforce `import type { … }` so `verbatimModuleSyntax` stays satisfied.
      // Fully auto-fixable via `--fix`.
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'separate-type-imports' },
      ],
      // React Hooks v7 bundles the React-Compiler correctness rules. They flag
      // pervasive existing patterns (fetch-on-mount setState, debounced
      // callbacks) and are NOT auto-fixable, so as errors they'd keep lint
      // permanently red. Keep them visible as warnings; promote back to 'error'
      // once the backlog is worked through.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/use-memo': 'warn',
    },
  },
  // Must be last: turns off ESLint rules that would fight Prettier formatting.
  prettier,
)
