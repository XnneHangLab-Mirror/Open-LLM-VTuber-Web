module.exports = {
  extends: [
    '@electron-toolkit/eslint-config-ts',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
    'plugin:import/recommended',
    'plugin:import/typescript',
  ],
  plugins: ['react', 'jsx-a11y'],
  settings: {
    react: {
      version: 'detect',
    },
  },
  rules: {
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-unused-vars': 'off',
    'no-console': 'off',
    'react/react-in-jsx-scope': 'off',
    'react/display-name': 'off',
    'react/require-default-props': 'off',
    'react/prop-types': 'off',
    'react-hooks/exhaustive-deps': 'off',
    'import/no-unresolved': 'off',
    'import/namespace': 'off',
    'import/no-named-as-default-member': 'off',
    'import/no-extraneous-dependencies': ['error', { devDependencies: true }],
  },
};
