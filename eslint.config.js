// Verificação estática: variáveis não declaradas, imports sem uso e erros comuns.
import globals from 'globals';

export default [
  {ignores: ['js/vendor/**']},
  {
    files: ['js/**/*.js'],
    languageOptions: {ecmaVersion: 2022, sourceType: 'module', globals: {...globals.browser}},
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['error', {args: 'none', caughtErrors: 'none'}],
      'no-redeclare': 'error',
      'no-dupe-keys': 'error',
      'no-unreachable': 'error',
      'eqeqeq': ['error', 'smart']
    }
  },
  {
    files: ['tests/**/*.js', 'tools/**/*.js', 'supabase/**/*.js'],
    languageOptions: {ecmaVersion: 2022, sourceType: 'module', globals: {...globals.node, ...globals.browser}},
    rules: {'no-undef': 'error', 'no-unused-vars': ['error', {args: 'none', caughtErrors: 'none'}]}
  }
];
