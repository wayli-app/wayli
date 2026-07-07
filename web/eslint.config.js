import prettier from 'eslint-config-prettier';
import js from '@eslint/js';
import { includeIgnoreFile } from '@eslint/compat';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import { fileURLToPath } from 'node:url';
import ts from 'typescript-eslint';
import svelteConfig from './svelte.config.js';

const gitignorePath = fileURLToPath(new URL('./.gitignore', import.meta.url));

export default ts.config(
	includeIgnoreFile(gitignorePath),
	js.configs.recommended,
	...ts.configs.recommended,
	...svelte.configs.recommended,
	prettier,
	...svelte.configs.prettier,
	{
		languageOptions: {
			globals: { ...globals.browser, ...globals.node }
		},
		rules: {
			'no-undef': 'off',
			// Enable type safety rules as warnings to track technical debt
			// Goal: Convert to 'error' once all violations are fixed
			'@typescript-eslint/no-explicit-any': 'warn',
			'@typescript-eslint/no-unused-vars': [
				'warn',
				{
					argsIgnorePattern: '^_',
					varsIgnorePattern: '^_',
					caughtErrorsIgnorePattern: '^_'
				}
			],
			// Svelte 5 migration rules — track as warnings until violations are resolved
			// Goal: Convert to 'error' once the Svelte 5 migration is complete
			'svelte/no-navigation-without-resolve': 'warn',
			'svelte/require-each-key': 'warn',
			'svelte/no-unused-props': 'warn',
			'svelte/prefer-svelte-reactivity': 'warn',
			'svelte/no-unused-svelte-ignore': 'warn',
			// {@html} is used with DOMPurify-sanitized renderMarkdown output; track as warning
			'svelte/no-at-html-tags': 'warn'
		}
	},
	{
		files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
		languageOptions: {
			parserOptions: {
				projectService: true,
				extraFileExtensions: ['.svelte'],
				parser: ts.parser,
				svelteConfig
			}
		}
	}
);
