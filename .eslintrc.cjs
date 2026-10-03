// Configuration ESLint (ajoutée avec l'espace de vente v2 : `npm run lint`
// n'avait aucune configuration et échouait avant même d'analyser le code).
//
// Code v2 (src/**/v2/**) : règles complètes, zéro avertissement.
// Code existant : seulement les règles des hooks (vrais bogues). Le reste
// (227 remarques, surtout des apostrophes dans le JSX) sera nettoyé à part,
// pour ne pas toucher aux fichiers existants dans cette branche.
const V2 = ['src/**/v2/**/*.{js,jsx}']

module.exports = {
  root: true,
  env: { browser: true, es2022: true, node: true },
  ignorePatterns: [
    // MetaAds.jsx mélange avertissements et directives de désactivation : exclu
    // tant qu'il n'est pas nettoyé (voir docs/V2-DECISIONS.md).
    'src/pages/MetaAds.jsx',
    'dist', 'node_modules', 'supabase/functions', 'scripts/baseline', 'scripts/audit'],
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true } },
  settings: { react: { version: '18.2' } },
  plugins: ['react', 'react-hooks', 'react-refresh'],
  rules: {
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'warn',
  },
  overrides: [
    {
      // Fichiers existants qui ont déjà des dépendances de hooks incomplètes
      // (comportement voulu ou à revoir à part) : pas d'avertissement ici.
      files: [
        'src/components/performance/tabs/ScenarioTab.jsx',
        'src/features/social/analyse/AnalyseView.jsx',
        'src/hooks/useCareerPlan.js',
        'src/hooks/useCloserData.js',
        'src/hooks/useSchedule.js',
        'src/pages/Dashboard.jsx',
        'src/pages/MembreDossier.jsx',
        'src/pages/Parametres.jsx',
      ],
      rules: { 'react-hooks/exhaustive-deps': 'off' },
    },
    {
      files: V2,
      extends: [
        'eslint:recommended',
        'plugin:react/recommended',
        'plugin:react/jsx-runtime',
        'plugin:react-hooks/recommended',
      ],
      rules: {
        'react/prop-types': 'off',
        'react/no-unescaped-entities': 'off',
      },
    },
  ],
}
