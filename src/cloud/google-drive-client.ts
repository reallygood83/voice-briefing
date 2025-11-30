import { Notice, requestUrl } from 'obsidian';

export interface GoogleDriveConfig {
	clientId?: string;
	clientSecret?: string;
	accessToken: string;
	refreshToken?: string;
	folderId?: string;
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

	constructor(private config: GoogleDriveConfig) {}

	async uploadFile(filePath: string, fileName: string, mimeType: string = 'audio/mpeg'): Promise<UploadResult> {
		try {
			// Read file content
			const fs = require('fs');
			const fileContent = fs.readFileSync(filePath);

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
					'Authorization': `Bearer ${this.config.accessToken}`,
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

			// Step 4: Generate public URLs
			const publicUrl = `https://drive.google.com/file/d/${fileId}/view`;
			const downloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;

			new Notice('☁️ File uploaded to Google Drive successfully');

			return {
				success: true,
				fileId,
				publicUrl,
				downloadUrl
			};
		} catch (error: any) {
			console.error('Google Drive upload error:', error);

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
			await requestUrl({
				url: `${this.API_URL}/files/${fileId}/permissions`,
				method: 'POST',
				headers: {
					'Authorization': `Bearer ${this.config.accessToken}`,
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
			const metadata = {
				name: folderName,
				mimeType: 'application/vnd.google-apps.folder',
				parents: parentFolderId ? [parentFolderId] : undefined
			};

			const response = await requestUrl({
				url: `${this.API_URL}/files`,
				method: 'POST',
				headers: {
					'Authorization': `Bearer ${this.config.accessToken}`,
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
			// Search for existing folder
			const searchResponse = await requestUrl({
				url: `${this.API_URL}/files?q=name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
				method: 'GET',
				headers: {
					'Authorization': `Bearer ${this.config.accessToken}`
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
			const response = await requestUrl({
				url: `${this.API_URL}/about?fields=user`,
				method: 'GET',
				headers: {
					'Authorization': `Bearer ${this.config.accessToken}`
				}
			});

			return response.status === 200;
		} catch (error) {
			return false;
		}
	}

	async getUserInfo(): Promise<{email: string, name: string} | null> {
		try {
			const response = await requestUrl({
				url: `${this.API_URL}/about?fields=user`,
				method: 'GET',
				headers: {
					'Authorization': `Bearer ${this.config.accessToken}`
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
