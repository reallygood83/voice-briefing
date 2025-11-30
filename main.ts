import { App, Plugin, PluginSettingTab, Setting, Notice, TFile, Modal } from 'obsidian';

// Progress Modal for showing generation progress
class ProgressModal extends Modal {
	private stepsContainer!: HTMLElement;
	private currentStepEl!: HTMLElement;
	private progressBar!: HTMLElement;
	private statusText!: HTMLElement;
	private steps: { id: string; label: string; icon: string }[] = [
		{ id: 'script', label: 'Generating AI Script', icon: '📝' },
		{ id: 'audio', label: 'Converting to Audio', icon: '🔊' },
		{ id: 'upload', label: 'Uploading to Cloud', icon: '☁️' },
		{ id: 'embed', label: 'Embedding in Note', icon: '📄' },
	];
	private stepElements: Map<string, HTMLElement> = new Map();
	private hasCloudUpload: boolean;

	constructor(app: App, hasCloudUpload: boolean = false) {
		super(app);
		this.hasCloudUpload = hasCloudUpload;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('voice-briefing-progress-modal');

		// Title
		contentEl.createEl('h2', {
			text: '🎙️ Voice Briefing Generator',
			cls: 'voice-briefing-progress-title'
		});

		// Progress bar container
		const progressContainer = contentEl.createDiv({ cls: 'voice-briefing-progress-container' });
		this.progressBar = progressContainer.createDiv({ cls: 'voice-briefing-progress-bar' });
		this.statusText = progressContainer.createDiv({
			cls: 'voice-briefing-progress-percentage',
			text: '0%'
		});

		// Steps container
		this.stepsContainer = contentEl.createDiv({ cls: 'voice-briefing-steps-container' });

		// Filter steps based on cloud upload
		const activeSteps = this.hasCloudUpload
			? this.steps
			: this.steps.filter(s => s.id !== 'upload');

		activeSteps.forEach((step, index) => {
			const stepEl = this.stepsContainer.createDiv({ cls: 'voice-briefing-step-item' });
			stepEl.createSpan({ cls: 'voice-briefing-step-icon', text: '⏳' });
			stepEl.createSpan({ cls: 'voice-briefing-step-name', text: `${step.icon} ${step.label}` });
			stepEl.createSpan({ cls: 'voice-briefing-step-status', text: '' });

			stepEl.dataset.stepId = step.id;
			this.stepElements.set(step.id, stepEl);
		});

		// Current task status
		this.currentStepEl = contentEl.createDiv({
			cls: 'voice-briefing-current-task',
			text: 'Initializing...'
		});
	}

	setStep(stepId: string, status: 'pending' | 'active' | 'completed' | 'error' | 'skipped', message?: string) {
		const stepEl = this.stepElements.get(stepId);
		if (!stepEl) return;

		// Remove all status classes
		stepEl.removeClass('pending', 'active', 'completed', 'error', 'skipped');
		stepEl.addClass(status);

		// Update icon
		const iconEl = stepEl.querySelector('.voice-briefing-step-icon') as HTMLElement;
		if (iconEl) {
			switch (status) {
				case 'active':
					iconEl.textContent = '🔄';
					break;
				case 'completed':
					iconEl.textContent = '✅';
					break;
				case 'error':
					iconEl.textContent = '❌';
					break;
				case 'skipped':
					iconEl.textContent = '⏭️';
					break;
				default:
					iconEl.textContent = '⏳';
			}
		}

		// Update current task message
		if (message) {
			this.currentStepEl.textContent = message;
		}

		// Update progress bar
		this.updateProgressBar();
	}

	private updateProgressBar() {
		const totalSteps = this.hasCloudUpload ? 4 : 3;
		let completedSteps = 0;

		this.stepElements.forEach((el) => {
			if (el.hasClass('completed')) completedSteps++;
		});

		const percentage = Math.round((completedSteps / totalSteps) * 100);
		this.progressBar.style.width = `${percentage}%`;
		this.statusText.textContent = `${percentage}%`;
	}

