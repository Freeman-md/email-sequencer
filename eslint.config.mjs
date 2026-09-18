import { readdirSync } from 'node:fs';

import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

const features = readdirSync(new URL('./src/features/', import.meta.url), {
  withFileTypes: true,
})
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  { rules: { '@typescript-eslint/consistent-type-imports': 'error' } },
  {
    files: [
      'src/features/**/*.{ts,tsx}',
      'src/infrastructure/**/*.ts',
      'src/modules/**/*.ts',
      'src/app/components/**/*.tsx',
      'tests/modules/**/*.test.ts',
      'src/app/api/**/*.ts',
      'src/app/page.tsx',
      'tests/features/**/*.test.ts',
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

  ...features.map((feature) => ({
    files: [`src/features/${feature}/**/*.{ts,tsx}`],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: features
                .filter((other) => other !== feature)
                .flatMap((other) => [
                  `@/features/${other}`,
                  `@/features/${other}/**`,
                  `**/${other}`,
                  `**/${other}/**`,
                  `!@/modules/outreach/${other}`,
                  `!@/modules/outreach/${other}/**`,
                ]),
              message:
                'Compose features in the app layer; do not import another feature.',
            },
            {
              group: [
                '@/modules/outreach/**/airtable/**',
                '**/modules/outreach/**/airtable/**',
              ],
              message:
                'Use outreach contracts and its server composition entry point.',
            },
          ],
        },
      ],
    },
  })),
  {
    files: ['src/modules/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@/features/**',
                '**/features/**',
                '@/app/**',
                '**/app/**',
              ],
              message:
                'Domain modules must not depend on features or app composition.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/infrastructure/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@/features/**',
                '**/features/**',
                '@/modules/**',
                '**/modules/**',
                '@/app/**',
                '**/app/**',
              ],
              message:
                'Infrastructure must not depend on application or outreach modules.',
            },
          ],
        },
      ],
    },
  },
  globalIgnores(['.next/**', '.data/**', 'next-env.d.ts', 'test-results/**']),
]);
