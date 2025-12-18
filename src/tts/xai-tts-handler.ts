import { Notice } from 'obsidian';
import { writeFile } from 'fs/promises';

export interface XaiTTSOptions {
	apiKey: string;
	text: string;
	outputPath: string;
	voiceName?: string;
}

// xAI TTS Voice options
// Based on Grok Voice Agent API available voices
export const XAI_TTS_VOICES = [
	{ name: 'Sal', style: 'Conversational', gender: 'M' },
	{ name: 'Rex', style: 'Professional', gender: 'M' },
	{ name: 'Eve', style: 'Warm', gender: 'F' },
	{ name: 'Leo', style: 'Energetic', gender: 'M' },
	{ name: 'Ara', style: 'Friendly', gender: 'F' },
	{ name: 'Mika', style: 'Casual', gender: 'F' },
	{ name: 'Valentin', style: 'Smooth', gender: 'M' }
] as const;

export class XaiTTSHandler {
	private readonly WS_URL = 'wss://api.x.ai/v1/realtime';

	async generate(options: XaiTTSOptions): Promise<void> {
		return new Promise((resolve, reject) => {
			try {
				const voiceName = options.voiceName || 'Sal';
				const audioChunks: Buffer[] = [];

				console.log('xAI TTS request:', {
					voice: voiceName,
					textLength: options.text.length
				});

				// Create WebSocket connection with authentication
				const ws = new WebSocket(`${this.WS_URL}?model=grok-2-voice`, {
					// @ts-ignore - headers are supported in Node.js WebSocket
					headers: {
						'Authorization': `Bearer ${options.apiKey}`
					}
				});

				let sessionCreated = false;
				let responseStarted = false;

				ws.onopen = () => {
					console.log('xAI WebSocket connected');

					// Send session configuration
					const sessionConfig = {
						type: 'session.update',
						session: {
							modalities: ['audio', 'text'],
							voice: voiceName.toLowerCase(),
							input_audio_format: 'pcm16',
							output_audio_format: 'pcm16',
							turn_detection: null // Disable turn detection for TTS-only
						}
					};
					ws.send(JSON.stringify(sessionConfig));
				};

				ws.onmessage = (event) => {
					try {
						const message = JSON.parse(event.data as string);
						console.log('xAI message type:', message.type);

						switch (message.type) {
							case 'session.created':
							case 'session.updated':
								sessionCreated = true;
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

								// Request response
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
								reject(new Error(message.error?.message || 'xAI WebSocket error'));
								break;
						}
					} catch (parseError: any) {
						console.error('Failed to parse xAI message:', parseError);
					}
				};

				ws.onerror = (error) => {
					console.error('xAI WebSocket error:', error);
					reject(new Error('xAI WebSocket connection failed'));
				};

				ws.onclose = (event) => {
					console.log('xAI WebSocket closed:', event.code, event.reason);
					if (!sessionCreated) {
						reject(new Error('xAI WebSocket connection closed unexpectedly'));
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
