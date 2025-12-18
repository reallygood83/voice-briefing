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

	/**
	 * Get ephemeral token for client-side WebSocket connection
	 * Required for browser/Electron environments that can't set custom headers
	 */
	private async getEphemeralToken(apiKey: string): Promise<string> {
		try {
			console.log('Fetching xAI ephemeral token...');

			const response = await requestUrl({
				url: this.CLIENT_SECRETS_URL,
				method: 'POST',
				headers: {
					'Authorization': `Bearer ${apiKey}`,
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({})
			});

			if (response.status !== 200) {
				console.error('xAI token response:', response.text);
				throw new Error(`Failed to get ephemeral token: ${response.status}`);
			}

			const data = response.json;
			console.log('xAI ephemeral token obtained successfully');

			// The response should contain a client_secret or token field
			if (data.client_secret) {
				return data.client_secret.value || data.client_secret;
			} else if (data.token) {
				return data.token;
			} else if (data.secret) {
				return data.secret;
			}

			// If structure is different, log and try to find token
			console.log('xAI token response structure:', JSON.stringify(data, null, 2));
			throw new Error('Unexpected token response format');

		} catch (error: any) {
			console.error('Failed to get xAI ephemeral token:', error);
			if (error.message.includes('401')) {
				throw new Error('Invalid xAI API key');
			}
			throw new Error(`Failed to authenticate with xAI: ${error.message}`);
		}
	}

	async generate(options: XaiTTSOptions): Promise<void> {
		// First, get ephemeral token for browser authentication
		const ephemeralToken = await this.getEphemeralToken(options.apiKey);

		return new Promise((resolve, reject) => {
			try {
				const voiceName = options.voiceName || 'Sal';
				const audioChunks: Buffer[] = [];

				console.log('xAI TTS request:', {
					voice: voiceName,
					textLength: options.text.length
				});

				// Create WebSocket connection with ephemeral token
				// Use the token as a query parameter for browser compatibility
				const wsUrl = `${this.WS_URL}?model=grok-2-voice-preview-public`;
				const ws = new WebSocket(wsUrl);

				let sessionCreated = false;
				let responseStarted = false;
				let authenticated = false;

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
						console.log('xAI message type:', message.type);

						switch (message.type) {
							case 'auth.success':
							case 'authenticated':
								authenticated = true;
								console.log('xAI authenticated, configuring session...');

								// Send session configuration after authentication
								const sessionConfig = {
									type: 'session.update',
									session: {
										voice: voiceName,
										instructions: 'You are a text-to-speech assistant. Read the provided text naturally and clearly.',
										turn_detection: { type: 'server_vad' },
										audio: {
											input: { format: { type: 'audio/pcm', rate: 24000 } },
											output: { format: { type: 'audio/pcm', rate: 24000 } }
										}
									}
								};
								ws.send(JSON.stringify(sessionConfig));
								break;

							case 'session.created':
							case 'session.updated':
								sessionCreated = true;
								console.log('xAI session ready, sending text...');

								// Send text input after session is ready
								const inputEvent = {
									type: 'conversation.item.create',
									item: {
										type: 'message',
										role: 'user',
										content: [{
											type: 'input_text',
											text: `Please read the following text aloud: ${options.text}`
										}]
									}
								};
								ws.send(JSON.stringify(inputEvent));

								// Request audio response
								const responseEvent = {
									type: 'response.create',
									response: {
										modalities: ['audio']
									}
								};
								ws.send(JSON.stringify(responseEvent));
								break;

							case 'response.audio.delta':
								responseStarted = true;
								if (message.delta) {
									// Audio data is base64 encoded PCM
									const audioData = Buffer.from(message.delta, 'base64');
									audioChunks.push(audioData);
								}
								break;

							case 'response.audio.done':
							case 'response.done':
								if (audioChunks.length > 0) {
									// Combine all audio chunks
									const pcmBuffer = Buffer.concat(audioChunks);

									// Convert PCM to WAV
									const wavBuffer = this.pcmToWav(pcmBuffer, 24000, 16, 1);

									// Determine output path
									let outputPath = options.outputPath;
									if (outputPath.endsWith('.mp3')) {
										outputPath = outputPath.replace('.mp3', '.wav');
									}

									// Save the WAV file
									writeFile(outputPath, wavBuffer)
										.then(() => {
											console.log('xAI TTS audio saved to:', outputPath);
											new Notice('✅ Audio generated successfully with xAI TTS');
											ws.close();
											resolve();
										})
										.catch((err) => {
											ws.close();
											reject(new Error(`Failed to save audio: ${err.message}`));
										});
								} else if (message.type === 'response.done' && !responseStarted) {
									// Response completed but no audio received
									ws.close();
									reject(new Error('No audio data received from xAI'));
								}
								break;

							case 'error':
								ws.close();
								const errorMsg = message.error?.message || message.message || 'xAI WebSocket error';
								console.error('xAI error:', errorMsg);
								reject(new Error(errorMsg));
								break;

							case 'auth.error':
							case 'auth.failed':
								ws.close();
								reject(new Error('xAI authentication failed. Please check your API key.'));
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
					if (!sessionCreated && !authenticated) {
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

				if (error.message.includes('401') || error.message.includes('API_KEY')) {
					reject(new Error('Invalid xAI API key'));
				} else if (error.message.includes('429')) {
					reject(new Error('xAI API rate limit exceeded. Please try again later.'));
				} else {
					reject(new Error(`xAI TTS generation failed: ${error.message}`));
				}
			}
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
