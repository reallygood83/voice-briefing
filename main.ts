import { App, Plugin, PluginSettingTab, Setting, Notice, TFile } from 'obsidian';

// Plugin settings interface
interface VoiceBriefingSettings {
	// General Settings
	language: string;
	briefingStyle: 'metaphor' | 'feynman' | 'anchor' | 'custom';
	customStylePrompt: string;

	// AI Provider Settings
	aiProvider: 'gemini' | 'xai' | 'openai' | 'anthropic';
	apiKey: string;
	modelName: string;

	// TTS Settings
	ttsEngine: 'edge' | 'elevenlabs';
	edgeVoice: string;
	elevenLabsApiKey: string;
	elevenLabsVoiceId: string;

	// Cloud Sharing Settings
	cloudSharingEnabled: boolean;
	googleDriveConnected: boolean;
	googleDriveToken: string;
	googleDriveFolderId: string;
	linkFormat: 'html' | 'direct' | 'markdown';
}

const DEFAULT_SETTINGS: VoiceBriefingSettings = {
	language: 'ko-KR',
	briefingStyle: 'feynman',
	customStylePrompt: '',
	aiProvider: 'gemini',
	apiKey: '',
	modelName: 'gemini-2.0-flash',
	ttsEngine: 'edge',
	edgeVoice: 'ko-KR-SunHiNeural',
	elevenLabsApiKey: '',
	elevenLabsVoiceId: '',
	cloudSharingEnabled: false,
	googleDriveConnected: false,
	googleDriveToken: '',
	googleDriveFolderId: '',
	linkFormat: 'html'
}

export default class VoiceBriefingPlugin extends Plugin {
	settings: VoiceBriefingSettings;

	async onload() {
		await this.loadSettings();

		// Add ribbon icon
		this.addRibbonIcon('mic', 'Generate Voice Briefing', async () => {
			await this.generateVoiceBriefing();
		});

		// Add command
		this.addCommand({
			id: 'generate-voice-briefing',
			name: 'Generate Voice Briefing',
			callback: async () => {
				await this.generateVoiceBriefing();
			}
		});

		// Add settings tab
		this.addSettingTab(new VoiceBriefingSettingTab(this.app, this));

		console.log('Voice Briefing Plugin loaded');
	}

	async generateVoiceBriefing() {
		const activeFile = this.app.workspace.getActiveFile();

		if (!activeFile) {
			new Notice('No active note found');
			return;
		}

		// Validation
		if (!this.settings.apiKey) {
			new Notice('Please set your AI API key in settings');
			return;
		}

		try {
			new Notice('Generating voice briefing...');

			// Read note content
			const content = await this.app.vault.read(activeFile);

			// TODO: Generate script with AI
			// TODO: Convert script to audio with TTS
			// TODO: Save audio file
			// TODO: Embed audio in note
			// TODO: Upload to cloud if enabled

			new Notice('Voice briefing generated successfully!');
		} catch (error) {
			console.error('Error generating voice briefing:', error);
			new Notice('Failed to generate voice briefing. Check console for details.');
		}
	}

