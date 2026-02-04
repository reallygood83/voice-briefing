import { Notice, requestUrl } from 'obsidian';
import { writeFile } from 'fs/promises';

export interface ElevenLabsOptions {
	apiKey: string;
	voiceId: string;
	text: string;
	outputPath: string;
	modelId?: string;
	voiceSettings?: {
		stability: number;
		similarity_boost: number;
		style: number;
		use_speaker_boost: boolean;
	};
}

export class ElevenLabsHandler {
	private readonly API_URL = 'https://api.elevenlabs.io/v1';

	async generate(options: ElevenLabsOptions): Promise<void> {
		try {
			const modelId = options.modelId || 'eleven_multilingual_v2';

			const response = await requestUrl({
				url: `${this.API_URL}/text-to-speech/${options.voiceId}`,
				method: 'POST',
				headers: {
					'Accept': 'audio/mpeg',
					'Content-Type': 'application/json',
					'xi-api-key': options.apiKey
				},
				body: JSON.stringify({
					text: options.text,
					model_id: modelId,
					voice_settings: options.voiceSettings || {
						stability: 0.5,
						similarity_boost: 0.75,
						style: 0.0,
						use_speaker_boost: true
					}
				})
			});

			if (response.status !== 200) {
				throw new Error(`ElevenLabs API error: ${response.status}`);
			}

			// Save audio file
			const buffer = Buffer.from(response.arrayBuffer);
			await writeFile(options.outputPath, buffer);

			new Notice('✅ Audio generated successfully with ElevenLabs');
		} catch (error: any) {
			console.error('ElevenLabs error:', error);

			if (error.message.includes('401')) {
				throw new Error('Invalid ElevenLabs API key');
			}

			if (error.message.includes('quota')) {
				throw new Error('ElevenLabs quota exceeded. Please check your plan limits.');
			}

			throw new Error(`ElevenLabs generation failed: ${error.message}`);
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
