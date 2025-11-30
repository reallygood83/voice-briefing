import { Notice } from 'obsidian';
import { EdgeTTSHandler } from './edge-tts-handler';
import { ElevenLabsHandler } from './elevenlabs-handler';

export interface TTSGenerationOptions {
	engine: 'edge' | 'elevenlabs';
	text: string;
	outputPath: string;

	// Edge TTS options
	edgeVoice?: string;

	// ElevenLabs options
	elevenLabsApiKey?: string;
	elevenLabsVoiceId?: string;
	elevenLabsModelId?: string;
}

export interface TTSGenerationResult {
	success: boolean;
	audioPath: string;
	duration?: number; // in seconds
	error?: string;
}

export class TTSGenerator {
	private edgeHandler: EdgeTTSHandler;
	private elevenLabsHandler: ElevenLabsHandler;

	constructor() {
		this.edgeHandler = new EdgeTTSHandler();
		this.elevenLabsHandler = new ElevenLabsHandler();
	}

	async generate(options: TTSGenerationOptions): Promise<TTSGenerationResult> {
		try {
			if (options.engine === 'edge') {
				return await this.generateWithEdgeTTS(options);
			} else {
				return await this.generateWithElevenLabs(options);
			}
		} catch (error: any) {
			console.error('TTS generation error:', error);
			return {
				success: false,
				audioPath: '',
				error: error.message
			};
		}
	}

	private async generateWithEdgeTTS(options: TTSGenerationOptions): Promise<TTSGenerationResult> {
		if (!options.edgeVoice) {
			throw new Error('Edge TTS voice is required');
		}

		await this.edgeHandler.generate({
			voice: options.edgeVoice,
			text: options.text,
			outputPath: options.outputPath
		});

		return {
			success: true,
			audioPath: options.outputPath
		};
	}

	private async generateWithElevenLabs(options: TTSGenerationOptions): Promise<TTSGenerationResult> {
		if (!options.elevenLabsApiKey || !options.elevenLabsVoiceId) {
			throw new Error('ElevenLabs API key and voice ID are required');
		}

		await this.elevenLabsHandler.generate({
			apiKey: options.elevenLabsApiKey,
			voiceId: options.elevenLabsVoiceId,
			text: options.text,
			outputPath: options.outputPath,
			modelId: options.elevenLabsModelId
		});

		return {
			success: true,
			audioPath: options.outputPath
		};
	}

	async listEdgeVoices(): Promise<string[]> {
		return await this.edgeHandler.listVoices();
	}

	async listElevenLabsVoices(apiKey: string): Promise<Array<{id: string, name: string}>> {
		return await this.elevenLabsHandler.listVoices(apiKey);
	}

	async getElevenLabsUsage(apiKey: string): Promise<{character_count: number, character_limit: number}> {
		return await this.elevenLabsHandler.getUsage(apiKey);
	}
}
