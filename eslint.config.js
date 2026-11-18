import js from '@eslint/js'
import stylex from '@stylexjs/eslint-plugin'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommendedTypeChecked,
      react.configs.flat.recommended,
      react.configs.flat['jsx-runtime'],
      reactHooks.configs.flat.recommended,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    settings: { react: { version: 'detect' } },
    plugins: { '@stylexjs': stylex },
    rules: {
      // TanStack Router's control flow is thrown: redirect() and notFound().
      '@typescript-eslint/only-throw-error': [
        'error',
        {
          allow: [
            { from: 'package', package: '@tanstack/router-core', name: 'Redirect' },
            {
              from: 'package',
              package: '@tanstack/router-core',
              name: 'NotFoundError',
            },
          ],
        },
      ],
      // Every style is StyleX (spec: Styling).
      '@stylexjs/valid-styles': 'error',
      '@stylexjs/valid-shorthands': 'error',
      '@stylexjs/no-unused': 'error',
      '@stylexjs/no-legacy-contextual-styles': 'error',
      '@stylexjs/no-lookahead-selectors': 'error',
      '@stylexjs/no-conflicting-props': 'error',
      '@stylexjs/enforce-extension': 'error',
      // No stylesheets except MapLibre's, which styles DOM StyleX can't reach,
      // and src/stylex.css, the empty file StyleX's output is appended to.
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '*.css',
                '!maplibre-gl/dist/maplibre-gl.css',
                '!./stylex.css',
              ],
              message:
                'Styles are StyleX. The only CSS imports allowed are maplibre-gl/dist/maplibre-gl.css and src/stylex.css.',
            },
          ],
        },
      ],
      // Styling only comes from stylex.props.
      'react/forbid-dom-props': [
        'error',
        { forbid: ['style', 'className'] },
      ],
      'react/forbid-component-props': [
        'error',
        { forbid: ['style', 'className'] },
      ],
    },
  },
)
