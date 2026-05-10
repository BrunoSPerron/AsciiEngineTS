import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default [
  // Ignore output folders
  {
    ignores: ['dist/**', 'build/**', 'coverage/**', 'node_modules/**'],
  },

  // Base JS rules
  js.configs.recommended,

  // TypeScript recommended rules
  ...tseslint.configs.recommendedTypeChecked,

  // Your project rules
  {
    files: ['**/*.ts'],

    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },

    rules: {
      // Correctness
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',

      // Cleanliness
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],

      // Discipline
      eqeqeq: ['error', 'always'],
      curly: ['error', 'multi-line'],
      'brace-style': ['error', '1tbs'],

      // Practical
      'no-console': 'warn',
      'no-undef': 'off',
    },
  },

  // Disable type-aware linting for JS config files
  {
    files: ['**/*.js'],
    ...tseslint.configs.disableTypeChecked,
  },
]
