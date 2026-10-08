export type AiProvider = 'gemini' | 'xai' | 'openai' | 'anthropic';
export type TtsEngine = 'edge' | 'elevenlabs' | 'gemini' | 'xai' | 'openai';

export interface SettingsVisibility {
	aiProvider: AiProvider;
	ttsEngine: TtsEngine;
	briefingStyle: string;
	cloudSharingEnabled: boolean;
	googleDriveConnected: boolean;
}

export interface FieldCheck {
	ok: boolean;
	value: string;
	message: string;
}

const MODEL_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const VOICE_ID = /^[A-Za-z0-9_-]{1,128}$/;
const FOLDER_ID = /^[A-Za-z0-9_-]{10,128}$/;

export function visibleControls(state: SettingsVisibility): string[] {
	const ids = [
		'section-ai',
		'ai-provider',
		'ai-key',
		'ai-test',
		'ai-model',
		'section-tts',
		'tts-engine'
	];

	const engineKey = ttsKeyProvider(state.ttsEngine);
	if (engineKey && engineKey !== state.aiProvider) {
		ids.push('tts-key', 'tts-test');
	}

	if (state.ttsEngine === 'gemini') ids.push('tts-model', 'tts-voice', 'tts-language');
	if (state.ttsEngine === 'openai') ids.push('tts-model', 'tts-voice', 'tts-voice-custom');
	if (state.ttsEngine === 'xai') ids.push('tts-voice', 'tts-xai-note');
	if (state.ttsEngine === 'edge') ids.push('tts-voice', 'tts-edge-test');
	if (state.ttsEngine === 'elevenlabs') ids.push('tts-model', 'tts-voice');

	ids.push('section-briefing', 'briefing-language', 'briefing-style');
	if (state.briefingStyle === 'custom') ids.push('briefing-prompt');

	ids.push('section-drive', 'drive-enabled');
	if (state.cloudSharingEnabled) {
		ids.push('drive-status', 'drive-client-id', 'drive-client-secret', 'drive-link', 'drive-folder');
		ids.push(state.googleDriveConnected ? 'drive-logout' : 'drive-login');
		if (state.googleDriveConnected) ids.push('drive-test');
	}

	ids.push('section-advanced');
	if (state.ttsEngine === 'elevenlabs') {
		ids.push('advanced-template', 'advanced-stability', 'advanced-similarity', 'advanced-style', 'advanced-boost');
	} else {
		ids.push('advanced-empty');
	}
	return ids;
}

export function ttsKeyProvider(engine: TtsEngine): AiProvider | 'elevenlabs' | null {
	if (engine === 'edge') return null;
	if (engine === 'elevenlabs') return 'elevenlabs';
	return engine;
}

export function checkApiKey(value: string): FieldCheck {
	const trimmed = value.trim();
	if (!trimmed) return { ok: true, value: '', message: '' };
	if (/\s/.test(trimmed) || trimmed.length < 8 || /your-api-key|sk-\.\.\.|AI\.\.\./i.test(trimmed)) {
		return { ok: false, value: trimmed, message: 'API 키 형식이 올바르지 않습니다. 공백 없이 발급된 키를 붙여 넣으세요.' };
	}
	return { ok: true, value: trimmed, message: '' };
}

export function checkModelId(value: string, allowEmpty: boolean): FieldCheck {
	const trimmed = value.trim();
	if (!trimmed && allowEmpty) return { ok: true, value: '', message: '' };
	if (!MODEL_ID.test(trimmed)) {
		return { ok: false, value: trimmed, message: '모델 ID는 영문, 숫자, ., _, :, - 만 사용할 수 있습니다.' };
	}
	return { ok: true, value: trimmed, message: '' };
}

export function checkVoiceId(value: string, allowEmpty: boolean): FieldCheck {
	const trimmed = value.trim();
	if (!trimmed && allowEmpty) return { ok: true, value: '', message: '' };
	if (!VOICE_ID.test(trimmed)) {
		return { ok: false, value: trimmed, message: '음성 ID는 영문, 숫자, _, - 만 사용할 수 있습니다.' };
	}
	return { ok: true, value: trimmed, message: '' };
}

export function checkFolderId(value: string): FieldCheck {
	const trimmed = value.trim();
	if (!trimmed) return { ok: true, value: '', message: '' };
	const fromUrl = trimmed.match(/\/folders\/([A-Za-z0-9_-]+)/);
	const id = fromUrl ? fromUrl[1] : trimmed;
	if (!FOLDER_ID.test(id)) {
		return { ok: false, value: trimmed, message: '폴더 ID를 확인하세요. 드라이브 폴더 주소라면 /folders/ 뒤의 ID만 저장합니다.' };
	}
	const message = fromUrl ? '주소에서 폴더 ID만 저장했습니다.' : '';
	return { ok: true, value: id, message };
}

export function checkClientId(value: string): FieldCheck {
	const trimmed = value.trim();
	if (!trimmed) return { ok: true, value: '', message: '' };
	if (/\s/.test(trimmed)) {
		return { ok: false, value: trimmed, message: '클라이언트 ID에 공백이 있습니다.' };
	}
	if (!trimmed.endsWith('.apps.googleusercontent.com')) {
		return { ok: false, value: trimmed, message: '데스크톱 클라이언트 ID는 .apps.googleusercontent.com 으로 끝납니다.' };
	}
	return { ok: true, value: trimmed, message: '' };
}

export function clampUnitInterval(value: number, fallback: number): number {
	if (!Number.isFinite(value)) return fallback;
	return Math.min(1, Math.max(0, value));
}

export interface ProbeSpec {
	url: string;
	headers: Record<string, string>;
}

export function buildKeyProbe(provider: AiProvider | 'elevenlabs', apiKey: string): ProbeSpec {
	const key = apiKey.trim();
	if (!key) throw new Error('API 키를 입력한 뒤 연결 테스트를 누르세요.');
	if (provider === 'gemini') {
		return {
			url: `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`,
			headers: {}
		};
	}
	if (provider === 'openai') {
		return { url: 'https://api.openai.com/v1/models', headers: { Authorization: `Bearer ${key}` } };
	}
	if (provider === 'anthropic') {
		return {
			url: 'https://api.anthropic.com/v1/models',
			headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' }
		};
	}
	if (provider === 'elevenlabs') {
		return { url: 'https://api.elevenlabs.io/v1/user', headers: { 'xi-api-key': key } };
	}
	return { url: 'https://api.x.ai/v1/api-key', headers: { Authorization: `Bearer ${key}` } };
}

export function probeNotice(status: number, label: string): { ok: boolean; message: string } {
	if (status === 200) return { ok: true, message: `${label}에 연결되었습니다.` };
	if (status === 401 || status === 403) return { ok: false, message: `${label} 키가 거부되었습니다.` };
	return { ok: false, message: `${label} 연결에 실패했습니다 (${status}).` };
}
