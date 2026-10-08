import {
	ANTHROPIC_TEXT_MIGRATIONS,
	GEMINI_TEXT_MIGRATIONS,
	GEMINI_TTS_MIGRATIONS,
	OPENAI_TEXT_MIGRATIONS,
	OPENAI_TTS_MIGRATIONS,
	XAI_TEXT_MIGRATIONS
} from '../models/catalog';

export interface MigratableSettings {
	apiKey?: string;
	modelName?: string;
	aiProvider?: string;
	geminiApiKey?: string;
	geminiModel?: string;
	xaiModel?: string;
	openaiModel?: string;
	anthropicModel?: string;
	geminiTtsModel?: string;
	openaiTtsModel?: string;
	elevenLabsModelId?: string;
	[key: string]: unknown;
}

function moveField(
	settings: MigratableSettings,
	field: keyof MigratableSettings,
	map: Record<string, string>,
	changes: string[]
): void {
	const current = settings[field];
	if (typeof current !== 'string' || !current) return;
	const next = map[current];
	if (!next || next === current) return;
	settings[field] = next;
	changes.push(`${String(field)}: ${current} -> ${next}`);
}

/**
 * Rewrite saved model ids that vendors have shut down or retired.
 * Unknown ids, including ones typed by the user, stay as they are.
 */
export function migrateModelSettings(settings: MigratableSettings): string[] {
	const changes: string[] = [];

	if (typeof settings.apiKey === 'string' && settings.apiKey && !settings.geminiApiKey) {
		settings.geminiApiKey = settings.apiKey;
		changes.push('apiKey -> geminiApiKey');
	}

	if (typeof settings.modelName === 'string' && settings.modelName && !settings.geminiModel && settings.aiProvider !== 'xai' && settings.aiProvider !== 'openai' && settings.aiProvider !== 'anthropic') {
		settings.geminiModel = settings.modelName;
		changes.push('modelName -> geminiModel');
	}

	moveField(settings, 'geminiModel', GEMINI_TEXT_MIGRATIONS, changes);
	moveField(settings, 'xaiModel', XAI_TEXT_MIGRATIONS, changes);
	moveField(settings, 'openaiModel', OPENAI_TEXT_MIGRATIONS, changes);
	moveField(settings, 'anthropicModel', ANTHROPIC_TEXT_MIGRATIONS, changes);
	moveField(settings, 'geminiTtsModel', GEMINI_TTS_MIGRATIONS, changes);
	moveField(settings, 'openaiTtsModel', OPENAI_TTS_MIGRATIONS, changes);

	return changes;
}
