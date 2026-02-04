import { Notice, requestUrl } from 'obsidian';
import { writeFile } from 'fs/promises';

export interface GeminiTTSOptions {
	apiKey: string;
	text: string;
	outputPath: string;
	voiceName?: string;
	languageCode?: string;
	modelId?: string;
}

export const GEMINI_TTS_VOICES = [
	{ name: 'Zephyr', style: 'Bright', gender: 'F' },
	{ name: 'Puck', style: 'Upbeat', gender: 'M' },
	{ name: 'Charon', style: 'Informative', gender: 'M' },
	{ name: 'Kore', style: 'Firm', gender: 'F' },
	{ name: 'Fenrir', style: 'Excitable', gender: 'M' },
	{ name: 'Leda', style: 'Youthful', gender: 'F' },
	{ name: 'Orus', style: 'Firm', gender: 'M' },
	{ name: 'Aoede', style: 'Breezy', gender: 'F' },
	{ name: 'Callirrhoe', style: 'Easy-going', gender: 'F' },
	{ name: 'Autonoe', style: 'Bright', gender: 'F' },
	{ name: 'Enceladus', style: 'Breathy', gender: 'M' },
	{ name: 'Iapetus', style: 'Clear', gender: 'M' },
	{ name: 'Umbriel', style: 'Easy-going', gender: 'M' },
	{ name: 'Algieba', style: 'Smooth', gender: 'M' },
	{ name: 'Despina', style: 'Smooth', gender: 'F' },
	{ name: 'Erinome', style: 'Clear', gender: 'F' },
	{ name: 'Algenib', style: 'Gravelly', gender: 'M' },
	{ name: 'Rasalgethi', style: 'Informative', gender: 'M' },
	{ name: 'Laomedeia', style: 'Upbeat', gender: 'F' },
	{ name: 'Achernar', style: 'Soft', gender: 'F' },
	{ name: 'Alnilam', style: 'Firm', gender: 'M' },
	{ name: 'Schedar', style: 'Even', gender: 'F' },
	{ name: 'Gacrux', style: 'Mature', gender: 'M' },
	{ name: 'Pulcherrima', style: 'Forward', gender: 'F' },
	{ name: 'Achird', style: 'Friendly', gender: 'M' },
	{ name: 'Zubenelgenubi', style: 'Casual', gender: 'M' },
	{ name: 'Vindemiatrix', style: 'Gentle', gender: 'F' },
	{ name: 'Sadachbia', style: 'Lively', gender: 'F' },
	{ name: 'Sadaltager', style: 'Knowledgeable', gender: 'M' },
	{ name: 'Sulafat', style: 'Warm', gender: 'F' }
] as const;

export const GEMINI_TTS_LANGUAGES = [
	{ code: 'auto', label: '🌐 Auto Detect' },
	{ code: 'ko-KR', label: '🇰🇷 Korean' },
	{ code: 'en-US', label: '🇺🇸 English (US)' },
	{ code: 'ja-JP', label: '🇯🇵 Japanese' },
	{ code: 'zh-CN', label: '🇨🇳 Chinese' },
	{ code: 'es-US', label: '🇪🇸 Spanish' },
	{ code: 'fr-FR', label: '🇫🇷 French' },
	{ code: 'de-DE', label: '🇩🇪 German' },
	{ code: 'hi-IN', label: '🇮🇳 Hindi' },
	{ code: 'id-ID', label: '🇮🇩 Indonesian' },
	{ code: 'it-IT', label: '🇮🇹 Italian' },
	{ code: 'pt-BR', label: '🇧🇷 Portuguese' },
	{ code: 'ru-RU', label: '🇷🇺 Russian' },
	{ code: 'nl-NL', label: '🇳🇱 Dutch' },
	{ code: 'pl-PL', label: '🇵🇱 Polish' },
	{ code: 'th-TH', label: '🇹🇭 Thai' },
	{ code: 'tr-TR', label: '🇹🇷 Turkish' },
	{ code: 'vi-VN', label: '🇻🇳 Vietnamese' },
	{ code: 'ro-RO', label: '🇷🇴 Romanian' },
	{ code: 'uk-UA', label: '🇺🇦 Ukrainian' },
	{ code: 'bn-BD', label: '🇧🇩 Bengali' },
	{ code: 'en-IN', label: '🇮🇳 English (India)' },
	{ code: 'mr-IN', label: '🇮🇳 Marathi' },
	{ code: 'ta-IN', label: '🇮🇳 Tamil' },
	{ code: 'te-IN', label: '🇮🇳 Telugu' }
] as const;

export class GeminiTTSHandler {
	private readonly API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

