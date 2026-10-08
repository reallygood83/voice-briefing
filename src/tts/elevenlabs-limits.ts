/**
 * Character limits from ElevenLabs docs (checked 2026-10):
 * https://elevenlabs.io/text-to-speech-api
 */
export const ELEVENLABS_CHAR_LIMITS: Record<string, number> = {
	eleven_v4: 10000,
	eleven_v4_turbo: 10000,
	eleven_v3: 3000,
	eleven_multilingual_v2: 10000,
	eleven_flash_v2_5: 40000,
	eleven_turbo_v2_5: 40000,
	eleven_flash_v2: 40000,
	eleven_turbo_v2: 40000
};

export function elevenLabsCharLimit(modelId: string): number | undefined {
	return ELEVENLABS_CHAR_LIMITS[modelId];
}

export function assertElevenLabsTextLength(text: string, modelId: string): void {
	const limit = elevenLabsCharLimit(modelId);
	if (limit === undefined) return;
	if (text.length > limit) {
		throw new Error(
			`ElevenLabs model ${modelId} accepts ${limit} characters per request. This script is ${text.length} characters, so the audio would be cut off. Shorten the note or pick a model with a higher limit.`
		);
	}
}
