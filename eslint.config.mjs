import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  { rules: { '@typescript-eslint/consistent-type-imports': 'error' } },
  {
    files: [
      'src/features/sequencer/**/*.{ts,tsx}',
      'src/infrastructure/**/*.ts',
      'src/app/api/**/*.ts',
      'src/app/page.tsx',
      'tests/features/sequencer/**/*.test.ts',
      'tests/infrastructure/**/*.test.ts',
    ],
    rules: {
      'import/order': [
        'error',
        {
          groups: [
            'builtin',
            'external',
            'internal',
            'parent',
            'sibling',
            'index',
            'type',
          ],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
      'import/newline-after-import': 'error',
      'lines-between-class-members': [
        'error',
        {
          enforce: [
            { blankLine: 'always', prev: '*', next: 'method' },
            { blankLine: 'always', prev: 'method', next: '*' },
          ],
        },
      ],
      'padding-line-between-statements': [
        'error',
        { blankLine: 'always', prev: '*', next: ['return', 'try'] },
        { blankLine: 'always', prev: ['const', 'let'], next: ['export'] },
      ],
    },
  },
  globalIgnores(['.next/**', '.data/**', 'next-env.d.ts', 'test-results/**']),
]);
