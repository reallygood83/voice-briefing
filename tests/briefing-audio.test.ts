import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { audioBytesToWav, pcmDurationSeconds, pcmToWav, wavDataBytes } from '../src/audio/wav';
import { emptyScriptReason, extractGeneratedText, redactSecrets } from '../src/ai/extract-text';
import {
	estimateDurationSeconds,
	judgeScriptLength,
	trimScript
} from '../src/ai/script-length';
import { ScriptGenerator } from '../src/ai/script-generator';
import { assertElevenLabsTextLength } from '../src/tts/elevenlabs-limits';

describe('WAV header matches PCM length', () => {
	it('writes a 44-byte header whose data size is the padded PCM length', () => {
		const odd = Buffer.alloc(24000 * 2 * 60 + 1, 1);
		const wav = pcmToWav(odd);
		assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
		assert.equal(wav.toString('ascii', 8, 12), 'WAVE');
		assert.equal(wav.readUInt32LE(4), wav.length - 8);
		assert.equal(wav.toString('ascii', 36, 40), 'data');
		const dataSize = wav.readUInt32LE(40);
		assert.equal(dataSize % 2, 0);
		assert.equal(dataSize, wav.length - 44);
		assert.equal(Math.round(pcmDurationSeconds(dataSize)), 60);
	});

	it('does not wrap a WAV response a second time', () => {
		const pcm = Buffer.alloc(24000 * 2 * 90, 7);
		const original = pcmToWav(pcm);
		const again = audioBytesToWav(original);
		assert.equal(again.toString('ascii', 0, 4), 'RIFF');
		assert.notEqual(again.toString('ascii', 44, 48), 'RIFF');
		assert.equal(again.readUInt32LE(40), pcm.length);
		assert.equal(wavDataBytes(again), pcm.length);
	});

	it('repairs a data chunk that would stop playback at 60 seconds', () => {
		const pcm = Buffer.alloc(24000 * 2 * 90, 3);
		const wav = pcmToWav(pcm);
		const truncatedHeader = Buffer.from(wav);
		truncatedHeader.writeUInt32LE(24000 * 2 * 60, 40);
		truncatedHeader.writeUInt32LE(36 + 24000 * 2 * 60, 4);

		const repaired = audioBytesToWav(truncatedHeader);
		assert.equal(repaired.readUInt32LE(40), pcm.length);
		assert.equal(repaired.readUInt32LE(4), repaired.length - 8);
		assert.equal(Math.round(pcmDurationSeconds(repaired.readUInt32LE(40))), 90);
	});
});

describe('briefing length', () => {
	it('treats a 500-character English script as too short for one minute', () => {
		const script = 'word '.repeat(100).trim();
		assert.ok(script.length < 600);
		assert.equal(judgeScriptLength(script, 'en-US'), 'short');
		assert.ok(estimateDurationSeconds(script, 'en-US') < 60);
	});

	it('accepts an English script in the one to two minute range', () => {
		const script = 'This is a complete sentence about the note. '.repeat(40);
		assert.equal(judgeScriptLength(script, 'en-US'), 'ok');
	});

	it('trims a long built-in script at a sentence boundary inside two minutes', () => {
		const sentence = 'This sentence explains one concrete point from the note. ';
		const script = sentence.repeat(80);
		const trimmed = trimScript(script, 'en-US', false);
		assert.ok(trimmed.length < script.length);
		assert.equal(judgeScriptLength(trimmed, 'en-US'), 'ok');
		assert.match(trimmed, /\.\s*$/);
	});

	it('keeps a custom script that asks for more than two minutes, up to the TTS character ceiling', () => {
		const sentence = '커스텀 원고 문장입니다. ';
		const script = sentence.repeat(200);
		const trimmed = trimScript(script, 'ko-KR', true);
		assert.ok(trimmed.length <= 3000);
		assert.ok(trimmed.length > 120 * 6);
	});
});

describe('script generation retry', () => {
	it('expands a short script and does not ask for a 60 second cap', async () => {
		const bodies: string[] = [];
		let calls = 0;
		const generator = new ScriptGenerator(async (options) => {
			calls++;
			bodies.push(JSON.stringify(options.body));
			const text = calls === 1
				? 'Too short to brief.'
				: 'This is a complete sentence about the note. '.repeat(40);
			return {
				status: 200,
				data: { candidates: [{ content: { parts: [{ text }] } }] }
			};
		});

		const result = await generator.generate({
			content: 'A note about queues.',
			language: 'en-US',
			style: 'feynman',
			provider: 'gemini',
			apiKey: 'AIzaTESTKEY1234567890',
			modelName: 'gemini-3.8-flash'
		});

		assert.equal(calls, 2);
		assert.equal(judgeScriptLength(result.script, 'en-US'), 'ok');
		assert.ok(result.estimatedDuration >= 60);
		assert.ok(result.estimatedDuration <= 120);
		const prompts = bodies.join('\n');
		assert.match(prompts, /75–110 seconds/);
		assert.doesNotMatch(prompts, /60-90 seconds/);
		assert.doesNotMatch(prompts, /200-300 words/);
		assert.equal(prompts.includes('AIzaTESTKEY1234567890'), false);
	});

	it('surfaces a blocked Gemini response without the API key', async () => {
		const generator = new ScriptGenerator(async () => ({
			status: 200,
			data: { promptFeedback: { blockReason: 'SAFETY' }, candidates: [] }
		}));

		await assert.rejects(
			() => generator.generate({
				content: 'note',
				language: 'en-US',
				style: 'anchor',
				provider: 'gemini',
				apiKey: 'secret-key',
				modelName: 'gemini-3.8-flash'
			}),
			(error: any) => {
				assert.match(error.message, /SAFETY/);
				assert.equal(error.message.includes('secret-key'), false);
				return true;
			}
		);
	});

	it('redacts keys from provider errors', () => {
		const message = redactSecrets('Gemini API error: bad key=AIzaSyDUMMYKEYVALUE123456&x=1 Bearer abc.def');
		assert.equal(message.includes('AIzaSyDUMMYKEYVALUE123456'), false);
		assert.match(message, /key=REDACTED/);
		assert.match(message, /Bearer REDACTED/);
	});
});

describe('provider text extraction', () => {
	it('reads OpenAI responses output_text and Gemini parts', () => {
		assert.equal(extractGeneratedText({ output_text: ' hello ' }), ' hello ');
		assert.equal(
			extractGeneratedText({ candidates: [{ content: { parts: [{ text: '가' }, { text: '나' }] } }] }),
			'가나'
		);
		assert.match(emptyScriptReason({ promptFeedback: { blockReason: 'OTHER' } }), /OTHER/);
	});
});

describe('ElevenLabs length', () => {
	it('refuses to silently cut a v3 script past 3000 characters', () => {
		assert.throws(() => assertElevenLabsTextLength('a'.repeat(3001), 'eleven_v3'), /3000/);
	});

	it('allows a two-minute script on the default multilingual model', () => {
		assert.doesNotThrow(() => assertElevenLabsTextLength('a'.repeat(1800), 'eleven_multilingual_v2'));
	});
});
