import { Notice } from 'obsidian';
import axios from 'axios';

export interface ScriptGenerationOptions {
	content: string;
	language: string;
	style: 'metaphor' | 'feynman' | 'anchor' | 'custom';
	customPrompt?: string;
	provider: 'gemini' | 'xai' | 'openai' | 'anthropic';
	apiKey: string;
	modelName: string;
}

export interface ScriptGenerationResult {
	script: string;
	estimatedDuration: number; // in seconds
}

export class ScriptGenerator {
	async generate(options: ScriptGenerationOptions): Promise<ScriptGenerationResult> {
		const systemPrompt = this.buildSystemPrompt(options.language, options.style, options.customPrompt);
		const userPrompt = this.buildUserPrompt(options.content, options.language);

		let script: string;

		switch (options.provider) {
			case 'gemini':
				script = await this.generateWithGemini(systemPrompt, userPrompt, options.apiKey, options.modelName);
				break;
			case 'xai':
				script = await this.generateWithXAI(systemPrompt, userPrompt, options.apiKey, options.modelName);
				break;
			case 'openai':
				script = await this.generateWithOpenAI(systemPrompt, userPrompt, options.apiKey, options.modelName);
				break;
			case 'anthropic':
				script = await this.generateWithAnthropic(systemPrompt, userPrompt, options.apiKey, options.modelName);
				break;
			default:
				throw new Error(`Unsupported AI provider: ${options.provider}`);
		}

		const estimatedDuration = this.estimateDuration(script, options.language);

		console.log(`Script Generator: Generated ${script.length} chars, estimated ${estimatedDuration}s`);
		
		if (script.length < 1000) {
			console.warn(`Script Generator: Script is too short (${script.length} chars). Expected 1500+ chars for proper briefing.`);
			new Notice(`Warning: Generated script is short (${script.length} chars). Audio may be brief.`);
		}

		return {
			script,
			estimatedDuration
		};
	}

	private buildSystemPrompt(language: string, style: string, customPrompt?: string): string {
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

		if (style === 'custom' && customPrompt) {
			return `You are a voice briefing script writer. ${customPrompt}\n\nWrite the script ${langInstruction}. Make it conversational and suitable for audio playback (1-2 minutes long).`;
		}

		const stylePrompts: Record<string, string> = {
			'metaphor': `You are a voice briefing script writer who uses simple, relatable analogies and metaphors to explain concepts.
Example: "Think of this concept like a traffic system - data flows like cars on roads, with routers acting as traffic lights..."

Write the script ${langInstruction}. Make it engaging and easy to understand for a general audience.
IMPORTANT: Your script MUST be 1500-2500 characters long (about 1.5-2 minutes when spoken aloud).`,

			'feynman': `You are a voice briefing script writer using the Feynman Technique - explain concepts as if teaching someone who knows nothing about the topic.
Focus on:
1. Why this matters
2. How it works (simple terms)
3. Key takeaways

Write the script ${langInstruction}. Use simple language and avoid jargon.
IMPORTANT: Your script MUST be 1500-2500 characters long (about 1.5-2 minutes when spoken aloud).`,

			'anchor': `You are a professional news anchor writing a briefing script. Be:
- Concise and objective
- Professional but engaging
- Clear and authoritative

Write the script ${langInstruction}. Structure it like a news segment.
IMPORTANT: Your script MUST be 1500-2500 characters long (about 1.5-2 minutes when spoken aloud).`
		};

		return stylePrompts[style] || stylePrompts['feynman'];
	}

	private buildUserPrompt(content: string, language: string): string {
		const maxLength = 8000;
		const truncatedContent = content.length > maxLength
			? content.substring(0, maxLength) + '\n\n[... content truncated ...]'
			: content;

		return `Create a voice briefing script from the following note content.

REQUIREMENTS:
- Length: MUST be 1500-2500 characters (approximately 1.5-2 minutes when spoken)
- Extract and explain the key points thoroughly
- Make it conversational and suitable for audio listening
- Include an engaging introduction and clear conclusion

NOTE CONTENT:
${truncatedContent}

Remember: The script MUST be at least 1500 characters long. Expand on the key points with context and examples if needed.`;
	}

