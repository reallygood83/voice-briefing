import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';

await build({
	entryPoints: [
		'tests/briefing-audio.test.ts',
		'tests/model-migration.test.ts',
		'tests/google-oauth.test.ts',
		'tests/settings-form.test.ts'
	],
	bundle: true,
	platform: 'node',
	format: 'cjs',
	outdir: 'tests-dist',
	external: ['axios', 'electron'],
	alias: {
		obsidian: './tests/shims/obsidian.js'
	},
	banner: {
		js: 'if (typeof window === "undefined") { global.window = global; }'
	},
	logLevel: 'warning'
});

const files = readdirSync('tests-dist').filter((name) => name.endsWith('.test.js'));
const result = spawnSync(process.execPath, ['--test', ...files.map((name) => `tests-dist/${name}`)], {
	stdio: 'inherit'
});
process.exit(result.status ?? 1);
