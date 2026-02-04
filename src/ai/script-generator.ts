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
	private readonly MIN_SCRIPT_LENGTH = 1200;
	private readonly MAX_RETRIES = 2;

	async generate(options: ScriptGenerationOptions): Promise<ScriptGenerationResult> {
		let script = await this.generateScript(options);
		let attempts = 1;

		while (script.length < this.MIN_SCRIPT_LENGTH && attempts <= this.MAX_RETRIES) {
			console.log(`Script Generator: Script too short (${script.length} chars), expanding... (attempt ${attempts + 1})`);
			new Notice(`Expanding script... (attempt ${attempts + 1})`);
			
			script = await this.expandScript(script, options);
			attempts++;
		}

		const estimatedDuration = this.estimateDuration(script, options.language);
		console.log(`Script Generator: Final script ${script.length} chars, estimated ${estimatedDuration}s`);
		
		if (script.length < this.MIN_SCRIPT_LENGTH) {
			console.warn(`Script Generator: Script still short after ${attempts} attempts (${script.length} chars)`);
			new Notice(`Warning: Script is ${script.length} chars. Audio may be brief.`);
		}

		return { script, estimatedDuration };
	}

	private async generateScript(options: ScriptGenerationOptions): Promise<string> {
		const systemPrompt = this.buildSystemPrompt(options.language, options.style, options.customPrompt);
		const userPrompt = this.buildUserPrompt(options.content, options.language);

		switch (options.provider) {
			case 'gemini':
				return await this.generateWithGemini(systemPrompt, userPrompt, options.apiKey, options.modelName);
			case 'xai':
				return await this.generateWithXAI(systemPrompt, userPrompt, options.apiKey, options.modelName);
			case 'openai':
				return await this.generateWithOpenAI(systemPrompt, userPrompt, options.apiKey, options.modelName);
			case 'anthropic':
				return await this.generateWithAnthropic(systemPrompt, userPrompt, options.apiKey, options.modelName);
			default:
				throw new Error(`Unsupported AI provider: ${options.provider}`);
		}
	}

	private async expandScript(shortScript: string, options: ScriptGenerationOptions): Promise<string> {
		const expandPrompt = `The following script is too short for a proper voice briefing. Please EXPAND it to at least 300 words (1500+ characters) while maintaining the same topic and tone.

CURRENT SHORT SCRIPT (${shortScript.length} chars):
---
${shortScript}
---

EXPANSION REQUIREMENTS:
- Add more detailed explanations for each point
- Include relevant examples, analogies, or context
- Add smooth transitions between ideas
- Expand the introduction and conclusion
- The final script must be at least 1500 characters

Write the expanded script now (output ONLY the expanded script, no meta-commentary):`;

		switch (options.provider) {
			case 'gemini':
				return await this.generateWithGemini('', expandPrompt, options.apiKey, options.modelName);
			case 'xai':
				return await this.generateWithXAI('', expandPrompt, options.apiKey, options.modelName);
			case 'openai':
				return await this.generateWithOpenAI('', expandPrompt, options.apiKey, options.modelName);
			case 'anthropic':
				return await this.generateWithAnthropic('', expandPrompt, options.apiKey, options.modelName);
			default:
				return shortScript;
		}
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
			return `You are a voice briefing script writer. ${customPrompt}\n\nWrite ${langInstruction}. You MUST write at least 300 words (approximately 1.5-2 minutes of audio). Be detailed and thorough.`;
		}

		const stylePrompts: Record<string, string> = {
			'metaphor': `You are a voice briefing script writer who creates detailed, engaging audio content using analogies and metaphors.

Your writing style:
- Use relatable analogies to explain complex concepts
- Paint vivid mental pictures for listeners
- Connect abstract ideas to everyday experiences

Write ${langInstruction}. You MUST write at least 300 words (about 1.5-2 minutes of audio).`,

			'feynman': `You are a voice briefing script writer using the Feynman Technique - creating detailed explanations as if teaching someone completely new to the topic.

Your approach:
1. Start with WHY this matters to the listener
2. Break down HOW it works using simple, everyday language
3. Provide concrete examples and analogies
4. End with actionable takeaways

Write ${langInstruction}. You MUST write at least 300 words (about 1.5-2 minutes of audio). Never summarize briefly - always elaborate and explain thoroughly.`,

			'anchor': `You are a professional news anchor creating an in-depth briefing segment. Your style:
- Authoritative yet accessible
- Provides context and background
- Explains implications and significance
- Engages the listener throughout

Write ${langInstruction}. You MUST write at least 300 words (about 1.5-2 minutes of audio). This is a full segment, not a headline summary.`
		};

		return stylePrompts[style] || stylePrompts['feynman'];
	}

	private buildUserPrompt(content: string, language: string): string {
		const maxLength = 8000;
		const truncatedContent = content.length > maxLength
			? content.substring(0, maxLength) + '\n\n[... content truncated ...]'
			: content;

		return `Create a detailed voice briefing script (approximately 300-400 words, 1.5-2 minutes when spoken) from the following note content.

YOUR SCRIPT MUST INCLUDE:
1. An engaging opening hook (2-3 sentences)
2. Main content explanation with examples and context (10-15 sentences minimum)
3. Key insights or implications (3-4 sentences)
4. A memorable closing statement (1-2 sentences)

CRITICAL LENGTH REQUIREMENT:
- Minimum 300 words (approximately 1500 characters)
- Do NOT summarize briefly - EXPAND and ELABORATE on the content
- Add relevant context, examples, and explanations
- If the source content is short, add background information and implications

NOTE CONTENT TO TRANSFORM:
---
${truncatedContent}
---

Now write a comprehensive, engaging voice briefing script of at least 300 words. Start directly with the script content (no meta-commentary).`;
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
						temperature: 0.8,
						maxOutputTokens: 4096
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
