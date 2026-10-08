/**
 * Model ids copied from vendor docs on 2026-10-08. Do not invent ids here.
 *
 * Gemini text and TTS: https://ai.google.dev/gemini-api/docs/models
 * Gemini TTS guide: https://ai.google.dev/gemini-api/docs/speech-generation
 * xAI Grok 4.7: https://docs.x.ai/developers/grok-4-7
 * xAI model list: https://docs.x.ai/developers/models
 * OpenAI models: https://developers.openai.com/api/docs/models
 * OpenAI speech: https://developers.openai.com/api/docs/guides/text-to-speech
 * OpenAI deprecations: https://developers.openai.com/api/docs/deprecations
 * Anthropic: https://docs.anthropic.com/en/docs/about-claude/models/overview
 * ElevenLabs: https://elevenlabs.io/docs/eleven-creative/playground/text-to-speech
 * ElevenLabs v4: https://elevenlabs.io/v4
 * ElevenLabs limits: https://elevenlabs.io/text-to-speech-api
 */

export interface ModelOption {
	id: string;
	label: string;
}

export const GEMINI_TEXT_MODELS: ModelOption[] = [
	{ id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash (new projects)' },
	{ id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite (fast)' },
	{ id: 'gemini-3.7-flash', label: 'Gemini 3.7 Flash' },
	{ id: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash' },
	{ id: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash' },
	{ id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (legacy access)' }
];

export const GEMINI_TTS_MODELS: ModelOption[] = [
	{ id: 'gemini-3.8-flash-tts', label: 'Gemini 3.8 Flash TTS' },
	{ id: 'gemini-3.8-flash-lite-tts', label: 'Gemini 3.8 Flash-Lite TTS' },
	{ id: 'gemini-2.5-flash-preview-tts', label: 'Gemini 2.5 Flash TTS preview' },
	{ id: 'gemini-2.5-pro-preview-tts', label: 'Gemini 2.5 Pro TTS preview' }
];

export const XAI_TEXT_MODELS: ModelOption[] = [
	{ id: 'grok-4.7', label: 'Grok 4.7' },
	{ id: 'grok-4.6', label: 'Grok 4.6' },
	{ id: 'grok-4.5', label: 'Grok 4.5' },
	{ id: 'grok-4.3', label: 'Grok 4.3' }
];

export const OPENAI_TEXT_MODELS: ModelOption[] = [
	{ id: 'gpt-6-astra', label: 'GPT-6 Astra (flagship)' },
	{ id: 'gpt-6.1-sol', label: 'GPT-6.1 Sol (balance)' },
	{ id: 'gpt-6-luna', label: 'GPT-6 Luna (fast)' }
];

export const OPENAI_TTS_MODELS: ModelOption[] = [
	{ id: 'gpt-4o-mini-tts', label: 'GPT-4o mini TTS' },
	{ id: 'gpt-realtime-2.1-mini', label: 'GPT-Realtime 2.1 mini' }
];

export const OPENAI_TTS_VOICES: ModelOption[] = [
	'alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'nova',
	'onyx', 'sage', 'shimmer', 'verse', 'marin', 'cedar'
].map((id) => ({ id, label: id }));

export const ANTHROPIC_TEXT_MODELS: ModelOption[] = [
	{ id: 'claude-opus-5', label: 'Claude Opus 5' },
	{ id: 'claude-sonnet-5', label: 'Claude Sonnet 5' },
	{ id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' },
	{ id: 'claude-fable-5-1', label: 'Claude Fable 5.1' }
];

export const ELEVENLABS_MODELS: ModelOption[] = [
	{ id: 'eleven_v4', label: 'Eleven v4 (recommended)' },
	{ id: 'eleven_v4_turbo', label: 'Eleven v4 Turbo' },
	{ id: 'eleven_v3', label: 'Eleven v3' },
	{ id: 'eleven_flash_v2_5', label: 'Flash v2.5' },
	{ id: 'eleven_turbo_v2_5', label: 'Turbo v2.5' },
	{ id: 'eleven_multilingual_v2', label: 'Multilingual v2' },
	{ id: 'eleven_flash_v2', label: 'Flash v2' },
	{ id: 'eleven_turbo_v2', label: 'Turbo v2' }
];

export const DEFAULT_GEMINI_TEXT_MODEL = 'gemini-3.8-flash';
export const DEFAULT_GEMINI_TTS_MODEL = 'gemini-3.8-flash-tts';
export const DEFAULT_XAI_TEXT_MODEL = 'grok-4.7';
export const DEFAULT_OPENAI_TEXT_MODEL = 'gpt-6.1-sol';
export const DEFAULT_OPENAI_TTS_MODEL = 'gpt-4o-mini-tts';
export const DEFAULT_OPENAI_TTS_VOICE = 'coral';
export const DEFAULT_ANTHROPIC_TEXT_MODEL = 'claude-sonnet-5';
export const DEFAULT_ELEVENLABS_MODEL = 'eleven_v4';

/** Shut-down or retired ids this plugin used to save. Current ids are left alone. */
export const GEMINI_TEXT_MIGRATIONS: Record<string, string> = {
	'gemini-2.0-flash': DEFAULT_GEMINI_TEXT_MODEL,
	'gemini-2.0-flash-lite': 'gemini-3.5-flash-lite',
	'gemini-1.5-flash': DEFAULT_GEMINI_TEXT_MODEL,
	'gemini-1.5-flash-latest': DEFAULT_GEMINI_TEXT_MODEL,
	'gemini-1.5-pro': DEFAULT_GEMINI_TEXT_MODEL,
	'gemini-1.5-pro-latest': DEFAULT_GEMINI_TEXT_MODEL,
	'gemini-pro': DEFAULT_GEMINI_TEXT_MODEL
};

export const XAI_TEXT_MIGRATIONS: Record<string, string> = {
	'grok-4-1-fast': DEFAULT_XAI_TEXT_MODEL,
	'grok-4-1-fast-reasoning': DEFAULT_XAI_TEXT_MODEL,
	'grok-4-fast': DEFAULT_XAI_TEXT_MODEL,
	'grok-2': DEFAULT_XAI_TEXT_MODEL,
	'grok-2-latest': DEFAULT_XAI_TEXT_MODEL,
	'grok-beta': DEFAULT_XAI_TEXT_MODEL,
	'grok-3': DEFAULT_XAI_TEXT_MODEL
};

export const OPENAI_TEXT_MIGRATIONS: Record<string, string> = {
	'gpt-4o': DEFAULT_OPENAI_TEXT_MODEL,
	'gpt-4o-mini': 'gpt-6-luna',
	'gpt-4-turbo': DEFAULT_OPENAI_TEXT_MODEL,
	'gpt-4-turbo-preview': DEFAULT_OPENAI_TEXT_MODEL,
	'gpt-4': DEFAULT_OPENAI_TEXT_MODEL,
	'gpt-3.5-turbo': 'gpt-6-luna'
};

export const ANTHROPIC_TEXT_MIGRATIONS: Record<string, string> = {
	'claude-3-5-sonnet-20241022': DEFAULT_ANTHROPIC_TEXT_MODEL,
	'claude-3-5-sonnet-latest': DEFAULT_ANTHROPIC_TEXT_MODEL,
	'claude-3-7-sonnet-20250219': DEFAULT_ANTHROPIC_TEXT_MODEL,
	'claude-3-opus-20240229': 'claude-opus-5',
	'claude-3-haiku-20240307': 'claude-haiku-4-5-20251001',
	'claude-3-5-haiku-20241022': 'claude-haiku-4-5-20251001'
};

export const GEMINI_TTS_MIGRATIONS: Record<string, string> = {
	'gemini-2.5-flash-preview-tts': DEFAULT_GEMINI_TTS_MODEL,
	'gemini-2.5-pro-preview-tts': DEFAULT_GEMINI_TTS_MODEL,
	'gemini-3.1-flash-tts-preview': DEFAULT_GEMINI_TTS_MODEL
};

/** Dated speech snapshots shut down 2027-01-06. Replacement named in the deprecations doc. */
export const OPENAI_TTS_MIGRATIONS: Record<string, string> = {
	'tts-1': 'gpt-realtime-2.1-mini',
	'tts-1-hd': 'gpt-realtime-2.1-mini',
	'gpt-4o-mini-tts-2025-03-20': 'gpt-realtime-2.1-mini',
	'gpt-4o-mini-tts-2025-12-15': 'gpt-realtime-2.1-mini'
};
