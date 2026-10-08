import axios from 'axios';
import { emptyScriptReason, extractGeneratedText, redactSecrets } from './extract-text';
import {
	estimateDurationSeconds,
	judgeScriptLength,
	lengthGuidance,
	trimScript
} from './script-length';

export interface ScriptGenerationOptions {
	content: string;
	language: string;
	style: 'metaphor' | 'feynman' | 'anchor' | 'custom';
	customPrompt?: string;
	provider: 'gemini' | 'xai' | 'openai' | 'anthropic';
	apiKey: string;
	modelName: string;
	onStatus?: (message: string) => void;
}

export interface ScriptGenerationResult {
	script: string;
	estimatedDuration: number;
}

export interface JsonResponse {
	status: number;
	data: unknown;
}

export type JsonRequester = (options: {
	url: string;
	body: unknown;
	headers?: Record<string, string>;
}) => Promise<JsonResponse>;

const MAX_EXPAND_ATTEMPTS = 2;

async function defaultRequester(options: {
	url: string;
	body: unknown;
	headers?: Record<string, string>;
}): Promise<JsonResponse> {
	const response = await axios.post(options.url, options.body, {
		headers: options.headers,
		validateStatus: () => true
	});
	return { status: response.status, data: response.data };
}

export class ScriptGenerator {
	constructor(private readonly request: JsonRequester = defaultRequester) {}

	async generate(options: ScriptGenerationOptions): Promise<ScriptGenerationResult> {
		let script = await this.generateScript(options);
		let attempts = 0;
		const custom = options.style === 'custom';

		while (!custom && judgeScriptLength(script, options.language) === 'short' && attempts < MAX_EXPAND_ATTEMPTS) {
			const seconds = estimateDurationSeconds(script, options.language);
			options.onStatus?.(`Script is about ${seconds}s. Expanding toward 1–2 minutes (attempt ${attempts + 1}).`);
			script = await this.expandScript(script, options);
			attempts++;
		}

		const beforeTrim = script;
		script = trimScript(script, options.language, custom);
		if (script.length < beforeTrim.length) {
			options.onStatus?.('Script was longer than the briefing limit, so it was trimmed at a sentence boundary.');
		}

		const estimatedDuration = estimateDurationSeconds(script, options.language);
		if (!custom && judgeScriptLength(script, options.language) === 'short') {
			options.onStatus?.(`Script is still about ${estimatedDuration}s after ${attempts} expansion attempt(s).`);
		}

		return { script, estimatedDuration };
	}

	buildSystemPrompt(language: string, style: string, customPrompt?: string): string {
		const languageInstructions: Record<string, string> = {
			'ko-KR': '한국어로',
			'en-US': 'in English',
			'ja-JP': '日本語で',
			'zh-CN': '用中文',
			'es-ES': 'en español',
			'fr-FR': 'en français',
			'de-DE': 'auf Deutsch'
		};
		const langInstruction = languageInstructions[language] || 'in English';
		const guidance = lengthGuidance(language, style);

		if (style === 'custom' && customPrompt) {
			return `You are a voice briefing script writer. ${customPrompt}\n\nWrite ${langInstruction}. ${guidance}`;
		}

		const stylePrompts: Record<string, string> = {
			metaphor: `You are a voice briefing script writer. Use one or two concrete analogies and keep the key message easy to hear.`,
			feynman: `You are a voice briefing script writer using the Feynman Technique.
1. Start with why this matters (1–2 sentences).
2. Explain the core idea simply.
3. Give one concrete example.
4. End with one takeaway.`,
			anchor: `You are a news anchor recording a short briefing. Be clear, specific, and free of filler.`
		};

		const body = stylePrompts[style] || stylePrompts.feynman;
		return `${body}\n\nWrite ${langInstruction}. ${guidance}`;
	}

	buildUserPrompt(content: string, language: string, style: string): string {
		const maxLength = 8000;
		const truncatedContent = content.length > maxLength
			? content.substring(0, maxLength) + '\n\n[... content truncated ...]'
			: content;

		return `Create a voice briefing script from the following note.

Structure:
1. Opening (1–2 sentences)
2. Core message
3. One-sentence close

LENGTH:
${lengthGuidance(language, style)}

NOTE CONTENT:
---
${truncatedContent}
---

Write the script only. Do not add a title or commentary.`;
	}

	private async generateScript(options: ScriptGenerationOptions): Promise<string> {
		const systemPrompt = this.buildSystemPrompt(options.language, options.style, options.customPrompt);
		const userPrompt = this.buildUserPrompt(options.content, options.language, options.style);
		return this.complete(options, systemPrompt, userPrompt);
	}

