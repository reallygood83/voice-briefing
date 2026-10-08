import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
	buildKeyProbe,
	checkApiKey,
	checkClientId,
	checkFolderId,
	checkModelId,
	clampUnitInterval,
	probeNotice,
	visibleControls
} from '../src/settings/settings-form';

const base = {
	aiProvider: 'gemini' as const,
	ttsEngine: 'gemini' as const,
	briefingStyle: 'feynman',
	cloudSharingEnabled: false,
	googleDriveConnected: false
};

describe('settings visibility', () => {
	it('shows only the selected script provider and hides other API keys', () => {
		const ids = visibleControls({ ...base, aiProvider: 'openai', ttsEngine: 'edge' });
		assert.equal(ids.filter((id) => id === 'ai-key').length, 1);
		assert.equal(ids.includes('tts-key'), false);
		assert.equal(ids.includes('tts-voice'), true);
		assert.equal(ids.includes('advanced-stability'), false);
	});

	it('shows the Gemini key on the voice section when speech and script differ', () => {
		const ids = visibleControls({ ...base, aiProvider: 'anthropic', ttsEngine: 'gemini' });
		assert.ok(ids.includes('tts-key'));
		assert.ok(ids.includes('tts-model'));
		assert.equal(ids.includes('briefing-prompt'), false);
	});

	it('shows the custom prompt, drive login, and ElevenLabs tuning only when those choices are active', () => {
		const ids = visibleControls({
			...base,
			aiProvider: 'gemini',
			ttsEngine: 'elevenlabs',
			briefingStyle: 'custom',
			cloudSharingEnabled: true,
			googleDriveConnected: false
		});
		assert.ok(ids.includes('briefing-prompt'));
		assert.ok(ids.includes('drive-login'));
		assert.equal(ids.includes('drive-logout'), false);
		assert.ok(ids.includes('advanced-stability'));
	});

	it('switches the drive button to logout after a saved connection', () => {
		const ids = visibleControls({ ...base, cloudSharingEnabled: true, googleDriveConnected: true });
		assert.ok(ids.includes('drive-logout'));
		assert.ok(ids.includes('drive-test'));
		assert.equal(ids.includes('drive-login'), false);
	});
});

describe('settings validation', () => {
	it('rejects a pasted placeholder and keeps a real key trimmed', () => {
		assert.equal(checkApiKey('  sk-live-key-value  ').ok, true);
		assert.equal(checkApiKey('  sk-live-key-value  ').value, 'sk-live-key-value');
		assert.equal(checkApiKey('your-api-key').ok, false);
		assert.equal(checkApiKey('sk-...').ok, false);
	});

	it('rejects a model id with spaces and extracts a drive folder id from a URL', () => {
		assert.equal(checkModelId('gpt 6', false).ok, false);
		assert.equal(checkModelId(' gpt-6.1-sol ', true).value, 'gpt-6.1-sol');
		const folder = checkFolderId('https://drive.google.com/drive/folders/1abCDEFghij_klmnop');
		assert.equal(folder.ok, true);
		assert.equal(folder.value, '1abCDEFghij_klmnop');
		assert.match(folder.message, /폴더 ID/);
		assert.equal(checkClientId('desktop-client.apps.googleusercontent.com').ok, true);
		assert.equal(checkClientId('not-a-client').ok, false);
		assert.equal(clampUnitInterval(1.4, 0.5), 1);
		assert.equal(clampUnitInterval(Number.NaN, 0.5), 0.5);
	});
});

describe('connection probe', () => {
	it('builds a Gemini request and a notice that does not repeat the key', () => {
		const secret = 'AIzaSyEXAMPLEKEY123456';
		const probe = buildKeyProbe('gemini', secret);
		assert.match(probe.url, /key=AIzaSyEXAMPLEKEY123456/);
		assert.deepEqual(probe.headers, {});
		const ok = probeNotice(200, 'Gemini');
		const denied = probeNotice(401, 'Gemini');
		assert.equal(ok.ok, true);
		assert.equal(denied.ok, false);
		assert.equal(ok.message.includes(secret), false);
		assert.equal(denied.message.includes(secret), false);
		assert.throws(() => buildKeyProbe('openai', '   '), /API 키/);
	});
});
