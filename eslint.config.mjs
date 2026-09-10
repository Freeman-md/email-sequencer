import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  { rules: { '@typescript-eslint/consistent-type-imports': 'error' } },
  globalIgnores(['.next/**', '.data/**', 'next-env.d.ts', 'test-results/**']),
]);
