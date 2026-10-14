import { mkdir, readdir, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { build } from 'esbuild';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outdir = resolve(root, '.test-dist');
const tests = (await readdir(resolve(root, 'tests')))
	.filter((name) => name.endsWith('.test.ts'))
	.sort();
await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });
for (const name of tests) {
	await build({
		entryPoints: [resolve(root, 'tests', name)],
		outfile: resolve(outdir, name.replace(/\.ts$/, '.mjs')),
		bundle: true,
		format: 'esm',
		platform: 'node',
		target: 'node20'
	});
}
await new Promise((resolvePromise, reject) => {
	const child = spawn(
		process.execPath,
		['--test', ...tests.map((name) => resolve(outdir, name.replace(/\.ts$/, '.mjs')))],
		{ cwd: root, stdio: 'inherit' }
	);
	child.on('exit', (code) =>
		code === 0
			? resolvePromise()
			: reject(new Error(`Journey tests failed with exit code ${code ?? 'unknown'}`))
	);
	child.on('error', reject);
});
