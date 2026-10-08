import { Notice } from 'obsidian';
import { execDesktop } from '../desktop/files';

export interface EdgeTTSOptions {
	voice: string;
	text: string;
	outputPath: string;
}

export class EdgeTTSHandler {
	async generate(options: EdgeTTSOptions): Promise<void> {
		try {
			// Check if edge-tts is installed
			await this.checkEdgeTTSInstalled();

			// Generate audio using edge-tts CLI
			const command = `edge-tts --voice "${options.voice}" --text "${this.escapeText(options.text)}" --write-media "${options.outputPath}"`;

			await execDesktop(command);

			new Notice('✅ Audio generated successfully with Edge TTS');
		} catch (error: any) {
			console.error('Edge TTS error:', error);

			if (error.message.includes('edge-tts: command not found')) {
				throw new Error('Edge TTS is not installed. Please install it using: pip install edge-tts');
			}

			throw new Error(`Edge TTS generation failed: ${error.message}`);
		}
	}

	private async checkEdgeTTSInstalled(): Promise<void> {
		try {
			await execDesktop('edge-tts --help');
		} catch (error) {
			throw new Error('edge-tts: command not found');
		}
	}

	private escapeText(text: string): string {
		// Escape special characters for shell command
		return text
			.replace(/\\/g, '\\\\')
			.replace(/"/g, '\\"')
			.replace(/\$/g, '\\$')
			.replace(/`/g, '\\`');
	}

	async listVoices(): Promise<string[]> {
		try {
			const { stdout } = await execDesktop('edge-tts --list-voices');
			const voices = stdout.split('\n')
				.filter(line => line.includes('Name:'))
				.map(line => {
					const match = line.match(/Name: (.+)/);
					return match ? match[1].trim() : '';
				})
				.filter(v => v);

			return voices;
		} catch (error: any) {
			console.error('Failed to list Edge TTS voices:', error);
			return [];
		}
	}
}
