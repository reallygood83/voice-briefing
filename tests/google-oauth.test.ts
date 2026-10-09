import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import { describe, it } from 'node:test';
import { GoogleOAuthFlow } from '../src/cloud/google-oauth-flow';
import {
	base64UrlEncode,
	buildAuthorizationUrl,
	generateCodeChallenge,
	generateCodeVerifier,
	isTokenExpired,
	parseTokenResponse
} from '../src/cloud/oauth-protocol';

function getResponse(url: string): Promise<{ status: number; body: string }> {
	return new Promise((resolve, reject) => {
		const req = httpRequest(url, (res) => {
			const chunks: Buffer[] = [];
			res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
			res.on('end', () => resolve({
				status: res.statusCode || 0,
				body: Buffer.concat(chunks).toString('utf8')
			}));
		});
		req.on('error', reject);
		req.end();
	});
}

function get(url: string): Promise<string> {
	return getResponse(url).then((response) => response.body);
}

describe('OAuth protocol', () => {
	it('builds a loopback PKCE URL without the client secret', async () => {
		const verifier = generateCodeVerifier();
		const challenge = await generateCodeChallenge(verifier);
		const expected = base64UrlEncode(createHash('sha256').update(verifier).digest());
		assert.equal(challenge, expected);

		const authUrl = buildAuthorizationUrl({
			clientId: 'desktop-client.apps.googleusercontent.com',
			redirectUri: 'http://127.0.0.1:8585/callback',
			codeChallenge: challenge
		});
		const parsed = new URL(authUrl);
		assert.equal(parsed.origin, 'https://accounts.google.com');
		assert.equal(parsed.searchParams.get('code_challenge_method'), 'S256');
		assert.equal(parsed.searchParams.get('code_challenge'), challenge);
		assert.equal(parsed.searchParams.get('access_type'), 'offline');
		assert.equal(parsed.searchParams.get('prompt'), 'consent');
		assert.equal(parsed.searchParams.get('redirect_uri'), 'http://127.0.0.1:8585/callback');
		assert.equal(parsed.searchParams.get('client_secret'), null);
		assert.match(parsed.searchParams.get('scope') || '', /drive\.file/);
	});

	it('keeps the refresh token across a one-hour access-token refresh', () => {
		const now = 1_700_000_000_000;
		const tokens = parseTokenResponse({
			access_token: 'ya29.new-access',
			expires_in: 3600
		}, now, '1//stored-refresh');
		assert.equal(tokens.accessToken, 'ya29.new-access');
		assert.equal(tokens.refreshToken, '1//stored-refresh');
		assert.equal(tokens.expiresAt, now + 3600 * 1000);
		assert.equal(isTokenExpired(tokens.expiresAt, now), false);
		assert.equal(isTokenExpired(tokens.expiresAt, now + 3600 * 1000 - 4 * 60 * 1000), true);
	});
});

