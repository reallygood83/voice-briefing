/**
 * Briefings are meant to be spoken for about one to two minutes.
 * Character budgets differ by language: a 500-character English script is
 * ~30 seconds, while the same count in Korean is closer to a minute.
 */

export const MIN_BRIEFING_SECONDS = 60;
export const MAX_BRIEFING_SECONDS = 120;
/** Eleven v3 accepts 3,000 characters per request. Stay under that for every engine. */
export const TTS_SAFE_CHAR_LIMIT = 3000;

const CHARS_PER_SECOND: Record<string, number> = {
	'en-US': 15,
	'ko-KR': 6,
	'ja-JP': 6,
	'zh-CN': 5,
	'es-ES': 15,
	'fr-FR': 14,
	'de-DE': 14
};

export type LengthVerdict = 'short' | 'ok' | 'long';

export function charsPerSecond(language: string): number {
	return CHARS_PER_SECOND[language] ?? 14;
}

export function estimateDurationSeconds(script: string, language: string): number {
	const chars = script.replace(/\s+/g, ' ').trim().length;
	if (chars === 0) return 0;
	return Math.round(chars / charsPerSecond(language));
}

export function charBudget(seconds: number, language: string): number {
	return Math.round(seconds * charsPerSecond(language));
}

export function judgeScriptLength(script: string, language: string): LengthVerdict {
	const seconds = estimateDurationSeconds(script, language);
	if (seconds < MIN_BRIEFING_SECONDS) return 'short';
	if (seconds > MAX_BRIEFING_SECONDS) return 'long';
	return 'ok';
}

export function trimToCharLimit(script: string, maxChars: number): string {
	const cleaned = script.trim();
	if (cleaned.length <= maxChars) return cleaned;

	const sentences = cleaned.match(/[^.!?。！？]+[.!?。！？]+/g);
	if (!sentences) return cleaned.slice(0, maxChars).trim();

	let trimmed = '';
	for (const sentence of sentences) {
		if ((trimmed + sentence).length > maxChars) break;
		trimmed += sentence;
	}
	return (trimmed.trim() || cleaned.slice(0, maxChars)).trim();
}

export function trimScript(script: string, language: string, respectCustomLength: boolean): string {
	const durationCap = charBudget(MAX_BRIEFING_SECONDS, language);
	const cap = respectCustomLength
		? TTS_SAFE_CHAR_LIMIT
		: Math.min(durationCap, TTS_SAFE_CHAR_LIMIT);
	return trimToCharLimit(script, cap);
}

export function lengthGuidance(language: string, style: string): string {
	if (style === 'custom') {
		return 'Follow the length in the system instructions. If none is given, aim for 75–110 seconds when spoken (about one to two minutes).';
	}
	const minChars = charBudget(75, language);
	const maxChars = charBudget(110, language);
	return `Target 75–110 seconds when spoken (about one to two minutes), roughly ${minChars}–${maxChars} characters. Do not stop around 60 seconds. Do not write a script longer than two minutes.`;
}
