import { Notice, requestUrl } from 'obsidian';
import { writeFile } from 'fs/promises';

export interface XaiTTSOptions {
	apiKey: string;
	text: string;
	outputPath: string;
	voiceName?: string;
}

// xAI TTS Voice options - Based on official xAI documentation
// Available voices: Ara, Rex, Sal, Eve, Leo
export const XAI_TTS_VOICES = [
	{ name: 'Sal', style: 'Conversational', gender: 'M' },
	{ name: 'Rex', style: 'Professional', gender: 'M' },
	{ name: 'Eve', style: 'Warm', gender: 'F' },
	{ name: 'Leo', style: 'Energetic', gender: 'M' },
	{ name: 'Ara', style: 'Friendly', gender: 'F' }
] as const;

export class XaiTTSHandler {
	private readonly WS_URL = 'wss://api.x.ai/v1/realtime';
	private readonly CLIENT_SECRETS_URL = 'https://api.x.ai/v1/realtime/client_secrets';
	private readonly MODEL = 'grok-2-voice-preview-public';

	/**
	 * Get ephemeral token for client-side WebSocket connection
	 * Required for browser/Electron environments that can't set custom headers
	 * Based on official xAI docs: https://docs.x.ai/docs/guides/voice/agent
	 */
	private async getEphemeralToken(apiKey: string): Promise<string> {
		try {
			console.log('[xAI] Fetching ephemeral token...');

			// Official xAI format: only expires_after is needed
			const response = await requestUrl({
				url: this.CLIENT_SECRETS_URL,
				method: 'POST',
				headers: {
					'Authorization': `Bearer ${apiKey}`,
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					expires_after: { seconds: 300 }
				})
			});

			if (response.status !== 200) {
				console.error('[xAI] Token response status:', response.status);
				console.error('[xAI] Token response body:', response.text);
				throw new Error(`Failed to get ephemeral token: HTTP ${response.status}`);
			}

			const data = response.json;
			console.log('[xAI] Token response received:', JSON.stringify(data, null, 2));

			let token = null;
			// Try multiple possible response formats based on xAI API
			if (data.client_secret?.value) token = data.client_secret.value;
			else if (typeof data.client_secret === 'string') token = data.client_secret;
			else if (data.secret) token = data.secret;
			else if (data.token) token = data.token;
			else if (data.key) token = data.key;
			else if (data.access_token) token = data.access_token;
			else if (data.ephemeral_key) token = data.ephemeral_key;
			else if (data.value) token = data.value;

			if (token) {
				console.log(`[xAI] Token found (length: ${token.length})`);
				return token;
			}

			// If no token found, throw with detailed info
			const keys = Object.keys(data).join(', ');
			console.error(`[xAI] Unexpected token response format. Keys: ${keys}`);
			throw new Error(`Unexpected token response format. Response keys: ${keys}`);

		} catch (error: any) {
			console.error('[xAI] Failed to get ephemeral token:', error);
			if (error.message.includes('401')) {
				throw new Error('Invalid xAI API key');
			}
			throw new Error(`Failed to authenticate with xAI: ${error.message}`);
		}
	}

	async generate(options: XaiTTSOptions): Promise<void> {
		const voiceName = options.voiceName || 'Sal';
		console.log(`[xAI] Starting TTS generation. Voice: ${voiceName}, Text Length: ${options.text.length}`);

		// First, get ephemeral token for authentication
		const ephemeralToken = await this.getEphemeralToken(options.apiKey);

		return new Promise((resolve, reject) => {
			try {
				const audioChunks: Buffer[] = [];

				// Create WebSocket connection using Native Browser API
				// Authenticate via access_token query parameter (ephemeral token method)
				const maskedToken = ephemeralToken.substring(0, 10) + '...';
				console.log(`[xAI] Connecting to WebSocket: ${this.WS_URL}?model=${this.MODEL}&access_token=${maskedToken}`);

				// Re-add model parameter which is required
				const wsUrl = `${this.WS_URL}?model=${this.MODEL}&access_token=${ephemeralToken}`;
				const ws = new WebSocket(wsUrl);

				let sessionCreated = false;
				let responseStarted = false;
				let authenticated = false;
				let conversationCreated = false;

				ws.onopen = () => {
					console.log('[xAI] WebSocket connected (onopen). Configuring session...');
					// No separate auth message needed - ephemeral token is passed via query param
					authenticated = true;
					this.sendSessionConfig(ws, voiceName);
				};

				ws.onmessage = (event: any) => {
					try {
						const message = JSON.parse(event.data as string);
						// Reduce noise by ignoring chunk events
						if (message.type !== 'response.audio.delta' && message.type !== 'response.output_audio.delta') {
							console.log('[xAI] Received message:', message.type, message);
						}

						switch (message.type) {
							// Session events - primary flow after WebSocket connection
							case 'session.created':
							case 'session.updated':
								sessionCreated = true;
								console.log('[xAI] Session ready. Sending text input...');
								this.sendTextInput(ws, options.text);
								break;

							// Conversation created event
							case 'conversation.created':
								conversationCreated = true;
								console.log('[xAI] Conversation created.');
								break;

							// Audio output events (xAI uses response.output_audio.* format)
							case 'response.output_audio.delta':
							case 'response.audio.delta':
								responseStarted = true;
								if (message.delta) {
									const audioData = Buffer.from(message.delta, 'base64');
									audioChunks.push(audioData);
								}
								break;

							case 'response.output_audio.done':
							case 'response.audio.done':
								console.log('[xAI] Audio stream completed. Total chunks:', audioChunks.length);
								break;

							case 'response.done':
								if (audioChunks.length > 0) {
									console.log('[xAI] Response done with audio. Saving...');
									this.saveAudio(audioChunks, options.outputPath, ws, resolve, reject);
								} else if (!responseStarted) {
									console.warn('[xAI] Response done but NO audio received.');
									ws.close();
									reject(new Error('No audio data received from xAI'));
								}
								break;

							// Error handling
							case 'error':
								ws.close();
								const errorMsg = message.error?.message || message.message || JSON.stringify(message);
								console.error('[xAI] Server reported error:', errorMsg);
								reject(new Error(`xAI error: ${errorMsg}`));
								break;

							case 'auth.error':
							case 'auth.failed':
								ws.close();
								console.error('[xAI] Authentication failed message received.');
								reject(new Error('xAI authentication failed. Please check your API key.'));
								break;

							default:
								console.log('[xAI] Unhandled message type:', message.type);
								break;
						}
					} catch (parseError: any) {
						console.error('[xAI] Failed to parse WebSocket message:', parseError);
					}
				};

				ws.onerror = (error: any) => {
					console.error('[xAI] WebSocket network error:', error);
					reject(new Error('xAI WebSocket connection failed. Please check your network connection.'));
				};

				ws.onclose = (event: any) => {
					console.log(`[xAI] WebSocket closed. Code: ${event.code}, Reason: ${event.reason}`);
					if (!sessionCreated && !authenticated && event.code !== 1000) {
						reject(new Error(`xAI WebSocket connection closed unexpectedly (Code ${event.code}). Authentication may have failed.`));
					}
				};

				// Timeout after 60 seconds
				setTimeout(() => {
					if (ws.readyState === WebSocket.OPEN) {
						console.warn('[xAI] Timed out waiting for completion. Closing socket.');
						ws.close();
						reject(new Error('xAI TTS generation timed out'));
					}
				}, 60000);

			} catch (error: any) {
				console.error('[xAI] TTS handling error:', error);
				reject(new Error(`xAI TTS generation failed: ${error.message}`));
			}
		});
	}

	private sendSessionConfig(ws: WebSocket, voiceName: string): void {
		// xAI official session configuration format
		const sessionConfig = {
			type: 'session.update',
			session: {
				voice: voiceName,
				instructions: 'You are a text-to-speech assistant. Read the provided text naturally and clearly.',
				turn_detection: null, // Disable VAD for TTS-only use
				modalities: ['audio', 'text'],
				output_audio_format: 'pcm16'
			}
		};
		console.log('[xAI] Sending session config:', JSON.stringify(sessionConfig));
		ws.send(JSON.stringify(sessionConfig));
	}

	private sendTextInput(ws: WebSocket, text: string): void {
		// Send text input
		const inputEvent = {
			type: 'conversation.item.create',
			item: {
				type: 'message',
				role: 'user',
				content: [{
					type: 'input_text',
					text: `Please read the following text aloud: ${text}`
				}]
			}
		};
		console.log('[xAI] Sending text input event...');
		ws.send(JSON.stringify(inputEvent));

		// Request audio response
		const responseEvent = {
			type: 'response.create',
			response: {
				modalities: ['audio']
			}
		};
		console.log('[xAI] Requesting audio response generation...');
		ws.send(JSON.stringify(responseEvent));
	}

	private saveAudio(
		audioChunks: Buffer[],
		outputPath: string,
		ws: WebSocket,
		resolve: () => void,
		reject: (error: Error) => void
	): void {
		// Combine all audio chunks
		const pcmBuffer = Buffer.concat(audioChunks);
		console.log('Total audio data received:', pcmBuffer.length, 'bytes');

		// Convert PCM to WAV
		const wavBuffer = this.pcmToWav(pcmBuffer, 24000, 16, 1);

		// Determine output path
		let finalPath = outputPath;
		if (finalPath.endsWith('.mp3')) {
			finalPath = finalPath.replace('.mp3', '.wav');
		}

		// Save the WAV file
		writeFile(finalPath, wavBuffer)
			.then(() => {
				console.log('xAI TTS audio saved to:', finalPath);
				new Notice('✅ Audio generated successfully with xAI TTS');
				ws.close();
				resolve();
			})
			.catch((err) => {
				ws.close();
				reject(new Error(`Failed to save audio: ${err.message}`));
			});
	}

	/**
	 * Convert raw PCM data to WAV format
	 * xAI outputs: 24kHz, 16-bit, mono PCM
	 */
	private pcmToWav(pcmData: Buffer, sampleRate: number, bitsPerSample: number, channels: number): Buffer {
		const byteRate = sampleRate * channels * (bitsPerSample / 8);
		const blockAlign = channels * (bitsPerSample / 8);
		const dataSize = pcmData.length;
		const headerSize = 44;
		const fileSize = headerSize + dataSize;

		const wavBuffer = Buffer.alloc(fileSize);
		let offset = 0;

		// RIFF header
		wavBuffer.write('RIFF', offset); offset += 4;
		wavBuffer.writeUInt32LE(fileSize - 8, offset); offset += 4;
		wavBuffer.write('WAVE', offset); offset += 4;

		// fmt sub-chunk
		wavBuffer.write('fmt ', offset); offset += 4;
		wavBuffer.writeUInt32LE(16, offset); offset += 4; // Subchunk1Size (16 for PCM)
		wavBuffer.writeUInt16LE(1, offset); offset += 2; // AudioFormat (1 for PCM)
		wavBuffer.writeUInt16LE(channels, offset); offset += 2;
		wavBuffer.writeUInt32LE(sampleRate, offset); offset += 4;
		wavBuffer.writeUInt32LE(byteRate, offset); offset += 4;
		wavBuffer.writeUInt16LE(blockAlign, offset); offset += 2;
		wavBuffer.writeUInt16LE(bitsPerSample, offset); offset += 2;

		// data sub-chunk
		wavBuffer.write('data', offset); offset += 4;
		wavBuffer.writeUInt32LE(dataSize, offset); offset += 4;

		// Copy PCM data
		pcmData.copy(wavBuffer, offset);

		return wavBuffer;
	}

	/**
	 * Get list of available voices with their styles and gender
	 */
	getVoices(): Array<{ name: string; style: string; gender: string }> {
		return [...XAI_TTS_VOICES];
	}
}
