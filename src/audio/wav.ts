/** PCM/WAV helpers for TTS audio. Gemini documents 24 kHz, 16-bit, mono. */

export const GEMINI_TTS_SAMPLE_RATE = 24000;
export const PCM_BITS_PER_SAMPLE = 16;
export const PCM_CHANNELS = 1;
const HEADER_SIZE = 44;

export function isWav(data: Buffer): boolean {
	return data.length >= 12
		&& data.toString('ascii', 0, 4) === 'RIFF'
		&& data.toString('ascii', 8, 12) === 'WAVE';
}

export function bytesPerFrame(bitsPerSample: number, channels: number): number {
	return channels * (bitsPerSample / 8);
}

export function pcmDurationSeconds(
	pcmBytes: number,
	sampleRate = GEMINI_TTS_SAMPLE_RATE,
	bitsPerSample = PCM_BITS_PER_SAMPLE,
	channels = PCM_CHANNELS
): number {
	const bytesPerSecond = sampleRate * bytesPerFrame(bitsPerSample, channels);
	if (bytesPerSecond <= 0) return 0;
	return pcmBytes / bytesPerSecond;
}

/** 16-bit samples must be aligned. A trailing odd byte makes players stop early or click. */
export function padPcm(
	pcm: Buffer,
	bitsPerSample = PCM_BITS_PER_SAMPLE,
	channels = PCM_CHANNELS
): Buffer {
	const align = bytesPerFrame(bitsPerSample, channels);
	if (align <= 0) return pcm;
	const remainder = pcm.length % align;
	if (remainder === 0) return pcm;
	const padded = Buffer.alloc(pcm.length + (align - remainder));
	pcm.copy(padded);
	return padded;
}

export function pcmToWav(
	pcmData: Buffer,
	sampleRate = GEMINI_TTS_SAMPLE_RATE,
	bitsPerSample = PCM_BITS_PER_SAMPLE,
	channels = PCM_CHANNELS
): Buffer {
	const pcm = padPcm(pcmData, bitsPerSample, channels);
	const align = bytesPerFrame(bitsPerSample, channels);
	const byteRate = sampleRate * align;
	const dataSize = pcm.length;
	const wavBuffer = Buffer.alloc(HEADER_SIZE + dataSize);

	wavBuffer.write('RIFF', 0);
	wavBuffer.writeUInt32LE(36 + dataSize, 4);
	wavBuffer.write('WAVE', 8);
	wavBuffer.write('fmt ', 12);
	wavBuffer.writeUInt32LE(16, 16);
	wavBuffer.writeUInt16LE(1, 20);
	wavBuffer.writeUInt16LE(channels, 22);
	wavBuffer.writeUInt32LE(sampleRate, 24);
	wavBuffer.writeUInt32LE(byteRate, 28);
	wavBuffer.writeUInt16LE(align, 32);
	wavBuffer.writeUInt16LE(bitsPerSample, 34);
	wavBuffer.write('data', 36);
	wavBuffer.writeUInt32LE(dataSize, 40);
	pcm.copy(wavBuffer, HEADER_SIZE);
	return wavBuffer;
}

interface DataChunk {
	sizeOffset: number;
	dataOffset: number;
	declaredSize: number;
}

function findDataChunk(wav: Buffer): DataChunk | null {
	let offset = 12;
	while (offset + 8 <= wav.length) {
		const id = wav.toString('ascii', offset, offset + 4);
		const size = wav.readUInt32LE(offset + 4);
		if (id === 'data') {
			return { sizeOffset: offset + 4, dataOffset: offset + 8, declaredSize: size };
		}
		const step = 8 + size + (size % 2);
		if (step <= 0) break;
		offset += step;
	}
	return null;
}

function readFormat(wav: Buffer): { sampleRate: number; bitsPerSample: number; channels: number } {
	if (wav.toString('ascii', 12, 16) === 'fmt ' && wav.length >= 36) {
		return {
			channels: wav.readUInt16LE(22) || PCM_CHANNELS,
			sampleRate: wav.readUInt32LE(24) || GEMINI_TTS_SAMPLE_RATE,
			bitsPerSample: wav.readUInt16LE(34) || PCM_BITS_PER_SAMPLE
		};
	}
	return {
		channels: PCM_CHANNELS,
		sampleRate: GEMINI_TTS_SAMPLE_RATE,
		bitsPerSample: PCM_BITS_PER_SAMPLE
	};
}

/**
 * Gemini 3.8 TTS unary responses are WAV (`audio/wav`).
 * Gemini 2.5 TTS and earlier return headerless PCM (`audio/l16`).
 * A data-chunk size smaller than the PCM that follows makes players stop early
 * (the "audio dies around 60 seconds" symptom when the header under-reports).
 */
export function audioBytesToWav(
	audioBytes: Buffer,
	sampleRate = GEMINI_TTS_SAMPLE_RATE,
	bitsPerSample = PCM_BITS_PER_SAMPLE,
	channels = PCM_CHANNELS
): Buffer {
	if (!isWav(audioBytes)) {
		return pcmToWav(audioBytes, sampleRate, bitsPerSample, channels);
	}
	return repairWavLengths(audioBytes);
}

export function repairWavLengths(wav: Buffer): Buffer {
	const chunk = findDataChunk(wav);
	if (!chunk) {
		return pcmToWav(wav);
	}

	const format = readFormat(wav);
	const align = bytesPerFrame(format.bitsPerSample, format.channels) || 2;
	const available = wav.length - chunk.dataOffset;
	const usable = available - (available % align);
	const headerMatches = chunk.declaredSize === usable
		&& wav.readUInt32LE(4) === wav.length - 8;

	if (headerMatches) {
		return wav;
	}

	const pcm = wav.subarray(chunk.dataOffset, chunk.dataOffset + usable);
	return pcmToWav(Buffer.from(pcm), format.sampleRate, format.bitsPerSample, format.channels);
}

export function wavDataBytes(wav: Buffer): number {
	const chunk = findDataChunk(wav);
	if (!chunk) return 0;
	return Math.min(chunk.declaredSize, Math.max(0, wav.length - chunk.dataOffset));
}
