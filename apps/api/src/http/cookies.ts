import type { Env } from '../types.ts';

const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 90;

export function parseCookies(header: string | null) {
	const cookies = new Map<string, string>();
	if (!header) {
		return cookies;
	}

	for (const part of header.split(';')) {
		const [name, ...valueParts] = part.trim().split('=');
		if (!name) {
			continue;
		}
		cookies.set(name, decodeURIComponent(valueParts.join('=')));
	}

	return cookies;
}

export function setCookie(headers: Headers, name: string, value: string, env: Env) {
	const parts = [
		`${name}=${encodeURIComponent(value)}`,
		'Path=/',
		'HttpOnly',
		'SameSite=Lax',
		`Max-Age=${COOKIE_MAX_AGE_SECONDS}`
	];
	if (env.COOKIE_DOMAIN) {
		parts.push(`Domain=${env.COOKIE_DOMAIN}`);
		parts.push('Secure');
	}

	headers.append('set-cookie', parts.join('; '));
}

export function clearCookie(headers: Headers, name: string, env: Env) {
	const parts = [`${name}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
	if (env.COOKIE_DOMAIN) {
		parts.push(`Domain=${env.COOKIE_DOMAIN}`);
		parts.push('Secure');
	}

	headers.append('set-cookie', parts.join('; '));
}
