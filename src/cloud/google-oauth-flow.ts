import { Platform } from 'obsidian';
import { redactSecrets } from '../ai/extract-text';
import {
	GOOGLE_DRIVE_SCOPES,
	GOOGLE_TOKEN_URL,
	type OAuthTokens,
	buildAuthorizationUrl,
	escapeHtml,
	generateCodeChallengeWeb,
	generateCodeVerifier,
	isTokenExpired,
	parseTokenResponse
} from './oauth-protocol';

export interface OAuthConfig {
	clientId: string;
	clientSecret: string;
	redirectPort: number;
	timeoutMs?: number;
}

export interface TokenRequestResult {
	status: number;
	data: any;
}

export interface OAuthDependencies {
	requestToken: (body: URLSearchParams) => Promise<TokenRequestResult>;
	openExternal: (target: string) => void;
	now: () => number;
	log: (message: string) => void;
	onReady?: (info: { port: number; authUrl: string }) => void;
}

export type { OAuthTokens };

const DEFAULT_TIMEOUT_MS = 120000;

async function defaultRequestToken(body: URLSearchParams): Promise<TokenRequestResult> {
	const { requestUrl } = await import('obsidian');
	const response = await requestUrl({
		url: GOOGLE_TOKEN_URL,
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: body.toString(),
		throw: false
	});
	return { status: response.status, data: response.json };
}

function defaultOpenExternal(target: string): void {
	const { shell } = require('electron');
	shell.openExternal(target);
}

interface LoopbackResponse {
	writeHead(status: number, headers: Record<string, string>): void;
	end(body?: string): void;
}

interface LoopbackServer {
	closeAllConnections(): void;
	close(): void;
	listen(port: number, host: string, callback: () => void): void;
	on(event: 'error', listener: (err: NodeJS.ErrnoException) => void): void;
	address(): string | { port: number } | null;
}

export class GoogleOAuthFlow {
	private server: LoopbackServer | null = null;
	private readonly deps: OAuthDependencies;

	constructor(private config: OAuthConfig, deps: Partial<OAuthDependencies> = {}) {
		this.deps = {
			requestToken: deps.requestToken || defaultRequestToken,
			openExternal: deps.openExternal || defaultOpenExternal,
			now: deps.now || Date.now,
			log: deps.log || (() => undefined),
			onReady: deps.onReady
		};
	}

