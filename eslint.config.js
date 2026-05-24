import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default [
  {
    ignores: [
      'packages/engine/dist/**',
      'dist/**',
      'build/**',
      'coverage/**',
      'node_modules/**',
      '**/vite.config.ts',
    ],
  },

  js.configs.recommended,

  ...tseslint.configs.recommendedTypeChecked,

  {
    files: ['packages/engine/**/*.ts'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: './packages/engine/tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      eqeqeq: ['error', 'always'],
      curly: ['error', 'multi-line'],
      'brace-style': ['error', '1tbs'],
      'no-console': 'warn',
      'no-undef': 'off',
    },
  },

  {
    files: ['packages/examples/**/*.ts'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: './packages/examples/tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      eqeqeq: ['error', 'always'],
      curly: ['error', 'multi-line'],
      'brace-style': ['error', '1tbs'],
      'no-console': 'warn',
      'no-undef': 'off',
    },
  },

  {
    files: ['**/*.js'],
    ...tseslint.configs.disableTypeChecked,
  },
]
