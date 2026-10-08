import { Notice, requestUrl } from 'obsidian';
import { writeDesktopFile } from '../desktop/files';
import { redactSecrets } from '../ai/extract-text';
import { DEFAULT_OPENAI_TTS_MODEL, DEFAULT_OPENAI_TTS_VOICE } from '../models/catalog';

export interface OpenAiTTSOptions {
	apiKey: string;
	text: string;
	outputPath: string;
	modelId?: string;
	voice?: string;
}

export class OpenAiTTSHandler {
	private readonly API_URL = 'https://api.openai.com/v1/audio/speech';

	async generate(options: OpenAiTTSOptions): Promise<void> {
		if (!options.apiKey?.trim()) {
			throw new Error('OpenAI API key is required for OpenAI TTS');
		}
		if (!options.text?.trim()) {
			throw new Error('Text is required for OpenAI TTS');
		}

		const model = options.modelId || DEFAULT_OPENAI_TTS_MODEL;
		const voice = options.voice || DEFAULT_OPENAI_TTS_VOICE;

		try {
			const response = await requestUrl({
				url: this.API_URL,
				method: 'POST',
				headers: {
					'Authorization': `Bearer ${options.apiKey}`,
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					model,
					voice,
					input: options.text,
					response_format: 'mp3'
				}),
				throw: false
			});

			if (response.status !== 200) {
				throw new Error(this.parseError(response.status, response.json));
			}

			await writeDesktopFile(options.outputPath, Buffer.from(response.arrayBuffer));
			new Notice('✅ Audio generated successfully with OpenAI TTS');
		} catch (error: any) {
			const safeMessage = redactSecrets(error?.message || 'Unknown error');
			if (safeMessage.startsWith('OpenAI TTS')) {
				throw new Error(safeMessage);
			}
			console.error('OpenAI TTS error:', safeMessage);
			throw new Error(`OpenAI TTS generation failed: ${safeMessage}`);
		}
	}

	private parseError(status: number, body: any): string {
		const detail = body?.error?.message || body?.message || `HTTP ${status}`;
		if (status === 401) return 'OpenAI TTS: invalid API key.';
		return redactSecrets(`OpenAI TTS (${status}): ${detail}`);
	}
}
