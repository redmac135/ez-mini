import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const roots = ['apps', 'packages'];

test('workspace env examples use .env.example naming', async () => {
	const envFiles = [];
	for (const root of roots) {
		for (const workspace of await readdir(new URL(`../${root}`, import.meta.url))) {
			const workspacePath = join(root, workspace);
			for (const file of await readdir(new URL(`../${workspacePath}`, import.meta.url))) {
				if (file.includes('env') || file.includes('vars')) {
					envFiles.push(`${workspacePath}/${file}`);
				}
			}
		}
	}

	assert.equal(envFiles.includes('apps/api/example.env'), false);
	assert.equal(envFiles.includes('packages/auth/example.env'), false);
	assert.equal(envFiles.includes('apps/api/.env.example'), true);
	assert.equal(envFiles.includes('apps/ez-blank/.env.example'), true);
	assert.equal(envFiles.includes('packages/auth/.env.example'), true);
	assert.equal(envFiles.includes('apps/api/.dev.vars.example'), true);
});

test('ez-blank build modes include public API URLs from dotenv', async () => {
	const developmentEnv = await readFile(
		new URL('../apps/ez-blank/.env.development', import.meta.url),
		'utf8'
	);
	const productionEnv = await readFile(
		new URL('../apps/ez-blank/.env.production', import.meta.url),
		'utf8'
	);
	const wrangler = await readFile(
		new URL('../apps/ez-blank/wrangler.toml', import.meta.url),
		'utf8'
	);

	assert.match(developmentEnv, /PUBLIC_EZ_API_URL=http:\/\/localhost:8787\/v1/);
	assert.match(productionEnv, /PUBLIC_EZ_API_URL=https:\/\/mini\.api\.ethanzhao\.ca\/v1/);
	assert.equal(wrangler.includes('PUBLIC_EZ_API_URL'), false);
	assert.equal(wrangler.includes('[vars]'), false);
	assert.equal(wrangler.includes('preview_urls'), false);
});
