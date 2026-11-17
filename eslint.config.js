import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  // .claude/worktrees: other sessions' checkouts of this repo; linting them from here also makes
  // typescript-eslint see several tsconfig roots and fail on every file.
  { ignores: ['dist', 'node_modules', 'coverage', 'public/spikes', 'public/vendor', 'spike-samples', 'test-results-e2e', 'playwright-report', '.claude/worktrees'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx,js,mjs}'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
)
