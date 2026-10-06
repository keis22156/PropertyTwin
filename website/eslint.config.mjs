import js from '@eslint/js';
import globals from 'globals';
export default [
 {ignores:['node_modules/**','data/**','verification/**','public/app.js']},
 js.configs.recommended,
 {files:['**/*.mjs'],languageOptions:{globals:globals.node}},
 {files:['public/*.js'],languageOptions:{globals:globals.browser}},
 {rules:{'no-unused-vars':['error',{argsIgnorePattern:'^_',varsIgnorePattern:'^_',caughtErrors:'none',ignoreRestSiblings:true}]}}
];
