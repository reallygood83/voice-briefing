import { Notice } from 'obsidian';
import { EdgeTTSHandler } from './edge-tts-handler';
import { ElevenLabsHandler } from './elevenlabs-handler';
import { GeminiTTSHandler, GEMINI_TTS_VOICES, GEMINI_TTS_LANGUAGES } from './gemini-tts-handler';
import { XaiTTSHandler, XAI_TTS_VOICES } from './xai-tts-handler';

export interface TTSGenerationOptions {
	engine: 'edge' | 'elevenlabs' | 'gemini' | 'xai';
	text: string;
	outputPath: string;

	// Edge TTS options
	edgeVoice?: string;

	// ElevenLabs options
	elevenLabsApiKey?: string;
	elevenLabsVoiceId?: string;
	elevenLabsModelId?: string;

	// Gemini TTS options
	geminiApiKey?: string;
	geminiVoice?: string;
	geminiLanguage?: string;

	// xAI TTS options
	xaiApiKey?: string;
	xaiVoice?: string;
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
	private geminiHandler: GeminiTTSHandler;
	private xaiHandler: XaiTTSHandler;

	constructor() {
		this.edgeHandler = new EdgeTTSHandler();
		this.elevenLabsHandler = new ElevenLabsHandler();
		this.geminiHandler = new GeminiTTSHandler();
		this.xaiHandler = new XaiTTSHandler();
	}

	async generate(options: TTSGenerationOptions): Promise<TTSGenerationResult> {
		try {
			if (options.engine === 'edge') {
				return await this.generateWithEdgeTTS(options);
			} else if (options.engine === 'gemini') {
				return await this.generateWithGeminiTTS(options);
			} else if (options.engine === 'xai') {
				return await this.generateWithXaiTTS(options);
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

	private async generateWithGeminiTTS(options: TTSGenerationOptions): Promise<TTSGenerationResult> {
		if (!options.geminiApiKey) {
			throw new Error('Gemini API key is required for Gemini TTS');
		}

		// Gemini TTS outputs WAV, so we adjust the output path
		let outputPath = options.outputPath;
		if (outputPath.endsWith('.mp3')) {
			outputPath = outputPath.replace('.mp3', '.wav');
		}

		await this.geminiHandler.generate({
			apiKey: options.geminiApiKey,
			text: options.text,
			outputPath: outputPath,
			voiceName: options.geminiVoice || 'Kore',
			languageCode: options.geminiLanguage
		});

		return {
			success: true,
			audioPath: outputPath
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

	getGeminiVoices(): Array<{ name: string; style: string; gender: string }> {
		return this.geminiHandler.getVoices();
	}

	getGeminiLanguages(): Array<{ code: string; label: string }> {
		return this.geminiHandler.getLanguages();
	}

	private async generateWithXaiTTS(options: TTSGenerationOptions): Promise<TTSGenerationResult> {
		// xAI Realtime API requires WebSocket Authorization header which is not supported in browser/Electron environments
		new Notice('⚠️ xAI TTS는 현재 옵시디언 환경에서 지원되지 않습니다. Gemini 또는 Edge TTS를 사용해주세요.', 8000);
		throw new Error('xAI TTS는 현재 옵시디언 환경에서 지원되지 않습니다. (WebSocket Authorization 헤더 제한)');
	}

	getXaiVoices(): Array<{ name: string; style: string; gender: string }> {
		return this.xaiHandler.getVoices();
	}
}