	onunload() {
		console.log('Voice Briefing Plugin unloaded');
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class VoiceBriefingSettingTab extends PluginSettingTab {
	plugin: VoiceBriefingPlugin;

	constructor(app: App, plugin: VoiceBriefingPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;
		containerEl.empty();

		// Header
		containerEl.createEl('h1', {text: 'Voice Briefing Settings'});

		// ====================
		// GENERAL SETTINGS
		// ====================
		containerEl.createEl('h2', {text: '🌐 General Settings'});

		// Language Setting
		new Setting(containerEl)
			.setName('Output Language')
			.setDesc('Select the language for voice briefing generation')
			.addDropdown(dropdown => dropdown
				.addOption('ko-KR', '🇰🇷 한국어 (Korean)')
				.addOption('en-US', '🇺🇸 English (US)')
				.addOption('ja-JP', '🇯🇵 日本語 (Japanese)')
				.addOption('zh-CN', '🇨🇳 中文 (Chinese)')
				.addOption('es-ES', '🇪🇸 Español (Spanish)')
				.addOption('fr-FR', '🇫🇷 Français (French)')
				.addOption('de-DE', '🇩🇪 Deutsch (German)')
				.setValue(this.plugin.settings.language)
				.onChange(async (value) => {
					this.plugin.settings.language = value;
					await this.plugin.saveSettings();
					// Auto-update TTS voice based on language
					this.autoSelectVoice(value);
				}));

		// Briefing Style
		new Setting(containerEl)
			.setName('Briefing Style')
			.setDesc('Choose how the briefing should be presented')
			.addDropdown(dropdown => dropdown
				.addOption('metaphor', '🌟 Metaphorical (Easy analogies)')
				.addOption('feynman', '🎓 Feynman Technique (Teaching style)')
				.addOption('anchor', '📰 News Anchor (Professional)')
				.addOption('custom', '✏️ Custom (Define your own)')
				.setValue(this.plugin.settings.briefingStyle)
				.onChange(async (value: any) => {
					this.plugin.settings.briefingStyle = value;
					await this.plugin.saveSettings();
					this.display(); // Refresh to show/hide custom prompt
				}));

		// Custom Style Prompt (only show if custom selected)
		if (this.plugin.settings.briefingStyle === 'custom') {
			new Setting(containerEl)
				.setName('Custom Style Prompt')
				.setDesc('Define your own briefing style instruction')
				.addTextArea(text => text
					.setPlaceholder('Example: Explain concepts as if talking to a 10-year-old...')
					.setValue(this.plugin.settings.customStylePrompt)
					.onChange(async (value) => {
						this.plugin.settings.customStylePrompt = value;
						await this.plugin.saveSettings();
					}));
		}

		// ====================
		// AI PROVIDER SETTINGS
		// ====================
		containerEl.createEl('h2', {text: '🤖 AI Provider Settings'});

		new Setting(containerEl)
			.setName('AI Provider')
			.setDesc('Select the AI service for script generation')
			.addDropdown(dropdown => dropdown
				.addOption('gemini', 'Google Gemini')
				.addOption('xai', 'XAI (Grok)')
				.addOption('openai', 'OpenAI')
				.addOption('anthropic', 'Anthropic (Claude)')
				.setValue(this.plugin.settings.aiProvider)
				.onChange(async (value: any) => {
					this.plugin.settings.aiProvider = value;
					await this.plugin.saveSettings();
					this.display(); // Refresh to update model suggestions
				}));

		new Setting(containerEl)
			.setName('API Key')
			.setDesc('Enter your AI provider API key')
			.addText(text => text
				.setPlaceholder('sk-...')
				.setValue(this.plugin.settings.apiKey)
				.onChange(async (value) => {
					this.plugin.settings.apiKey = value;
					await this.plugin.saveSettings();
				})
				.inputEl.type = 'password');

		new Setting(containerEl)
			.setName('Model Name')
			.setDesc('AI model to use for script generation')
			.addText(text => text
				.setPlaceholder(this.getDefaultModel())
				.setValue(this.plugin.settings.modelName)
				.onChange(async (value) => {
					this.plugin.settings.modelName = value;
					await this.plugin.saveSettings();
				}));

		// ====================
		// TTS SETTINGS
		// ====================
		containerEl.createEl('h2', {text: '🔊 Text-to-Speech Settings'});

		new Setting(containerEl)
			.setName('TTS Engine')
			.setDesc('Choose between free Edge TTS or premium ElevenLabs')
			.addDropdown(dropdown => dropdown
				.addOption('edge', 'Edge TTS (Free)')
				.addOption('elevenlabs', 'ElevenLabs (Premium)')
				.setValue(this.plugin.settings.ttsEngine)
				.onChange(async (value: any) => {
					this.plugin.settings.ttsEngine = value;
					await this.plugin.saveSettings();
					this.display(); // Refresh to show relevant settings
				}));

		if (this.plugin.settings.ttsEngine === 'edge') {
			new Setting(containerEl)
				.setName('Edge Voice')
				.setDesc('Select Edge TTS voice')
				.addDropdown(dropdown => {
					this.addEdgeVoiceOptions(dropdown);
					return dropdown
						.setValue(this.plugin.settings.edgeVoice)
						.onChange(async (value) => {
							this.plugin.settings.edgeVoice = value;
							await this.plugin.saveSettings();
						});
				});
		} else {
			new Setting(containerEl)
				.setName('ElevenLabs API Key')
				.setDesc('Enter your ElevenLabs API key')
				.addText(text => text
					.setPlaceholder('your-api-key')
					.setValue(this.plugin.settings.elevenLabsApiKey)
					.onChange(async (value) => {
						this.plugin.settings.elevenLabsApiKey = value;
						await this.plugin.saveSettings();
					})
					.inputEl.type = 'password');

			new Setting(containerEl)
				.setName('Voice ID')
				.setDesc('ElevenLabs voice ID')
				.addText(text => text
					.setPlaceholder('voice-id')
					.setValue(this.plugin.settings.elevenLabsVoiceId)
					.onChange(async (value) => {
						this.plugin.settings.elevenLabsVoiceId = value;
						await this.plugin.saveSettings();
					}));
		}

		// ====================
		// CLOUD SHARING SETTINGS
		// ====================
		containerEl.createEl('h2', {text: '☁️ Cloud Sharing'});

		new Setting(containerEl)
			.setName('Enable Cloud Sharing')
			.setDesc('Upload audio files to Google Drive for sharing')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.cloudSharingEnabled)
				.onChange(async (value) => {
					this.plugin.settings.cloudSharingEnabled = value;
					await this.plugin.saveSettings();
					this.display(); // Refresh to show Google Drive settings
				}));

		if (this.plugin.settings.cloudSharingEnabled) {
			const connectionSetting = new Setting(containerEl)
				.setName('Google Drive Connection')
				.setDesc(this.plugin.settings.googleDriveConnected
					? '✅ Connected'
					: '🔴 Not connected');

			if (!this.plugin.settings.googleDriveConnected) {
				connectionSetting.addButton(button => button
					.setButtonText('Connect with Google')
					.setCta()
					.onClick(async () => {
						// TODO: Implement OAuth flow
						new Notice('Google Drive connection will be implemented soon');
					}));
			} else {
				connectionSetting.addButton(button => button
					.setButtonText('Disconnect')
					.setWarning()
					.onClick(async () => {
						this.plugin.settings.googleDriveConnected = false;
						this.plugin.settings.googleDriveToken = '';
						await this.plugin.saveSettings();
						this.display();
					}));
			}

			// Advanced Settings (collapsed)
			const advancedDiv = containerEl.createDiv('voice-briefing-advanced');
			advancedDiv.createEl('h3', {text: '▸ Advanced Settings'});
			// TODO: Add collapsible advanced settings
		}
	}