describe('loopback OAuth flow', () => {
	it('exchanges the callback code and never logs the tokens', async () => {
		const logs: string[] = [];
		let seenBody: URLSearchParams | undefined;
		let resolveReady: (info: { port: number; authUrl: string }) => void = () => undefined;
		const readyPromise = new Promise<{ port: number; authUrl: string }>((resolve) => {
			resolveReady = resolve;
		});
		const flow = new GoogleOAuthFlow({
			clientId: 'desktop-client.apps.googleusercontent.com',
			clientSecret: 'GOCSPX-test-secret',
			redirectPort: 0,
			timeoutMs: 5000
		}, {
			log: (message) => logs.push(message),
			openExternal: () => undefined,
			now: () => 1_700_000_000_000,
			onReady: (info) => resolveReady(info),
			requestToken: async (body) => {
				seenBody = body;
				return {
					status: 200,
					data: {
						access_token: 'ya29.ACCESS-TOKEN',
						refresh_token: '1//REFRESH-TOKEN',
						expires_in: 3600
					}
				};
			}
		});

		const pending = flow.startOAuthFlow();
		const ready = await readyPromise;
		const port = ready.port;
		assert.ok(port > 0);

		const favicon = await getResponse(`http://127.0.0.1:${port}/favicon.ico`);
		assert.equal(favicon.status, 204);

		const page = await get(`http://127.0.0.1:${port}/callback?code=auth-code`);
		const tokens = await pending;
		const faviconAfter = await getResponse(`http://127.0.0.1:${port}/favicon.ico`);

		assert.equal(faviconAfter.status, 204);
		assert.match(page, /Successfully connected/);
		assert.match(page, /rel="icon" href="data:,"/);
		assert.equal(tokens.accessToken, 'ya29.ACCESS-TOKEN');
		assert.equal(tokens.refreshToken, '1//REFRESH-TOKEN');
		assert.equal(seenBody?.get('grant_type'), 'authorization_code');
		assert.equal(seenBody?.get('code'), 'auth-code');
		assert.equal(seenBody?.get('client_secret'), 'GOCSPX-test-secret');
		assert.ok(seenBody?.get('code_verifier'));
		assert.equal(seenBody?.get('redirect_uri'), `http://127.0.0.1:${port}/callback`);

		const logged = logs.join('\n');
		assert.equal(logged.includes('ya29.ACCESS-TOKEN'), false);
		assert.equal(logged.includes('1//REFRESH-TOKEN'), false);
		assert.equal(logged.includes('GOCSPX-test-secret'), false);
		assert.match(new URL(ready.authUrl || buildAuthorizationUrl({
			clientId: 'desktop-client.apps.googleusercontent.com',
			redirectUri: `http://127.0.0.1:${port}/callback`,
			codeChallenge: 'x'
		})).searchParams.get('redirect_uri') || '', /127\.0\.0\.1/);
	});

	it('escapes an error from the provider and does not keep the timeout rejection', async () => {
		const flow = new GoogleOAuthFlow({
			clientId: 'client',
			clientSecret: 'secret',
			redirectPort: 0,
			timeoutMs: 4000
		}, {
			openExternal: () => undefined,
			requestToken: async () => ({ status: 200, data: {} })
		});

		const pending = flow.startOAuthFlow();
		const assertion = assert.rejects(pending, /OAuth error/);
		const port = await new Promise<number>((resolve) => {
			const started = Date.now();
			const timer = setInterval(() => {
				const server = (flow as any).server;
				const address = server?.address?.();
				if (address && typeof address === 'object') {
					clearInterval(timer);
					resolve(address.port);
				} else if (Date.now() - started > 2000) {
					clearInterval(timer);
					resolve(0);
				}
			}, 10);
		});
		assert.ok(port > 0);

		const page = await get(`http://127.0.0.1:${port}/callback?error=${encodeURIComponent('<script>alert(1)</script>')}`);
		assert.match(page, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
		assert.equal(page.includes('<script>alert(1)</script>'), false);
		await assertion;
	});

	it('refreshes with the stored refresh token and does not log it', async () => {
		let seen: URLSearchParams | undefined;
		const logs: string[] = [];
		const flow = new GoogleOAuthFlow({
			clientId: 'client',
			clientSecret: 'secret',
			redirectPort: 0
		}, {
			log: (message) => logs.push(message),
			now: () => 50_000,
			requestToken: async (body) => {
				seen = body;
				return {
					status: 200,
					data: { access_token: 'ya29.refreshed', expires_in: 3600 }
				};
			}
		});

		const tokens = await flow.refreshAccessToken('1//REFRESH-TOKEN');
		assert.equal(seen?.get('grant_type'), 'refresh_token');
		assert.equal(seen?.get('refresh_token'), '1//REFRESH-TOKEN');
		assert.equal(tokens.accessToken, 'ya29.refreshed');
		assert.equal(tokens.refreshToken, '1//REFRESH-TOKEN');
		assert.equal(logs.join('').includes('1//REFRESH-TOKEN'), false);
	});
});
