import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { migrateModelSettings } from '../src/settings/migrate-settings';
import {
	DEFAULT_ANTHROPIC_TEXT_MODEL,
	DEFAULT_ELEVENLABS_MODEL,
	DEFAULT_GEMINI_TEXT_MODEL,
	DEFAULT_GEMINI_TTS_MODEL,
	DEFAULT_OPENAI_TEXT_MODEL,
	DEFAULT_XAI_TEXT_MODEL,
	ELEVENLABS_MODELS
} from '../src/models/catalog';

describe('saved model migration', () => {
	it('moves the ids this plugin used to save onto current documented ids', () => {
		const settings = {
			geminiModel: 'gemini-2.0-flash',
			xaiModel: 'grok-4-1-fast',
			openaiModel: 'gpt-4o',
			anthropicModel: 'claude-3-5-sonnet-20241022',
			geminiTtsModel: 'gemini-2.5-flash-preview-tts',
			openaiTtsModel: 'tts-1-hd',
			elevenLabsModelId: 'eleven_multilingual_v2',
			customNote: 'leave me'
		};

		const changes = migrateModelSettings(settings);

		assert.equal(settings.geminiModel, DEFAULT_GEMINI_TEXT_MODEL);
		assert.equal(settings.xaiModel, DEFAULT_XAI_TEXT_MODEL);
		assert.equal(settings.openaiModel, DEFAULT_OPENAI_TEXT_MODEL);
		assert.equal(settings.anthropicModel, DEFAULT_ANTHROPIC_TEXT_MODEL);
		assert.equal(settings.geminiTtsModel, DEFAULT_GEMINI_TTS_MODEL);
		assert.equal(settings.openaiTtsModel, 'gpt-realtime-2.1-mini');
		assert.equal(settings.elevenLabsModelId, 'eleven_multilingual_v2');
		assert.equal(settings.customNote, 'leave me');
		assert.ok(changes.some((line) => line.includes('gemini-2.0-flash')));
		assert.equal(migrateModelSettings(settings).length, 0);
	});

	it('keeps a model id the user typed', () => {
		const settings = {
			geminiModel: 'my-gemini-finetune',
			elevenLabsModelId: 'my-eleven-voice-model',
			openaiModel: 'gpt-6-astra'
		};
		assert.deepEqual(migrateModelSettings(settings), []);
		assert.equal(settings.geminiModel, 'my-gemini-finetune');
		assert.equal(settings.elevenLabsModelId, 'my-eleven-voice-model');
		assert.equal(settings.openaiModel, 'gpt-6-astra');
	});

	it('copies a legacy apiKey only when the Gemini key is empty', () => {
		const settings = { apiKey: 'legacy-key', geminiApiKey: '' };
		migrateModelSettings(settings);
		assert.equal(settings.geminiApiKey, 'legacy-key');

		const kept = { apiKey: 'legacy-key', geminiApiKey: 'current-key' };
		migrateModelSettings(kept);
		assert.equal(kept.geminiApiKey, 'current-key');
	});

	it('lists Eleven v4 as the recommended default', () => {
		assert.equal(DEFAULT_ELEVENLABS_MODEL, 'eleven_v4');
		assert.ok(ELEVENLABS_MODELS.some((model) => model.id === 'eleven_v4'));
		assert.ok(ELEVENLABS_MODELS.some((model) => model.id === 'eleven_v4_turbo'));
	});
});
