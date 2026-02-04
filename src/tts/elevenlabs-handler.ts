import { Notice, requestUrl } from 'obsidian';
import { writeFile } from 'fs/promises';

interface VoiceSettings {
	stability: number;
	similarity_boost: number;
	style?: number;
	use_speaker_boost?: boolean;
}

export interface ElevenLabsOptions {
	apiKey: string;
	voiceId: string;
	text: string;
	outputPath: string;
	modelId?: string;
	voiceSettings?: VoiceSettings;
}

export class ElevenLabsHandler {
	private readonly API_URL = 'https://api.elevenlabs.io/v1';
	private readonly MAX_TEXT_LENGTH = 5000;

	async generate(options: ElevenLabsOptions): Promise<void> {
		this.validateOptions(options);

		if (options.text.length > this.MAX_TEXT_LENGTH) {
			console.warn(`Text length (${options.text.length}) exceeds limit. Truncating.`);
			options.text = options.text.substring(0, this.MAX_TEXT_LENGTH);
		}

		try {
			const modelId = options.modelId || 'eleven_multilingual_v2';
			const voiceSettings = this.buildVoiceSettings(options.voiceSettings, modelId);

			const requestBody = {
				text: options.text,
				model_id: modelId,
				voice_settings: voiceSettings
			};

			console.log('ElevenLabs request:', {
				url: `${this.API_URL}/text-to-speech/${options.voiceId}`,
				modelId,
				textLength: options.text.length,
				voiceSettings
			});

			const response = await requestUrl({
				url: `${this.API_URL}/text-to-speech/${options.voiceId}`,
				method: 'POST',
				headers: {
					'Accept': 'audio/mpeg',
					'Content-Type': 'application/json',
					'xi-api-key': options.apiKey
				},
				body: JSON.stringify(requestBody),
				throw: false
			});

			if (response.status !== 200) {
				throw new Error(this.parseErrorResponse(response));
			}

			const buffer = Buffer.from(response.arrayBuffer);
			await writeFile(options.outputPath, buffer);

			new Notice('✅ Audio generated successfully with ElevenLabs');
		} catch (error: any) {
			console.error('ElevenLabs error:', error);

			if (error.message.startsWith('ElevenLabs')) {
				throw error;
			}

			throw new Error(`ElevenLabs generation failed: ${error.message}`);
		}
	}

	private validateOptions(options: ElevenLabsOptions): void {
		if (!options.voiceId?.trim()) {
			throw new Error('ElevenLabs Voice ID is required. Please set it in plugin settings.');
		}
		
		if (!options.apiKey?.trim()) {
			throw new Error('ElevenLabs API Key is required. Please set it in plugin settings.');
		}
		
		if (!options.text?.trim()) {
			throw new Error('Text is required for TTS generation.');
		}
	}

	private buildVoiceSettings(settings: VoiceSettings | undefined, modelId: string): VoiceSettings {
		const voiceSettings: VoiceSettings = {
			stability: settings?.stability ?? 0.5,
			similarity_boost: settings?.similarity_boost ?? 0.75
		};
		
		if (modelId.includes('v2')) {
			voiceSettings.style = settings?.style ?? 0.0;
			voiceSettings.use_speaker_boost = settings?.use_speaker_boost ?? true;
		}
		
		return voiceSettings;
	}

	private parseErrorResponse(response: { status: number; json?: any }): string {
		let errorMessage = `ElevenLabs API error (${response.status})`;
		
		try {
			const errorBody = response.json;
			if (errorBody?.detail) {
				errorMessage = typeof errorBody.detail === 'object'
					? `ElevenLabs: ${errorBody.detail.message || JSON.stringify(errorBody.detail)}`
					: `ElevenLabs: ${errorBody.detail}`;
			} else if (errorBody?.message) {
				errorMessage = `ElevenLabs: ${errorBody.message}`;
			} else if (errorBody?.error) {
				errorMessage = `ElevenLabs: ${errorBody.error}`;
			}
			
			if (errorBody) {
				console.error('ElevenLabs API error response:', errorBody);
			}
		} catch (parseError) {
			console.error('Failed to parse ElevenLabs error response:', parseError);
		}

		return this.enhanceErrorMessage(errorMessage, response.status);
	}

	private enhanceErrorMessage(message: string, status: number): string {
		switch (status) {
			case 400:
				return `${message}\n\nPossible causes:\n- Invalid Voice ID\n- Text too long\n- Invalid model ID`;
			case 401:
				return 'Invalid ElevenLabs API key. Please check your API key in settings.';
			case 403:
				return 'ElevenLabs API access denied. Check your subscription plan.';
			case 429:
				return 'ElevenLabs rate limit exceeded. Please wait and try again.';
			default:
				return message;
		}
	}

	async listVoices(apiKey: string): Promise<Array<{ id: string, name: string }>> {
		try {
			const response = await requestUrl({
				url: `${this.API_URL}/voices`,
				method: 'GET',
				headers: {
					'xi-api-key': apiKey
				}
			});

			if (response.status !== 200) {
				throw new Error(`Failed to fetch voices: ${response.status}`);
			}

			const data = response.json;
			return data.voices.map((voice: any) => ({
				id: voice.voice_id,
				name: voice.name
			}));
		} catch (error: any) {
			console.error('Failed to list ElevenLabs voices:', error);
			return [];
		}
	}

	async getUsage(apiKey: string): Promise<{ character_count: number, character_limit: number }> {
		try {
			const response = await requestUrl({
				url: `${this.API_URL}/user/subscription`,
				method: 'GET',
				headers: {
					'xi-api-key': apiKey
				}
			});

			if (response.status !== 200) {
				throw new Error(`Failed to fetch usage: ${response.status}`);
			}

			const data = response.json;
			return {
				character_count: data.character_count,
				character_limit: data.character_limit
			};
		} catch (error: any) {
			console.error('Failed to get ElevenLabs usage:', error);
			throw error;
		}
	}
}
