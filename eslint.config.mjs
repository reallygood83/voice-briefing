import obsidianmd from 'eslint-plugin-obsidianmd';
import tseslint from 'typescript-eslint';

const obsidianRules = {};
for (const block of obsidianmd.configs.recommended) {
	if (!block.rules) continue;
	for (const [name, value] of Object.entries(block.rules)) {
		if (name.startsWith('obsidianmd/')) obsidianRules[name] = value;
	}
}

// The LICENSE file is the author's All Rights Reserved text. Do not rewrite it.
obsidianRules['obsidianmd/validate-license'] = 'off';

export default [
	{
		ignores: [
			'main.js',
			'tests-dist/**',
			'node_modules/**',
			'tests/**',
			'scripts/**',
			'esbuild.config.mjs',
			'version-bump.mjs'
		]
	},
	{
		files: ['**/*.{ts,js,mjs,cjs}'],
		plugins: { obsidianmd },
		languageOptions: {
			parser: tseslint.parser,
			parserOptions: {
				projectService: {
					allowDefaultProject: ['eslint.config.mjs']
				}
			}
		},
		rules: obsidianRules
	}
];
