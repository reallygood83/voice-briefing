import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';

await build({
	entryPoints: ['tests/briefing-audio.test.ts'],
	bundle: true,
	platform: 'node',
	format: 'cjs',
	outdir: 'tests-dist',
	external: ['axios', 'obsidian'],
	logLevel: 'warning'
});

const files = readdirSync('tests-dist').filter((name) => name.endsWith('.cjs'));
const result = spawnSync(process.execPath, ['--test', ...files.map((name) => `tests-dist/${name}`)], {
	stdio: 'inherit'
});
process.exit(result.status ?? 1);