	getDefaultModel(): string {
		const defaults: Record<string, string> = {
			'gemini': 'gemini-2.0-flash',
			'xai': 'grok-4-fast',
			'openai': 'gpt-4o',
			'anthropic': 'claude-3-5-sonnet'
		};
		return defaults[this.plugin.settings.aiProvider] || 'gemini-2.0-flash';
	}

	autoSelectVoice(language: string): void {
		const voiceMap: Record<string, string> = {
			'ko-KR': 'ko-KR-SunHiNeural',
			'en-US': 'en-US-AriaNeural',
			'ja-JP': 'ja-JP-NanamiNeural',
			'zh-CN': 'zh-CN-XiaoxiaoNeural',
			'es-ES': 'es-ES-ElviraNeural',
			'fr-FR': 'fr-FR-DeniseNeural',
			'de-DE': 'de-DE-KatjaNeural'
		};

		if (this.plugin.settings.ttsEngine === 'edge') {
			this.plugin.settings.edgeVoice = voiceMap[language] || voiceMap['en-US'];
			this.plugin.saveSettings();
		}
	}

	addEdgeVoiceOptions(dropdown: any): void {
		const lang = this.plugin.settings.language;

		// Language-specific voices
		const voices: Record<string, string[]> = {
			'ko-KR': ['ko-KR-SunHiNeural', 'ko-KR-InJoonNeural'],
			'en-US': ['en-US-AriaNeural', 'en-US-GuyNeural', 'en-US-JennyNeural'],
			'ja-JP': ['ja-JP-NanamiNeural', 'ja-JP-KeitaNeural'],
			'zh-CN': ['zh-CN-XiaoxiaoNeural', 'zh-CN-YunxiNeural'],
			'es-ES': ['es-ES-ElviraNeural', 'es-ES-AlvaroNeural'],
			'fr-FR': ['fr-FR-DeniseNeural', 'fr-FR-HenriNeural'],
			'de-DE': ['de-DE-KatjaNeural', 'de-DE-ConradNeural']
		};

		const availableVoices = voices[lang] || voices['en-US'];
		availableVoices.forEach(voice => {
			dropdown.addOption(voice, voice);
		});
	}
}