	private async generateWithGemini(systemPrompt: string, userPrompt: string, apiKey: string, model: string): Promise<string> {
		try {
			const response = await axios.post(
				`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
				{
					contents: [{
						parts: [{
							text: systemPrompt + '\n\n' + userPrompt
						}]
					}],
					generationConfig: {
						temperature: 0.7,
						maxOutputTokens: 2048
					}
				}
			);

			return response.data.candidates[0].content.parts[0].text;
		} catch (error: any) {
			throw new Error(`Gemini API error: ${error.response?.data?.error?.message || error.message}`);
		}
	}

	private async generateWithXAI(systemPrompt: string, userPrompt: string, apiKey: string, model: string): Promise<string> {
		try {
			console.log('XAI API Request:', {
				model,
				endpoint: 'https://api.x.ai/v1/chat/completions',
				messageCount: 2
			});

			const response = await axios.post(
				'https://api.x.ai/v1/chat/completions',
				{
					model: model,
					messages: [
						{ role: 'system', content: systemPrompt },
						{ role: 'user', content: userPrompt }
					],
					temperature: 0.7,
					max_tokens: 2048,
					stream: false
				},
				{
					headers: {
						'Authorization': `Bearer ${apiKey}`,
						'Content-Type': 'application/json'
					}
				}
			);

			return response.data.choices[0].message.content;
		} catch (error: any) {
			// Enhanced error logging
			console.error('XAI API Error Details:', {
				status: error.response?.status,
				statusText: error.response?.statusText,
				data: error.response?.data,
				message: error.message,
				model: model
			});

			const errorMessage = error.response?.data?.error?.message
				|| error.response?.data?.message
				|| error.message;
			const errorDetails = error.response?.data ? JSON.stringify(error.response.data) : 'No details';

			throw new Error(`XAI API error (${error.response?.status || 'unknown'}): ${errorMessage}\nDetails: ${errorDetails}`);
		}
	}

	private async generateWithOpenAI(systemPrompt: string, userPrompt: string, apiKey: string, model: string): Promise<string> {
		try {
			const response = await axios.post(
				'https://api.openai.com/v1/chat/completions',
				{
					model: model,
					messages: [
						{ role: 'system', content: systemPrompt },
						{ role: 'user', content: userPrompt }
					],
					temperature: 0.7,
					max_tokens: 2048
				},
				{
					headers: {
						'Authorization': `Bearer ${apiKey}`,
						'Content-Type': 'application/json'
					}
				}
			);

			return response.data.choices[0].message.content;
		} catch (error: any) {
			throw new Error(`OpenAI API error: ${error.response?.data?.error?.message || error.message}`);
		}
	}

	private async generateWithAnthropic(systemPrompt: string, userPrompt: string, apiKey: string, model: string): Promise<string> {
		try {
			const response = await axios.post(
				'https://api.anthropic.com/v1/messages',
				{
					model: model,
					max_tokens: 2048,
					system: systemPrompt,
					messages: [
						{ role: 'user', content: userPrompt }
					]
				},
				{
					headers: {
						'x-api-key': apiKey,
						'anthropic-version': '2023-06-01',
						'Content-Type': 'application/json'
					}
				}
			);

			return response.data.content[0].text;
		} catch (error: any) {
			throw new Error(`Anthropic API error: ${error.response?.data?.error?.message || error.message}`);
		}
	}

	private estimateDuration(script: string, language: string): number {
		// Rough estimation based on words per minute (WPM)
		// Average speaking rate: 150 WPM for most languages
		const wpmRates: Record<string, number> = {
			'ko-KR': 180, // Korean tends to be faster
			'en-US': 150,
			'ja-JP': 170,
			'zh-CN': 160,
			'es-ES': 165,
			'fr-FR': 160,
			'de-DE': 140
		};

		const wpm = wpmRates[language] || 150;

		// Estimate word count (rough approximation)
		const wordCount = script.split(/\s+/).length;
		const durationMinutes = wordCount / wpm;
		const durationSeconds = Math.round(durationMinutes * 60);

		return durationSeconds;
	}
}
