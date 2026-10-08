export const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const GOOGLE_DRIVE_SCOPES = [
	'https://www.googleapis.com/auth/drive.file',
	'https://www.googleapis.com/auth/userinfo.email'
];

export interface OAuthTokens {
	accessToken: string;
	refreshToken: string;
	expiresIn: number;
	expiresAt: number;
}

export function generateCodeVerifier(): string {
	const bytes = new Uint8Array(32);
	crypto.getRandomValues(bytes);
	return base64UrlEncode(bytes);
}

/** SHA-256 PKCE challenge via Web Crypto, available in Obsidian and Node. */
export async function generateCodeChallenge(verifier: string): Promise<string> {
	const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
	return base64UrlEncode(new Uint8Array(hash));
}

export async function generateCodeChallengeWeb(verifier: string): Promise<string> {
	return generateCodeChallenge(verifier);
}

export function base64UrlEncode(buffer: Uint8Array): string {
	return Buffer.from(buffer)
		.toString('base64')
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/, '');
}

export function buildAuthorizationUrl(options: {
	clientId: string;
	redirectUri: string;
	codeChallenge: string;
	scopes?: string[];
}): string {
	const params = new URLSearchParams({
		client_id: options.clientId,
		redirect_uri: options.redirectUri,
		response_type: 'code',
		scope: (options.scopes || GOOGLE_DRIVE_SCOPES).join(' '),
		access_type: 'offline',
		prompt: 'consent',
		code_challenge: options.codeChallenge,
		code_challenge_method: 'S256'
	});
	return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

export function parseTokenResponse(
	data: any,
	now: number,
	previousRefreshToken = ''
): OAuthTokens {
	if (!data || typeof data.access_token !== 'string' || !data.access_token) {
		throw new Error('Token response did not include an access token');
	}
	const expiresIn = Number(data.expires_in);
	const safeExpires = Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 3600;
	const refreshToken = typeof data.refresh_token === 'string' && data.refresh_token
		? data.refresh_token
		: previousRefreshToken;
	return {
		accessToken: data.access_token,
		refreshToken,
		expiresIn: safeExpires,
		expiresAt: now + safeExpires * 1000
	};
}

export function isTokenExpired(expiresAt: number, now = Date.now(), bufferMs = 5 * 60 * 1000): boolean {
	return now >= (expiresAt - bufferMs);
}

export function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}
