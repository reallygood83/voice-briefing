import { Platform } from 'obsidian';

export async function writeDesktopFile(filePath: string, data: Uint8Array | string): Promise<void> {
	if (!Platform.isDesktop) {
		throw new Error('Saving audio requires the desktop app.');
	}
	const { writeFile } = require('fs/promises');
	await writeFile(filePath, data);
}

export function readDesktopFile(filePath: string): Buffer {
	if (!Platform.isDesktop) {
		throw new Error('Reading audio requires the desktop app.');
	}
	const fs = require('fs');
	return fs.readFileSync(filePath);
}

export function ensureBriefingAudioPath(vaultBasePath: string, configDir: string, audioFileName: string): string {
	if (!Platform.isDesktop) {
		throw new Error('Saving briefing audio requires the desktop app.');
	}
	const fs = require('fs');
	const path = require('path');
	const audioDir = path.join(vaultBasePath, configDir, 'voice-briefings');
	if (!fs.existsSync(audioDir)) {
		fs.mkdirSync(audioDir, { recursive: true });
	}
	return path.join(audioDir, audioFileName);
}

export function execDesktop(command: string): Promise<{ stdout: string; stderr: string }> {
	if (!Platform.isDesktop) {
		throw new Error('Running a local command requires the desktop app.');
	}
	const { exec } = require('child_process');
	return new Promise((resolve, reject) => {
		exec(command, (error: Error | null, stdout: string | Buffer, stderr: string | Buffer) => {
			if (error) {
				reject(error);
				return;
			}
			resolve({ stdout: String(stdout), stderr: String(stderr) });
		});
	});
}
