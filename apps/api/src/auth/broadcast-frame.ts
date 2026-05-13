import type { Env } from '../types.ts';

export function authBroadcastFrame(env: Env) {
	const allowedOrigins = getAllowedOrigins(env);
	const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>ez auth relay</title>
</head>
<body>
<script>
const allowedOrigins = new Set(${JSON.stringify(allowedOrigins)});
const channel = new BroadcastChannel('ez-auth-relay');
channel.onmessage = (event) => {
	parent.postMessage({ source: 'ez-auth-relay', message: event.data }, '*');
};
window.addEventListener('message', (event) => {
	if (!allowedOrigins.has(event.origin)) return;
	const data = event.data;
	if (!data || data.source !== 'ez-auth-relay' || !data.message) return;
	channel.postMessage(data.message);
});
</script>
</body>
</html>`;
	const headers = new Headers({
		'content-type': 'text/html; charset=utf-8',
		'cache-control': 'no-store'
	});
	if (allowedOrigins.length > 0) {
		headers.set('content-security-policy', `frame-ancestors ${allowedOrigins.join(' ')}`);
	}

	return new Response(html, { headers });
}

function getAllowedOrigins(env: Env) {
	return (env.CORS_ORIGINS ?? '')
		.split(',')
		.map((origin) => origin.trim())
		.filter(Boolean);
}