	setProgress(percentage: number) {
		this.progressBar.style.width = `${percentage}%`;
		this.statusText.textContent = `${Math.round(percentage)}%`;
	}

	setStatusText(text: string) {
		this.currentStepEl.textContent = text;
	}

	showSuccess(message: string) {
		this.currentStepEl.textContent = message;
		this.progressBar.style.width = '100%';
		this.statusText.textContent = '100%';
	}

	showError(message: string) {
		this.currentStepEl.textContent = `❌ ${message}`;
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

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
	googleDriveRefreshToken: string;
	googleDriveTokenExpiresAt: number;
	googleDriveClientId: string;
	googleDriveClientSecret: string;
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
	googleDriveRefreshToken: '',
	googleDriveTokenExpiresAt: 0,
	googleDriveClientId: '',
	googleDriveClientSecret: '',
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

		// Additional validation for TTS
		if (this.settings.ttsEngine === 'elevenlabs') {
			if (!this.settings.elevenLabsApiKey) {
				new Notice('Please set your ElevenLabs API key in settings');
				return;
			}
			if (!this.settings.elevenLabsVoiceId) {
				new Notice('Please set your ElevenLabs voice ID in settings');
				return;
			}
		}

		// Check if cloud upload is enabled
		const hasCloudUpload = !!(this.settings.cloudSharingEnabled &&
			this.settings.googleDriveConnected &&
			this.settings.googleDriveToken);

		// Create and open progress modal
		const progressModal = new ProgressModal(this.app, hasCloudUpload);
		progressModal.open();

		try {
			// Read note content
			const content = await this.app.vault.read(activeFile);

			// Step 1: Generate script with AI
			progressModal.setStep('script', 'active', `Generating script for "${activeFile.basename}"...`);

			const { ScriptGenerator } = await import('./src/ai/script-generator');
			const scriptGenerator = new ScriptGenerator();

			const scriptResult = await scriptGenerator.generate({
				content: content,
				language: this.settings.language,
				style: this.settings.briefingStyle,
				customPrompt: this.settings.customStylePrompt,
				provider: this.settings.aiProvider,
				apiKey: this.settings.apiKey,
				modelName: this.settings.modelName
			});

			progressModal.setStep('script', 'completed', `Script generated (~${scriptResult.estimatedDuration}s audio)`);

			// Step 2: Convert script to audio with TTS
			progressModal.setStep('audio', 'active', `Converting to audio with ${this.settings.ttsEngine === 'edge' ? 'Edge TTS' : 'ElevenLabs'}...`);

			const { TTSGenerator } = await import('./src/tts/tts-generator');
			const ttsGenerator = new TTSGenerator();

			// Prepare audio file path with ABSOLUTE path
			const audioFileName = `${activeFile.basename}-briefing.mp3`;
			const fs = require('fs');
			const path = require('path');

			// Get vault's absolute base path
			const vaultBasePath = (this.app.vault.adapter as any).basePath;
			const audioDir = path.join(vaultBasePath, this.app.vault.configDir, 'voice-briefings');
			const audioPath = path.join(audioDir, audioFileName);

			// Ensure directory exists
			if (!fs.existsSync(audioDir)) {
				fs.mkdirSync(audioDir, { recursive: true });
			}

			const ttsResult = await ttsGenerator.generate({
				engine: this.settings.ttsEngine,
				text: scriptResult.script,
				outputPath: audioPath,
				edgeVoice: this.settings.edgeVoice,
				elevenLabsApiKey: this.settings.elevenLabsApiKey,
				elevenLabsVoiceId: this.settings.elevenLabsVoiceId
			});

			if (!ttsResult.success) {
				throw new Error(ttsResult.error || 'TTS generation failed');
			}

			progressModal.setStep('audio', 'completed', 'Audio file created successfully');

			// Step 3: Upload to Google Drive if enabled
			let audioEmbed = '';

			if (hasCloudUpload) {
				progressModal.setStep('upload', 'active', 'Uploading to Google Drive...');

				const { GoogleDriveClient } = await import('./src/cloud/google-drive-client');
				const driveClient = new GoogleDriveClient({
					accessToken: this.settings.googleDriveToken,
					refreshToken: this.settings.googleDriveRefreshToken || undefined,
					tokenExpiresAt: this.settings.googleDriveTokenExpiresAt || undefined,
					clientId: this.settings.googleDriveClientId || undefined,
					clientSecret: this.settings.googleDriveClientSecret || undefined,
					folderId: this.settings.googleDriveFolderId || undefined,
					onTokenRefresh: async (tokens) => {
						// Save refreshed tokens
						this.settings.googleDriveToken = tokens.accessToken;
						this.settings.googleDriveTokenExpiresAt = tokens.expiresAt;
						await this.saveSettings();
					}
				});

				const uploadResult = await driveClient.uploadFile(audioPath, audioFileName, 'audio/mpeg');

				if (uploadResult.success && uploadResult.downloadUrl) {
					// Always use HTML audio tag for direct playback in shared notes
					// This ensures the audio can be played directly when the note is shared
					audioEmbed = `\n\n## 🎧 Voice Briefing\n\n<audio controls style="width: 100%; max-width: 500px;">\n  <source src="${uploadResult.downloadUrl}" type="audio/mpeg">\n  Your browser does not support the audio element.\n</audio>\n\n*Generated on ${new Date().toLocaleString()} • Duration: ~${scriptResult.estimatedDuration}s*\n\n[📥 Download Audio](${uploadResult.downloadUrl}) | [📁 View in Google Drive](${uploadResult.publicUrl})\n`;

					progressModal.setStep('upload', 'completed', 'Uploaded to Google Drive');
					console.log('Audio embed created:', audioEmbed);
				} else {
					// Fallback to local file
					progressModal.setStep('upload', 'error', 'Cloud upload failed, using local file');
					audioEmbed = `\n\n## 🎧 Voice Briefing\n\n![[${audioFileName}]]\n\n*Generated on ${new Date().toLocaleString()} • Duration: ~${scriptResult.estimatedDuration}s*\n*⚠️ Cloud upload failed - audio stored locally only*\n`;
					console.log('Fallback to local file embed');
				}
			} else {
				// Local file only
				audioEmbed = `\n\n## 🎧 Voice Briefing\n\n![[${audioFileName}]]\n\n*Generated on ${new Date().toLocaleString()} • Duration: ~${scriptResult.estimatedDuration}s*\n`;
			}

			// Step 4: Embed audio in note
			progressModal.setStep('embed', 'active', 'Embedding audio in note...');

			console.log('Attempting to embed audio in note...');
			console.log('Current content length:', content.length);
			console.log('Audio embed to add:', audioEmbed);

			const newContent = content + audioEmbed;
			console.log('New content length:', newContent.length);

			await this.app.vault.modify(activeFile, newContent);
			console.log('Note modified successfully');

			progressModal.setStep('embed', 'completed', 'Audio embedded in note');

			// Show success
			progressModal.showSuccess('✅ Voice briefing generated successfully!');

			// Auto-close modal after 2 seconds
			setTimeout(() => {
				progressModal.close();
			}, 2000);

		} catch (error: any) {
			console.error('Error generating voice briefing:', error);
			console.error('Error stack:', error.stack);

			// Mark current step as error
			progressModal.showError(`❌ Error: ${error.message || 'Unknown error'}`);

			// Don't auto-close on error so user can see what happened
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
			// Google Cloud Credentials Section
			containerEl.createEl('h3', {text: '🔑 Google Cloud Credentials'});

			const credentialsInfo = containerEl.createDiv('voice-briefing-info');
			credentialsInfo.createEl('p', {
				text: '📋 First, get your credentials from Google Cloud Console:',
				cls: 'setting-item-description'
			});
			const steps = credentialsInfo.createEl('ol');
			steps.createEl('li', {text: 'Go to console.cloud.google.com'});
			steps.createEl('li', {text: 'Create a new project or select existing'});
			steps.createEl('li', {text: 'Enable Google Drive API'});
			steps.createEl('li', {text: 'Create OAuth 2.0 credentials (Desktop app)'});
			steps.createEl('li', {text: 'Copy Client ID and Client Secret below'});
			steps.createEl('li', {text: 'Add http://localhost:8585/callback to Authorized redirect URIs'});

			new Setting(containerEl)
				.setName('Client ID')
				.setDesc('OAuth 2.0 Client ID from Google Cloud Console')
				.addText(text => text
					.setPlaceholder('xxxx.apps.googleusercontent.com')
					.setValue(this.plugin.settings.googleDriveClientId)
					.onChange(async (value) => {
						this.plugin.settings.googleDriveClientId = value;
						await this.plugin.saveSettings();
						// Refresh UI to update connection button state
						this.display();
					}));

			new Setting(containerEl)
				.setName('Client Secret')
				.setDesc('OAuth 2.0 Client Secret from Google Cloud Console')
				.addText(text => {
					text.setPlaceholder('GOCSPX-...')
						.setValue(this.plugin.settings.googleDriveClientSecret)
						.onChange(async (value) => {
							this.plugin.settings.googleDriveClientSecret = value;
							await this.plugin.saveSettings();
							// Refresh UI to update connection button state
							this.display();
						});
					text.inputEl.type = 'password';
					return text;
				});

			// Connection Section
			containerEl.createEl('h3', {text: '🔗 Connection Status'});

			const hasCredentials = this.plugin.settings.googleDriveClientId && this.plugin.settings.googleDriveClientSecret;

			const connectionSetting = new Setting(containerEl)
				.setName('Google Drive Connection')
				.setDesc(this.plugin.settings.googleDriveConnected
					? '✅ Connected (token auto-refreshes)'
					: hasCredentials
						? '🔴 Not connected - Click to connect'
						: '⚠️ Enter Client ID and Secret above first');

			if (!this.plugin.settings.googleDriveConnected) {
				connectionSetting.addButton(button => button
					.setButtonText('Connect with Google')
					.setCta()
					.setDisabled(!hasCredentials)
					.onClick(async () => {
						if (!hasCredentials) {
							new Notice('⚠️ Please enter Client ID and Client Secret first');
							return;
						}

						try {
							new Notice('🔄 Starting Google OAuth flow...');

							const { GoogleOAuthFlow } = await import('./src/cloud/google-oauth-flow');
							const oauthFlow = new GoogleOAuthFlow({
								clientId: this.plugin.settings.googleDriveClientId,
								clientSecret: this.plugin.settings.googleDriveClientSecret,
								redirectPort: 8585
							});

							const tokens = await oauthFlow.startOAuthFlow();

							// Save tokens
							this.plugin.settings.googleDriveToken = tokens.accessToken;
							this.plugin.settings.googleDriveRefreshToken = tokens.refreshToken;
							this.plugin.settings.googleDriveTokenExpiresAt = tokens.expiresAt;
							this.plugin.settings.googleDriveConnected = true;
							await this.plugin.saveSettings();

							new Notice('✅ Google Drive connected successfully!');
							this.display(); // Refresh UI
						} catch (error: any) {
							console.error('OAuth error:', error);
							new Notice(`❌ Connection failed: ${error.message}`);
						}
					}));
			} else {
				// Show token expiry info
				const expiresAt = this.plugin.settings.googleDriveTokenExpiresAt;
				if (expiresAt) {
					const expiryDate = new Date(expiresAt);
					const now = new Date();
					const isExpired = now.getTime() >= expiresAt;

					connectionSetting.setDesc(
						isExpired
							? '⚠️ Token expired - will auto-refresh on next use'
							: `✅ Connected (expires: ${expiryDate.toLocaleString()})`
					);
				}

				connectionSetting
					.addButton(button => button
						.setButtonText('Test Connection')
						.onClick(async () => {
							new Notice('🔄 Testing Google Drive connection...');
							try {
								const { GoogleDriveClient } = await import('./src/cloud/google-drive-client');
								const client = new GoogleDriveClient({
									accessToken: this.plugin.settings.googleDriveToken,
									refreshToken: this.plugin.settings.googleDriveRefreshToken,
									tokenExpiresAt: this.plugin.settings.googleDriveTokenExpiresAt,
									clientId: this.plugin.settings.googleDriveClientId,
									clientSecret: this.plugin.settings.googleDriveClientSecret,
									onTokenRefresh: async (tokens) => {
										this.plugin.settings.googleDriveToken = tokens.accessToken;
										this.plugin.settings.googleDriveTokenExpiresAt = tokens.expiresAt;
										await this.plugin.saveSettings();
										this.display();
									}
								});
								const isConnected = await client.testConnection();
								if (isConnected) {
									const userInfo = await client.getUserInfo();
									new Notice(`✅ Connected as ${userInfo?.email || 'Unknown user'}`);
								} else {
									new Notice('❌ Connection test failed');
								}
							} catch (error: any) {
								new Notice(`❌ Connection test failed: ${error.message}`);
							}
						}))
					.addButton(button => button
						.setButtonText('Disconnect')
						.setWarning()
						.onClick(async () => {
							this.plugin.settings.googleDriveConnected = false;
							this.plugin.settings.googleDriveToken = '';
							this.plugin.settings.googleDriveRefreshToken = '';
							this.plugin.settings.googleDriveTokenExpiresAt = 0;
							this.plugin.settings.googleDriveFolderId = '';
							await this.plugin.saveSettings();
							this.display();
							new Notice('🔴 Disconnected from Google Drive');
						}));
			}

			// Link Format Setting
			new Setting(containerEl)
				.setName('Link Format')
				.setDesc('Choose how the audio link should be embedded in your note')
				.addDropdown(dropdown => dropdown
					.addOption('html', 'HTML Audio Player (Recommended)')
					.addOption('markdown', 'Markdown Link')
					.addOption('direct', 'Direct URL')
					.setValue(this.plugin.settings.linkFormat)
					.onChange(async (value: any) => {
						this.plugin.settings.linkFormat = value;
						await this.plugin.saveSettings();
					}));

			// Folder ID Setting
			new Setting(containerEl)
				.setName('Google Drive Folder ID (Optional)')
				.setDesc('Leave empty to upload to root, or paste folder ID from Drive URL')
				.addText(text => text
					.setPlaceholder('1a2b3c4d5e6f...')
					.setValue(this.plugin.settings.googleDriveFolderId || '')
					.onChange(async (value) => {
						this.plugin.settings.googleDriveFolderId = value;
						await this.plugin.saveSettings();
					}));

			// Info box
			const infoDiv = containerEl.createDiv('voice-briefing-info');
			infoDiv.createEl('p', {
				text: '💡 Tip: To find your folder ID, open the folder in Google Drive and copy the ID from the URL (the part after /folders/)',
				cls: 'setting-item-description'
			});

			// Token info for debugging (collapsible)
			if (this.plugin.settings.googleDriveConnected && this.plugin.settings.googleDriveRefreshToken) {
				const debugDiv = containerEl.createDiv('voice-briefing-debug');
				const details = debugDiv.createEl('details');
				details.createEl('summary', {text: '🔧 Advanced: Token Info'});
				const pre = details.createEl('pre');
				pre.style.fontSize = '11px';
				pre.style.background = '#f5f5f5';
				pre.style.padding = '8px';
				pre.style.borderRadius = '4px';
				pre.style.overflow = 'auto';
				pre.setText(`Access Token: ${this.plugin.settings.googleDriveToken.substring(0, 20)}...
Refresh Token: ${this.plugin.settings.googleDriveRefreshToken ? '✅ Saved' : '❌ Missing'}
Expires At: ${this.plugin.settings.googleDriveTokenExpiresAt ? new Date(this.plugin.settings.googleDriveTokenExpiresAt).toLocaleString() : 'Unknown'}`);
			}
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