	private async expandScript(shortScript: string, options: ScriptGenerationOptions): Promise<string> {
		const seconds = estimateDurationSeconds(shortScript, options.language);
		const prompt = `The script below is about ${seconds} seconds when spoken. That is under the 60 second minimum.

Rewrite it as a 75–110 second briefing (about one to two minutes). Keep the same facts and tone.
Add the missing context, one example, and a closing takeaway.
Do not stop around 60 seconds. Do not exceed two minutes.

CURRENT SCRIPT:
---
${shortScript}
---

Output only the rewritten script.`;
		return this.complete(options, '', prompt);
	}

	private async complete(options: ScriptGenerationOptions, systemPrompt: string, userPrompt: string): Promise<string> {
		switch (options.provider) {
			case 'gemini':
				return this.generateWithGemini(systemPrompt, userPrompt, options.apiKey, options.modelName);
			case 'xai':
				return this.generateWithChat(
					'XAI',
					'https://api.x.ai/v1/chat/completions',
					systemPrompt,
					userPrompt,
					options.apiKey,
					options.modelName
				);
			case 'openai':
				return this.generateWithOpenAI(systemPrompt, userPrompt, options.apiKey, options.modelName);
			case 'anthropic':
				return this.generateWithAnthropic(systemPrompt, userPrompt, options.apiKey, options.modelName);
			default:
				throw new Error(`Unsupported AI provider: ${options.provider}`);
		}
	}

	private async generateWithGemini(systemPrompt: string, userPrompt: string, apiKey: string, model: string): Promise<string> {
		const response = await this.request({
			url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
			body: {
				contents: [{
					parts: [{ text: systemPrompt ? `${systemPrompt}\n\n${userPrompt}` : userPrompt }]
				}],
				generationConfig: {
					temperature: 0.8,
					maxOutputTokens: 4096
				}
			}
		});
		this.assertOk('Gemini', response);
		return this.requireText('Gemini', response.data);
	}

	private async generateWithChat(
		provider: string,
		url: string,
		systemPrompt: string,
		userPrompt: string,
		apiKey: string,
		model: string
	): Promise<string> {
		const messages = systemPrompt
			? [
				{ role: 'system', content: systemPrompt },
				{ role: 'user', content: userPrompt }
			]
			: [{ role: 'user', content: userPrompt }];

		const response = await this.request({
			url,
			headers: {
				'Authorization': `Bearer ${apiKey}`,
				'Content-Type': 'application/json'
			},
			body: {
				model,
				messages,
				temperature: 0.7,
				max_tokens: 2048
			}
		});
		this.assertOk(provider, response);
		return this.requireText(provider, response.data);
	}

	private async generateWithOpenAI(systemPrompt: string, userPrompt: string, apiKey: string, model: string): Promise<string> {
		if (/^(gpt-3\.5|gpt-4)/.test(model)) {
			return this.generateWithChat(
				'OpenAI',
				'https://api.openai.com/v1/chat/completions',
				systemPrompt,
				userPrompt,
				apiKey,
				model
			);
		}

		const input = systemPrompt
			? [
				{ role: 'system', content: systemPrompt },
				{ role: 'user', content: userPrompt }
			]
			: [{ role: 'user', content: userPrompt }];

		const response = await this.request({
			url: 'https://api.openai.com/v1/responses',
			headers: {
				'Authorization': `Bearer ${apiKey}`,
				'Content-Type': 'application/json'
			},
			body: {
				model,
				input,
				max_output_tokens: 2048
			}
		});
		this.assertOk('OpenAI', response);
		return this.requireText('OpenAI', response.data);
	}

	private async generateWithAnthropic(systemPrompt: string, userPrompt: string, apiKey: string, model: string): Promise<string> {
		const response = await this.request({
			url: 'https://api.anthropic.com/v1/messages',
			headers: {
				'x-api-key': apiKey,
				'anthropic-version': '2023-06-01',
				'Content-Type': 'application/json'
			},
			body: {
				model,
				max_tokens: 2048,
				...(systemPrompt ? { system: systemPrompt } : {}),
				messages: [{ role: 'user', content: userPrompt }]
			}
		});
		this.assertOk('Anthropic', response);
		return this.requireText('Anthropic', response.data);
	}

	private assertOk(provider: string, response: JsonResponse): void {
		if (response.status >= 200 && response.status < 300) return;
		const detail = emptyScriptReason(response.data);
		throw new Error(redactSecrets(`${provider} API error (${response.status}): ${detail}`));
	}

	private requireText(provider: string, data: unknown): string {
		const text = extractGeneratedText(data).trim();
		if (!text) {
			throw new Error(redactSecrets(`${provider}: ${emptyScriptReason(data)}`));
		}
		return text;
	}
}
