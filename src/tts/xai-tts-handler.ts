import { Notice, requestUrl } from 'obsidian';
import { writeFile } from 'fs/promises';
import { WebSocket } from 'ws';

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
	 */
	// Kept for reference or backward compatibility, but we use direct auth with 'ws' library now
	private async getEphemeralToken(apiKey: string, voiceName: string): Promise<string> {
		try {
			console.log('Fetching xAI ephemeral token...');

			// Try with model and voice configuration in the request body
			const response = await requestUrl({
				url: this.CLIENT_SECRETS_URL,
				method: 'POST',
				headers: {
					'Authorization': `Bearer ${apiKey}`,
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					model: this.MODEL,
					voice: voiceName
				})
			});

			if (response.status !== 200) {
				console.error('xAI token response status:', response.status);
				console.error('xAI token response body:', response.text);
				throw new Error(`Failed to get ephemeral token: HTTP ${response.status}`);
			}

			const data = response.json;
			console.log('xAI token response received, parsing...');
			// console.log('xAI token response structure:', JSON.stringify(data, null, 2));

			// Try multiple possible response formats
			if (data.client_secret?.value) return data.client_secret.value;
			if (typeof data.client_secret === 'string') return data.client_secret;
			if (data.token) return data.token;
			if (data.secret) return data.secret;
			if (data.key) return data.key;
			if (data.access_token) return data.access_token;
			if (data.ephemeral_key) return data.ephemeral_key;

			// If no token found, throw with detailed info
			throw new Error(`Unexpected token response format. Response keys: ${Object.keys(data).join(', ')}`);

		} catch (error: any) {
			console.error('Failed to get xAI ephemeral token:', error);
			if (error.message.includes('401')) {
				throw new Error('Invalid xAI API key');
			}
			throw new Error(`Failed to authenticate with xAI: ${error.message}`);
		}
	}

	async generate(options: XaiTTSOptions): Promise<void> {
		const voiceName = options.voiceName || 'Sal';

		// First, get ephemeral token for authentication
		const ephemeralToken = await this.getEphemeralToken(options.apiKey, voiceName);

		return new Promise((resolve, reject) => {
			try {
				const audioChunks: Buffer[] = [];

				console.log('xAI TTS request:', {
					voice: voiceName,
					textLength: options.text.length
				});

				// Create WebSocket connection using Node.js ws library with headers
				// This bypasses browser limitations on setting WebSocket headers
				const wsUrl = `${this.WS_URL}?model=${this.MODEL}`;
				const ws = new WebSocket(wsUrl, {
					headers: {
						'Authorization': `Bearer ${ephemeralToken}`
					}
				});

				let sessionCreated = false;
				let responseStarted = false;
				let authenticated = false;
				let conversationCreated = false;

				ws.onopen = () => {
					console.log('xAI WebSocket connected, authenticating...');

					// Send authentication with ephemeral token
					const authMessage = {
						type: 'auth',
						token: ephemeralToken
					};
					ws.send(JSON.stringify(authMessage));
				};

				ws.onmessage = (event) => {
					try {
						const message = JSON.parse(event.data as string);
						// console.log('xAI message type:', message.type);

						switch (message.type) {
							// Authentication events
							case 'auth.success':
							case 'authenticated':
								authenticated = true;
								console.log('xAI authenticated, configuring session...');
								this.sendSessionConfig(ws, voiceName);
								break;

							// Conversation created event (sent first according to xAI docs)
							case 'conversation.created':
								conversationCreated = true;
								if (!authenticated) {
									authenticated = true; // Assume authenticated if conversation starts
									this.sendSessionConfig(ws, voiceName);
								}
								break;

							// Session events
							case 'session.created':
							case 'session.updated':
								sessionCreated = true;
								console.log('xAI session ready, sending text...');
								this.sendTextInput(ws, options.text);
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
								console.log('xAI audio stream completed');
								break;

							case 'response.done':
								if (audioChunks.length > 0) {
									this.saveAudio(audioChunks, options.outputPath, ws, resolve, reject);
								} else if (!responseStarted) {
									ws.close();
									reject(new Error('No audio data received from xAI'));
								}
								break;

							// Error handling
							case 'error':
								ws.close();
								const errorMsg = message.error?.message || message.message || JSON.stringify(message);
								console.error('xAI error:', errorMsg);
								reject(new Error(`xAI error: ${errorMsg}`));
								break;

							case 'auth.error':
							case 'auth.failed':
								ws.close();
								reject(new Error('xAI authentication failed. Please check your API key.'));
								break;

							default:
								// console.log('xAI unhandled message type:', message.type);
								break;
						}
					} catch (parseError: any) {
						console.error('Failed to parse xAI message:', parseError);
					}
				};

				ws.onerror = (error) => {
					console.error('xAI WebSocket error:', error);
					reject(new Error('xAI WebSocket connection failed. Please check your network connection.'));
				};

				ws.onclose = (event) => {
					console.log('xAI WebSocket closed:', event.code, event.reason);
					if (!sessionCreated && !authenticated && event.code !== 1000) {
						reject(new Error('xAI WebSocket connection closed unexpectedly. Authentication may have failed.'));
					}
				};

				// Timeout after 60 seconds
				setTimeout(() => {
					if (ws.readyState === WebSocket.OPEN) {
						ws.close();
						reject(new Error('xAI TTS generation timed out'));
					}
				}, 60000);

			} catch (error: any) {
				console.error('xAI TTS error:', error);
				reject(new Error(`xAI TTS generation failed: ${error.message}`));
			}
		});
	}

	private sendSessionConfig(ws: WebSocket, voiceName: string): void {
		const sessionConfig = {
			type: 'session.update',
			session: {
				voice: voiceName,
				instructions: 'You are a text-to-speech assistant. Read the provided text naturally and clearly.',
				turn_detection: { type: 'server_vad' },
				input_audio_format: 'pcm16',
				output_audio_format: 'pcm16'
			}
		};
		// console.log('Sending session config:', sessionConfig);
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
		console.log('Sending text input');
		ws.send(JSON.stringify(inputEvent));

		// Request audio response
		const responseEvent = {
			type: 'response.create',
			response: {
				modalities: ['audio']
			}
		};
		console.log('Requesting audio response');
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
