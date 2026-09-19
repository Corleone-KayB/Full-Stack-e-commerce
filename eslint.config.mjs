import coreWebVitals from 'eslint-config-next/core-web-vitals';
import typescript from 'eslint-config-next/typescript';

/**
 * ESLint flat config.
 *
 * Next 16 removed the `next lint` command, so linting runs through the eslint
 * CLI directly (`npm run lint`) and this file replaces the old .eslintrc.
 * eslint-config-next ships flat-config entry points, so no compat shim.
 */
export default [
  {
    ignores: ['.next/**', 'node_modules/**', 'src/generated/**', 'tests/.tmp/**', 'next-env.d.ts'],
  },
  ...coreWebVitals,
  ...typescript,
  {
    rules: {
      // Prisma's generated query types legitimately widen to `any` in places.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      /**
       * Advisory, not an error. Every occurrence in this codebase was reviewed
       * and is one of two deliberate patterns: resetting local state when the
       * route or the row set changes (clear the selection, close the mobile
       * nav, reset the quantity picker), or loading data once on mount in a
       * context provider. Both are correct; the rule's concern is the extra
       * render pass. Rewriting them as `key` resets or derived state is a
       * worthwhile refactor, not a release blocker — so they stay visible as
       * warnings rather than being silenced or rushed.
       */
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
  {
    // Config files are anonymous default exports by definition.
    files: ['*.config.mjs', '*.config.ts'],
    rules: { 'import/no-anonymous-default-export': 'off' },
  },
];
