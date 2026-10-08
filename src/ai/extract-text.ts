/** Pull assistant text out of Gemini, OpenAI, xAI, and Anthropic JSON bodies. */

export function extractGeneratedText(data: unknown): string {
	if (!data || typeof data !== 'object') return '';
	const body = data as Record<string, any>;

	if (typeof body.output_text === 'string' && body.output_text.trim()) {
		return body.output_text;
	}

	if (Array.isArray(body.output)) {
		const parts: string[] = [];
		for (const item of body.output) {
			if (typeof item?.content === 'string') parts.push(item.content);
			if (Array.isArray(item?.content)) {
				for (const part of item.content) {
					if (typeof part?.text === 'string') parts.push(part.text);
				}
			}
		}
		const joined = parts.join('');
		if (joined.trim()) return joined;
	}

	const chat = body.choices?.[0]?.message?.content;
	if (typeof chat === 'string' && chat.trim()) return chat;

	const geminiParts = body.candidates?.[0]?.content?.parts;
	if (Array.isArray(geminiParts)) {
		const text = geminiParts.map((part: any) => (typeof part?.text === 'string' ? part.text : '')).join('');
		if (text.trim()) return text;
	}

	const anthropic = body.content?.[0]?.text;
	if (typeof anthropic === 'string' && anthropic.trim()) return anthropic;

	return '';
}

export function emptyScriptReason(data: unknown): string {
	if (!data || typeof data !== 'object') return 'The provider returned an empty response.';
	const body = data as Record<string, any>;
	const block = body.promptFeedback?.blockReason;
	if (block) return `The provider blocked the response (${block}).`;
	const finish = body.candidates?.[0]?.finishReason;
	if (finish && finish !== 'STOP') return `The provider stopped early (${finish}).`;
	const apiMessage = body.error?.message || body.message;
	if (typeof apiMessage === 'string' && apiMessage.trim()) return apiMessage.trim();
	return 'The provider returned an empty script.';
}

/** Drop API keys and bearer tokens before anything is shown or logged. */
export function redactSecrets(message: string): string {
	return message
		.replace(/([?&]key=)[^&\s]+/gi, '$1REDACTED')
		.replace(/Bearer\s+\S+/gi, 'Bearer REDACTED')
		.replace(/\bsk-[A-Za-z0-9_\-]+\b/g, 'REDACTED')
		.replace(/\bxai-[A-Za-z0-9_\-]+\b/g, 'REDACTED')
		.replace(/\bAIza[0-9A-Za-z\-_]{10,}\b/g, 'REDACTED');
}
