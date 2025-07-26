const { join } = require('path');

module.exports = {
  root: true,
  extends: '@arcblock/eslint-config-ts',
  parserOptions: {
    project: [
      join(__dirname, 'tsconfig.eslint.json'),
      join(__dirname, 'blocklets/core/tsconfig.json'),
      join(__dirname, 'packages/ai-kit/tsconfig.json'),
    ],
  },
  globals: {
    logger: true,
  },
  rules: {
    '@typescript-eslint/no-use-before-define': 'off',
    '@typescript-eslint/no-shadow': 'off',
    '@typescript-eslint/indent': 'off',
    'no-return-assign': 'off',
    'no-nested-ternary': 'off',
    'no-await-in-loop': 'warn',
    'react-hooks/exhaustive-deps': 'warn',
    'react/no-array-index-key': 'warn',
    'jsx-a11y/no-noninteractive-element-interactions': 'off',
    '@typescript-eslint/no-loop-func': 'off',
    'max-classes-per-file': 'off',
    'unicorn/filename-case': 'off',
    'import/prefer-default-export': 'off',
    '@typescript-eslint/comma-dangle': 'off',
    'require-await': 'off',
    'react/require-default-props': [
      'error',
      {
        functions: 'defaultArguments',
      },
    ],
  },
};
