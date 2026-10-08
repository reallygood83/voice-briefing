import { Notice, requestUrl } from 'obsidian';
import { readDesktopFile } from '../desktop/files';
import { redactSecrets } from '../ai/extract-text';
import { GoogleOAuthFlow } from './google-oauth-flow';
import type { OAuthTokens } from './oauth-protocol';

export interface GoogleDriveConfig {
	clientId?: string;
	clientSecret?: string;
	accessToken: string;
	refreshToken?: string;
	tokenExpiresAt?: number;
	folderId?: string;
	onTokenRefresh?: (tokens: OAuthTokens) => Promise<void>;
}

export interface UploadResult {
	success: boolean;
	fileId?: string;
	publicUrl?: string;
	downloadUrl?: string;
	error?: string;
}

export class GoogleDriveClient {
	private readonly API_URL = 'https://www.googleapis.com/drive/v3';
	private readonly UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3';
	private oauthFlow: GoogleOAuthFlow | null = null;

	constructor(private config: GoogleDriveConfig) {
		// Initialize OAuth flow if we have client credentials
		if (config.clientId && config.clientSecret) {
			this.oauthFlow = new GoogleOAuthFlow({
				clientId: config.clientId,
				clientSecret: config.clientSecret,
				redirectPort: 8585
			});
		}
	}

	/**
	 * Ensure we have a valid access token, refreshing if necessary
	 */
	private async ensureValidToken(): Promise<string> {
		// Check if token is expired or about to expire
		if (this.config.tokenExpiresAt && this.config.refreshToken && this.oauthFlow) {
			if (this.oauthFlow.isTokenExpired(this.config.tokenExpiresAt)) {
				console.debug('Google Drive access token is due for refresh');
				try {
					const newTokens = await this.oauthFlow.refreshAccessToken(this.config.refreshToken);

					// Update local config
					this.config.accessToken = newTokens.accessToken;
					this.config.tokenExpiresAt = newTokens.expiresAt;

					// Notify callback to save tokens
					if (this.config.onTokenRefresh) {
						await this.config.onTokenRefresh(newTokens);
					}

					new Notice('🔄 Google Drive token refreshed automatically');
				} catch (error: any) {
					console.error('Token refresh failed:', redactSecrets(error?.message || 'unknown error'));
					throw new Error('Token refresh failed. Please reconnect Google Drive.');
				}
			}
		}

		return this.config.accessToken;
	}

	async uploadFile(filePath: string, fileName: string, mimeType: string = 'audio/mpeg'): Promise<UploadResult> {
		try {
			// Ensure we have a valid token before uploading
			const accessToken = await this.ensureValidToken();

			const fileContent = readDesktopFile(filePath);

			// Step 1: Create file metadata
			const metadata = {
				name: fileName,
				mimeType: mimeType,
				parents: this.config.folderId ? [this.config.folderId] : undefined
			};

			// Step 2: Upload file using multipart upload
			const boundary = '-------314159265358979323846';
			const delimiter = `\r\n--${boundary}\r\n`;
			const closeDelimiter = `\r\n--${boundary}--`;

			const multipartRequestBody =
				delimiter +
				'Content-Type: application/json\r\n\r\n' +
				JSON.stringify(metadata) +
				delimiter +
				`Content-Type: ${mimeType}\r\n` +
				'Content-Transfer-Encoding: base64\r\n\r\n' +
				fileContent.toString('base64') +
				closeDelimiter;

			const response = await requestUrl({
				url: `${this.UPLOAD_URL}/files?uploadType=multipart`,
				method: 'POST',
				headers: {
					'Authorization': `Bearer ${accessToken}`,
					'Content-Type': `multipart/related; boundary=${boundary}`
				},
				body: multipartRequestBody
			});

			if (response.status !== 200) {
				throw new Error(`Upload failed: ${response.status}`);
			}

			const fileData = response.json;
			const fileId = fileData.id;

			// Step 3: Make file publicly accessible
			await this.makeFilePublic(fileId);

			// Step 4: Get the webContentLink for direct streaming
			// We need to fetch file metadata to get the proper streaming URL
			const fileMetaResponse = await requestUrl({
				url: `${this.API_URL}/files/${fileId}?fields=webContentLink,webViewLink`,
				method: 'GET',
				headers: {
					'Authorization': `Bearer ${accessToken}`
				}
			});

			const fileMeta = fileMetaResponse.json;

			// Step 5: Generate public URLs
			const publicUrl = `https://drive.google.com/file/d/${fileId}/view`;
			// Use webContentLink for direct audio streaming (works with <audio> tag)
			// Format: https://drive.google.com/uc?export=download&id=FILE_ID
			// But for streaming, we need: https://drive.google.com/uc?export=view&id=FILE_ID
			const downloadUrl = fileMeta.webContentLink || `https://drive.google.com/uc?export=view&id=${fileId}`;

			new Notice('☁️ File uploaded to Google Drive successfully');

			return {
				success: true,
				fileId,
				publicUrl,
				downloadUrl
			};
		} catch (error: any) {
			console.error('Google Drive upload error:', redactSecrets(error?.message || 'unknown error'));

			if (error.message.includes('401')) {
				return {
					success: false,
					error: 'Invalid or expired access token. Please reconnect Google Drive.'
				};
			}

			return {
				success: false,
				error: `Upload failed: ${error.message}`
			};
		}
	}