	/**
	 * Desktop loopback OAuth: listen on 127.0.0.1, open the browser, exchange the code with PKCE.
	 * https://developers.google.com/identity/protocols/oauth2/native-app
	 */
	startOAuthFlow(): Promise<OAuthTokens> {
		if (!Platform.isDesktop) {
			return Promise.reject(new Error('Google Drive sign-in requires the desktop app.'));
		}
		const http = require('http') as {
			createServer: (handler: (req: { url?: string }, res: LoopbackResponse) => void) => LoopbackServer;
		};
		const codeVerifier = generateCodeVerifier();
		let redirectUri = '';
		let settled = false;
		let timer = 0;

		return new Promise((resolve, reject) => {
			const finish = (action: () => void) => {
				if (settled) return;
				settled = true;
				window.clearTimeout(timer);
				this.cleanup();
				action();
			};

			this.server = http.createServer((req, res) => {
				const callbackUrl = new URL(req.url || '/', 'http://127.0.0.1');
				if (callbackUrl.pathname !== '/callback') {
					res.writeHead(404, { 'Content-Type': 'text/plain' });
					res.end('Not found');
					return;
				}

				const error = callbackUrl.searchParams.get('error') || '';
				const code = callbackUrl.searchParams.get('code') || '';

				if (error) {
					const safeError = redactSecrets(error);
					res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
					res.end(this.getErrorHtml(escapeHtml(safeError)));
					finish(() => reject(new Error(`OAuth error: ${safeError}`)));
					return;
				}

				if (!code) {
					res.writeHead(400, { 'Content-Type': 'text/plain' });
					res.end('Missing authorization code');
					return;
				}

				this.exchangeCodeForTokens(code, codeVerifier, redirectUri)
					.then((tokens) => {
						res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
						res.end(this.getSuccessHtml());
						finish(() => resolve(tokens));
					})
					.catch((tokenError: any) => {
						const message = redactSecrets(tokenError?.message || 'Token exchange failed');
						res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
						res.end(this.getErrorHtml(escapeHtml(message)));
						finish(() => reject(new Error(message)));
					});
			});

			this.server.on('error', (err: NodeJS.ErrnoException) => {
				const message = err.code === 'EADDRINUSE'
					? `Port ${this.config.redirectPort} is already in use. Close the other app using that port and try again.`
					: redactSecrets(err.message || 'OAuth callback server failed');
				finish(() => reject(new Error(message)));
			});

			this.server.listen(this.config.redirectPort, '127.0.0.1', () => {
				void (async () => {
					try {
						const address = this.server?.address();
						const port = typeof address === 'object' && address ? address.port : this.config.redirectPort;
						redirectUri = `http://127.0.0.1:${port}/callback`;
						const codeChallenge = await generateCodeChallengeWeb(codeVerifier);
						const authUrl = buildAuthorizationUrl({
							clientId: this.config.clientId,
							redirectUri,
							codeChallenge,
							scopes: GOOGLE_DRIVE_SCOPES
						});
						this.deps.log(`OAuth callback listening on 127.0.0.1:${port}`);
						this.deps.onReady?.({ port, authUrl });
						this.deps.openExternal(authUrl);
					} catch (openError: any) {
						finish(() => reject(new Error(redactSecrets(openError?.message || 'Could not open the browser'))));
					}
				})();
			});

			timer = window.setTimeout(() => {
				finish(() => reject(new Error('OAuth flow timed out. Please try again.')));
			}, this.config.timeoutMs ?? DEFAULT_TIMEOUT_MS);
		});
	}

	async refreshAccessToken(refreshToken: string): Promise<OAuthTokens> {
		const body = new URLSearchParams({
			client_id: this.config.clientId,
			refresh_token: refreshToken,
			grant_type: 'refresh_token'
		});
		if (this.config.clientSecret) {
			body.set('client_secret', this.config.clientSecret);
		}

		const response = await this.deps.requestToken(body);
		if (response.status !== 200) {
			throw new Error(`Token refresh failed (${response.status}). Reconnect Google Drive.`);
		}

		const tokens = parseTokenResponse(response.data, this.deps.now(), refreshToken);
		if (!tokens.refreshToken) {
			throw new Error('Token refresh did not return a usable refresh token. Reconnect Google Drive.');
		}
		return tokens;
	}

	isTokenExpired(expiresAt: number): boolean {
		return isTokenExpired(expiresAt, this.deps.now());
	}

	private async exchangeCodeForTokens(code: string, codeVerifier: string, redirectUri: string): Promise<OAuthTokens> {
		const body = new URLSearchParams({
			code,
			client_id: this.config.clientId,
			redirect_uri: redirectUri,
			grant_type: 'authorization_code',
			code_verifier: codeVerifier
		});
		if (this.config.clientSecret) {
			body.set('client_secret', this.config.clientSecret);
		}

		const response = await this.deps.requestToken(body);
		if (response.status !== 200) {
			throw new Error(`Token exchange failed (${response.status}). Check the OAuth client and redirect URI.`);
		}

		const tokens = parseTokenResponse(response.data, this.deps.now());
		if (!tokens.refreshToken) {
			throw new Error('Google did not return a refresh token. Remove Voice Briefing from your Google Account permissions and connect again.');
		}
		return tokens;
	}

	private cleanup(): void {
		if (!this.server) return;
		this.server.closeAllConnections();
		this.server.close();
		this.server = null;
	}

	private getSuccessHtml(): string {
		return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Google Drive Connected</title></head>
<body><h1>Successfully connected</h1><p>You can close this window and return to Obsidian.</p></body></html>`;
	}

	private getErrorHtml(safeError: string): string {
		return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Connection Failed</title></head>
<body><h1>Connection failed</h1><p>${safeError}</p></body></html>`;
	}
}
