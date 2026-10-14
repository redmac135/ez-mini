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
	const config = parseToml(wrangler);

	assert.equal(parseEnv(developmentEnv).PUBLIC_EZ_API_URL, 'http://localhost:1350/v1');
	assert.equal(parseEnv(productionEnv).PUBLIC_EZ_API_URL, 'https://mini.api.ethanzhao.ca/v1');
	assert.equal(config.vars, undefined);
	assert.equal(config.env?.preview?.vars, undefined);
	assert.equal(config.preview_urls, undefined);
});

test('ez-journey build modes include the shared API URL', async () => {
	const developmentEnv = await readFile(
		new URL('../apps/ez-journey/.env.development', import.meta.url),
		'utf8'
	);
	const productionEnv = await readFile(
		new URL('../apps/ez-journey/.env.production', import.meta.url),
		'utf8'
	);
	const exampleEnv = await readFile(
		new URL('../apps/ez-journey/.env.example', import.meta.url),
		'utf8'
	);

	assert.equal(parseEnv(developmentEnv).PUBLIC_EZ_API_URL, 'http://localhost:1350/v1');
	assert.equal(parseEnv(productionEnv).PUBLIC_EZ_API_URL, 'https://mini.api.ethanzhao.ca/v1');
	assert.equal(parseEnv(exampleEnv).PUBLIC_EZ_API_URL, 'http://localhost:1350/v1');
});

function parseEnv(source) {
	const values = {};
	for (const line of source.split(/\r?\n/)) {
		const assignment = line.trim().match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
		if (!assignment) continue;
		const [, key, rawValue] = assignment;
		const value = rawValue.trim();
		values[key] =
			(value.startsWith('"') && value.endsWith('"')) ||
			(value.startsWith("'") && value.endsWith("'"))
				? value.slice(1, -1)
				: value.replace(/\s+#.*$/, '').trim();
	}
	return values;
}

function parseToml(source) {
	const root = {};
	let current = root;
	for (const sourceLine of source.split(/\r?\n/)) {
		const line = stripTomlComment(sourceLine).trim();
		if (!line) continue;
		const table = line.match(/^\[([A-Za-z0-9_.-]+)\]$/);
		if (table) {
			current = root;
			for (const segment of table[1].split('.')) {
				current[segment] ??= {};
				current = current[segment];
			}
			continue;
		}
		const assignment = line.match(/^([A-Za-z0-9_-]+)\s*=\s*(.*?)\s*$/);
		if (!assignment) throw new Error(`Unsupported TOML configuration line: ${line}`);
		current[assignment[1]] = parseTomlValue(assignment[2]);
	}
	return root;
}

function stripTomlComment(line) {
	let quote = null;
	for (let index = 0; index < line.length; index += 1) {
		const char = line[index];
		if (quote) {
			if (char === quote && line[index - 1] !== '\\') quote = null;
		} else if (char === '"' || char === "'") {
			quote = char;
		} else if (char === '#') {
			return line.slice(0, index);
		}
	}
	return line;
}

function parseTomlValue(value) {
	if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
		return value.slice(1, -1);
	}
	if (value === 'true') return true;
	if (value === 'false') return false;
	if (/^-?\d+(?:\.\d+)?$/.test(value)) return Number(value);
	return value;
}