	async generate(options: GeminiTTSOptions): Promise<void> {
		try {
			const voiceName = options.voiceName || 'Kore';
			const modelId = options.modelId || 'gemini-2.5-flash-preview-tts';
			const apiUrl = `${this.API_BASE}/${modelId}:generateContent`;

			console.log(`Gemini TTS: Input text ${options.text.length} chars`);
			console.log(`Gemini TTS: Model=${modelId}, Voice=${voiceName}`);
			console.log(`Gemini TTS: Script preview: "${options.text.substring(0, 100)}..."`);

			const requestBody = {
				contents: [{
					parts: [{
						text: options.text
					}]
				}],
				generationConfig: {
					responseModalities: ['AUDIO'],
					speechConfig: {
						voiceConfig: {
							prebuiltVoiceConfig: {
								voiceName: voiceName
							}
						}
					}
				}
			};

			const response = await requestUrl({
				url: `${apiUrl}?key=${options.apiKey}`,
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(requestBody),
				throw: false
			});

			if (response.status !== 200) {
				const errorMessage = this.parseErrorResponse(response);
				console.error('Gemini TTS API error:', errorMessage);
				throw new Error(errorMessage);
			}

			const responseData = response.json;
			const audioData = responseData?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

			if (!audioData) {
				console.error('Gemini TTS response:', JSON.stringify(responseData, null, 2));
				throw new Error('No audio data in response');
			}

			const pcmBuffer = Buffer.from(audioData, 'base64');
			const wavBuffer = this.pcmToWav(pcmBuffer, 24000, 16, 1);
			
			const audioDurationSec = Math.round(pcmBuffer.length / (24000 * 2));
			console.log(`Gemini TTS: Generated ${pcmBuffer.length} bytes PCM (~${audioDurationSec}s audio)`);

			let outputPath = options.outputPath;
			if (outputPath.endsWith('.mp3')) {
				outputPath = outputPath.replace('.mp3', '.wav');
			}

			await writeFile(outputPath, wavBuffer);
			console.log(`Gemini TTS: Saved ${wavBuffer.length} bytes WAV to ${outputPath}`);
			new Notice(`✅ Audio generated (~${audioDurationSec}s)`);
		} catch (error: any) {
			console.error('Gemini TTS error:', error);

			if (error.message.includes('401') || error.message.includes('API_KEY')) {
				throw new Error('Invalid Gemini API key');
			}

			if (error.message.includes('429')) {
				throw new Error('Gemini API rate limit exceeded. Please try again later.');
			}

			throw new Error(`Gemini TTS generation failed: ${error.message}`);
		}
	}

	private parseErrorResponse(response: { status: number; json?: any; text?: string }): string {
		let errorMessage = `Gemini TTS API error (${response.status})`;

		try {
			const errorBody = response.json;
			if (errorBody?.error?.message) {
				errorMessage = `Gemini TTS: ${errorBody.error.message}`;
			}
			if (errorBody) {
				console.error('Gemini TTS error response:', errorBody);
			}
		} catch (e) {
			if (response.text) {
				errorMessage += ` - ${response.text.substring(0, 200)}`;
			}
		}

		return errorMessage;
	}

	private pcmToWav(pcmData: Buffer, sampleRate: number, bitsPerSample: number, channels: number): Buffer {
		const byteRate = sampleRate * channels * (bitsPerSample / 8);
		const blockAlign = channels * (bitsPerSample / 8);
		const dataSize = pcmData.length;
		const headerSize = 44;
		const fileSize = headerSize + dataSize;

		const wavBuffer = Buffer.alloc(fileSize);
		let offset = 0;

		wavBuffer.write('RIFF', offset); offset += 4;
		wavBuffer.writeUInt32LE(fileSize - 8, offset); offset += 4;
		wavBuffer.write('WAVE', offset); offset += 4;

		wavBuffer.write('fmt ', offset); offset += 4;
		wavBuffer.writeUInt32LE(16, offset); offset += 4;
		wavBuffer.writeUInt16LE(1, offset); offset += 2;
		wavBuffer.writeUInt16LE(channels, offset); offset += 2;
		wavBuffer.writeUInt32LE(sampleRate, offset); offset += 4;
		wavBuffer.writeUInt32LE(byteRate, offset); offset += 4;
		wavBuffer.writeUInt16LE(blockAlign, offset); offset += 2;
		wavBuffer.writeUInt16LE(bitsPerSample, offset); offset += 2;

		wavBuffer.write('data', offset); offset += 4;
		wavBuffer.writeUInt32LE(dataSize, offset); offset += 4;

		pcmData.copy(wavBuffer, offset);

		return wavBuffer;
	}

	getVoices(): Array<{ name: string; style: string; gender: string }> {
		return [...GEMINI_TTS_VOICES];
	}

	getLanguages(): Array<{ code: string; label: string }> {
		return [...GEMINI_TTS_LANGUAGES];
	}
}