	private async makeFilePublic(fileId: string): Promise<void> {
		try {
			const accessToken = await this.ensureValidToken();
			await requestUrl({
				url: `${this.API_URL}/files/${fileId}/permissions`,
				method: 'POST',
				headers: {
					'Authorization': `Bearer ${accessToken}`,
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					role: 'reader',
					type: 'anyone'
				})
			});
		} catch (error: any) {
			console.error('Failed to make file public:', error);
			// Don't throw - file is uploaded, just not public
		}
	}

	async createFolder(folderName: string, parentFolderId?: string): Promise<string | null> {
		try {
			const accessToken = await this.ensureValidToken();
			const metadata = {
				name: folderName,
				mimeType: 'application/vnd.google-apps.folder',
				parents: parentFolderId ? [parentFolderId] : undefined
			};

			const response = await requestUrl({
				url: `${this.API_URL}/files`,
				method: 'POST',
				headers: {
					'Authorization': `Bearer ${accessToken}`,
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(metadata)
			});

			if (response.status !== 200) {
				throw new Error(`Folder creation failed: ${response.status}`);
			}

			const folderData = response.json;
			new Notice(`✅ Folder '${folderName}' created in Google Drive`);

			return folderData.id;
		} catch (error: any) {
			console.error('Failed to create folder:', error);
			return null;
		}
	}

	async findOrCreateFolder(folderName: string): Promise<string | null> {
		try {
			const accessToken = await this.ensureValidToken();
			// Search for existing folder
			const searchResponse = await requestUrl({
				url: `${this.API_URL}/files?q=name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
				method: 'GET',
				headers: {
					'Authorization': `Bearer ${accessToken}`
				}
			});

			if (searchResponse.status === 200) {
				const files = searchResponse.json.files;
				if (files && files.length > 0) {
					// Folder exists
					return files[0].id;
				}
			}

			// Create new folder
			return await this.createFolder(folderName);
		} catch (error: any) {
			console.error('Failed to find or create folder:', error);
			return null;
		}
	}

	async testConnection(): Promise<boolean> {
		try {
			const accessToken = await this.ensureValidToken();
			const response = await requestUrl({
				url: `${this.API_URL}/about?fields=user`,
				method: 'GET',
				headers: {
					'Authorization': `Bearer ${accessToken}`
				}
			});

			return response.status === 200;
		} catch (error) {
			return false;
		}
	}

	async getUserInfo(): Promise<{email: string, name: string} | null> {
		try {
			const accessToken = await this.ensureValidToken();
			const response = await requestUrl({
				url: `${this.API_URL}/about?fields=user`,
				method: 'GET',
				headers: {
					'Authorization': `Bearer ${accessToken}`
				}
			});

			if (response.status === 200) {
				const data = response.json;
				return {
					email: data.user.emailAddress,
					name: data.user.displayName
				};
			}

			return null;
		} catch (error) {
			return null;
		}
	}
}
