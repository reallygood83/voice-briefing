/**
 * Voice Briefing - Obsidian Plugin
 *
 * Copyright (c) 2025 reallygood83. All Rights Reserved.
 *
 * This software is for personal use only.
 * Commercial use is PROHIBITED without explicit written permission from the author.
 * Any use beyond personal use requires written permission.
 *
 * For licensing inquiries: https://github.com/reallygood83/voice-note-obsidian
 * See LICENSE file for full terms.
 */

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

// Import Gemini TTS voices and languages
import { GEMINI_TTS_VOICES, GEMINI_TTS_LANGUAGES } from './src/tts/gemini-tts-handler';

// Quick Options Modal - Neo-Brutalism Style
class QuickOptionsModal extends Modal {
	private settings: VoiceBriefingSettings;
	private onSubmit: (options: QuickOptions) => void;
	private currentOptions: QuickOptions;

	constructor(app: App, settings: VoiceBriefingSettings, onSubmit: (options: QuickOptions) => void) {
		super(app);
		this.settings = settings;
		this.onSubmit = onSubmit;
		this.currentOptions = {
			ttsEngine: settings.ttsEngine,
			geminiVoice: settings.geminiTtsVoice,
			geminiLanguage: settings.geminiTtsLanguage,
			edgeVoice: settings.edgeVoice,
			briefingStyle: settings.briefingStyle,
			customPrompt: ''
		};
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('voice-briefing-quick-options-modal');

		// Title
		const titleEl = contentEl.createEl('h2', {
			text: '⚡ QUICK OPTIONS',
			cls: 'voice-briefing-quick-options-title'
		});

		// Form container
		const formEl = contentEl.createDiv({ cls: 'voice-briefing-quick-options-form' });

		// TTS Engine Selection
		this.createSection(formEl, '🔊 TTS Engine', (container) => {
			const select = container.createEl('select', { cls: 'voice-briefing-select' });

			const engines = [
				{ value: 'gemini', label: '🤖 Gemini TTS (Recommended)' },
				{ value: 'edge', label: '🔷 Edge TTS (Free)' },
				{ value: 'elevenlabs', label: '🟣 ElevenLabs (Premium)' }
			];

			engines.forEach(engine => {
				const option = select.createEl('option', { text: engine.label, value: engine.value });
				if (engine.value === this.currentOptions.ttsEngine) {
					option.selected = true;
				}
			});

			select.addEventListener('change', () => {
				this.currentOptions.ttsEngine = select.value as 'edge' | 'elevenlabs' | 'gemini';
				this.refreshForm();
			});
		});

		// Gemini Voice Selection (only show if Gemini is selected)
		if (this.currentOptions.ttsEngine === 'gemini') {
			this.createSection(formEl, '🎭 Voice', (container) => {
				const select = container.createEl('select', { cls: 'voice-briefing-select' });

				// Group voices by gender
				const femaleVoices = GEMINI_TTS_VOICES.filter(v => v.gender === 'F');
				const maleVoices = GEMINI_TTS_VOICES.filter(v => v.gender === 'M');

				// Female voices group
				const femaleGroup = select.createEl('optgroup', { attr: { label: '👩 Female Voices' } });
				femaleVoices.forEach(voice => {
					const option = femaleGroup.createEl('option', {
						text: `${voice.name} - ${voice.style}`,
						value: voice.name
					});
					if (voice.name === this.currentOptions.geminiVoice) {
						option.selected = true;
					}
				});

				// Male voices group
				const maleGroup = select.createEl('optgroup', { attr: { label: '👨 Male Voices' } });
				maleVoices.forEach(voice => {
					const option = maleGroup.createEl('option', {
						text: `${voice.name} - ${voice.style}`,
						value: voice.name
					});
					if (voice.name === this.currentOptions.geminiVoice) {
						option.selected = true;
					}
				});

				select.addEventListener('change', () => {
					this.currentOptions.geminiVoice = select.value;
				});
			});

			this.createSection(formEl, '🌐 Language', (container) => {
				const select = container.createEl('select', { cls: 'voice-briefing-select' });

				GEMINI_TTS_LANGUAGES.forEach(lang => {
					const option = select.createEl('option', {
						text: lang.label,
						value: lang.code
					});
					if (lang.code === this.currentOptions.geminiLanguage) {
						option.selected = true;
					}
				});

				select.addEventListener('change', () => {
					this.currentOptions.geminiLanguage = select.value;
				});
			});
		}

		// Edge Voice Selection (only show if Edge is selected)
		if (this.currentOptions.ttsEngine === 'edge') {
			this.createSection(formEl, '🎭 Edge Voice', (container) => {
				const select = container.createEl('select', { cls: 'voice-briefing-select' });

				const edgeVoices: Record<string, string[]> = {
					'Korean': ['ko-KR-SunHiNeural', 'ko-KR-InJoonNeural'],
					'English (US)': ['en-US-AriaNeural', 'en-US-GuyNeural', 'en-US-JennyNeural'],
					'Japanese': ['ja-JP-NanamiNeural', 'ja-JP-KeitaNeural'],
					'Chinese': ['zh-CN-XiaoxiaoNeural', 'zh-CN-YunxiNeural'],
					'Spanish': ['es-ES-ElviraNeural', 'es-ES-AlvaroNeural'],
					'French': ['fr-FR-DeniseNeural', 'fr-FR-HenriNeural'],
					'German': ['de-DE-KatjaNeural', 'de-DE-ConradNeural']
				};

				Object.entries(edgeVoices).forEach(([lang, voices]) => {
					const group = select.createEl('optgroup', { attr: { label: lang } });
					voices.forEach(voice => {
						const option = group.createEl('option', { text: voice, value: voice });
						if (voice === this.currentOptions.edgeVoice) {
							option.selected = true;
						}
					});
				});

				select.addEventListener('change', () => {
					this.currentOptions.edgeVoice = select.value;
				});
			});
		}

		// ElevenLabs note (if selected)
		if (this.currentOptions.ttsEngine === 'elevenlabs') {
			const noteEl = formEl.createDiv({ cls: 'voice-briefing-note' });
			noteEl.createEl('p', {
				text: '💡 ElevenLabs uses settings from Plugin Settings page.',
				cls: 'voice-briefing-note-text'
			});
		}

		// Briefing Style Selection
		this.createSection(formEl, '📝 Briefing Style', (container) => {
			const select = container.createEl('select', { cls: 'voice-briefing-select' });

			const styles = [
				{ value: 'metaphor', label: '🌟 Metaphorical (Easy analogies)' },
				{ value: 'feynman', label: '🎓 Feynman Technique (Teaching style)' },
				{ value: 'anchor', label: '📰 News Anchor (Professional)' },
				{ value: 'custom', label: '✏️ Custom (Use prompt below)' }
			];

			styles.forEach(style => {
				const option = select.createEl('option', { text: style.label, value: style.value });
				if (style.value === this.currentOptions.briefingStyle) {
					option.selected = true;
				}
			});

			select.addEventListener('change', () => {
				this.currentOptions.briefingStyle = select.value as 'metaphor' | 'feynman' | 'anchor' | 'custom';
				this.refreshForm();
			});
		});

		// Custom Prompt (always show, but indicate if it will be used)
		this.createSection(formEl, '✍️ Custom Prompt (optional)', (container) => {
			const textarea = container.createEl('textarea', {
				cls: 'voice-briefing-textarea',
				attr: {
					placeholder: this.settings.customStylePrompt
						? `Default: "${this.settings.customStylePrompt.substring(0, 50)}..."`
						: 'Enter custom instructions for the briefing style...',
					rows: '3'
				}
			});
			textarea.value = this.currentOptions.customPrompt;

			textarea.addEventListener('input', () => {
				this.currentOptions.customPrompt = textarea.value;
			});

			const hintEl = container.createDiv({ cls: 'voice-briefing-hint' });
			hintEl.createEl('span', {
				text: '💡 Leave empty to use default prompt from settings',
				cls: 'voice-briefing-hint-text'
			});
		});

		// Generate Button
		const buttonContainer = contentEl.createDiv({ cls: 'voice-briefing-button-container' });
		const generateBtn = buttonContainer.createEl('button', {
			text: '🎙️ GENERATE BRIEFING',
			cls: 'voice-briefing-generate-btn'
		});

		generateBtn.addEventListener('click', () => {
			this.close();
			this.onSubmit(this.currentOptions);
		});

		// Cancel Button
		const cancelBtn = buttonContainer.createEl('button', {
			text: 'Cancel',
			cls: 'voice-briefing-cancel-btn'
		});

		cancelBtn.addEventListener('click', () => {
			this.close();
		});
	}

	private createSection(parent: HTMLElement, label: string, contentFn: (container: HTMLElement) => void) {
		const section = parent.createDiv({ cls: 'voice-briefing-section' });
		section.createEl('label', { text: label, cls: 'voice-briefing-label' });
		const container = section.createDiv({ cls: 'voice-briefing-control' });
		contentFn(container);
	}

	private refreshForm() {
		this.onOpen();
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

	// Provider-specific API Keys (saved separately)
	geminiApiKey: string;
	xaiApiKey: string;
	openaiApiKey: string;
	anthropicApiKey: string;

	// Provider-specific Model Names (saved separately)
	geminiModel: string;
	xaiModel: string;
	openaiModel: string;
	anthropicModel: string;

	// Legacy field (for migration)
	apiKey?: string;
	modelName?: string;

	// TTS Settings
	ttsEngine: 'edge' | 'elevenlabs' | 'gemini';
	edgeVoice: string;
	elevenLabsApiKey: string;
	elevenLabsVoiceId: string;

	// Gemini TTS Settings
	geminiTtsVoice: string;
	geminiTtsLanguage: string;

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

// Quick Options interface for modal
interface QuickOptions {
	ttsEngine: 'edge' | 'elevenlabs' | 'gemini';
	geminiVoice: string;
	geminiLanguage: string;
	edgeVoice: string;
	briefingStyle: 'metaphor' | 'feynman' | 'anchor' | 'custom';
	customPrompt: string;
}

const DEFAULT_SETTINGS: VoiceBriefingSettings = {
	language: 'ko-KR',
	briefingStyle: 'feynman',
	customStylePrompt: '',
	aiProvider: 'gemini',

	// Provider-specific API Keys
	geminiApiKey: '',
	xaiApiKey: '',
	openaiApiKey: '',
	anthropicApiKey: '',

	// Provider-specific Models
	geminiModel: 'gemini-2.0-flash',
	xaiModel: 'grok-4-1-fast',
	openaiModel: 'gpt-4o',
	anthropicModel: 'claude-3-5-sonnet-20241022',

	ttsEngine: 'gemini',
	edgeVoice: 'ko-KR-SunHiNeural',
	elevenLabsApiKey: '',
	elevenLabsVoiceId: '',

	// Gemini TTS defaults
	geminiTtsVoice: 'Kore',
	geminiTtsLanguage: 'auto',

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

		// Validation - Check current provider's API key
		const currentApiKey = this.getCurrentApiKey();
		if (!currentApiKey) {
			new Notice(`Please set your ${this.settings.aiProvider.toUpperCase()} API key in settings`);
			return;
		}

		// Show Quick Options Modal first
		const quickOptionsModal = new QuickOptionsModal(this.app, this.settings, async (options: QuickOptions) => {
			await this.executeVoiceBriefing(activeFile, options);
		});
		quickOptionsModal.open();
	}

	private async executeVoiceBriefing(activeFile: TFile, options: QuickOptions) {
		// Additional validation for TTS based on selected engine
		if (options.ttsEngine === 'elevenlabs') {
			if (!this.settings.elevenLabsApiKey) {
				new Notice('Please set your ElevenLabs API key in settings');
				return;
			}
			if (!this.settings.elevenLabsVoiceId) {
				new Notice('Please set your ElevenLabs voice ID in settings');
				return;
			}
		}

		if (options.ttsEngine === 'gemini') {
			if (!this.settings.geminiApiKey) {
				new Notice('Please set your Gemini API key in settings (same as AI Provider)');
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

			// Determine custom prompt: use Quick Options if provided, otherwise fallback to settings
			const effectiveCustomPrompt = options.customPrompt.trim() || this.settings.customStylePrompt;

			const scriptResult = await scriptGenerator.generate({
				content: content,
				language: this.settings.language,
				style: options.briefingStyle,
				customPrompt: effectiveCustomPrompt,
				provider: this.settings.aiProvider,
				apiKey: this.getCurrentApiKey(),
				modelName: this.getCurrentModel()
			});

			progressModal.setStep('script', 'completed', `Script generated (~${scriptResult.estimatedDuration}s audio)`);

			// Step 2: Convert script to audio with TTS
			const ttsEngineLabel = options.ttsEngine === 'edge' ? 'Edge TTS' :
				options.ttsEngine === 'gemini' ? 'Gemini TTS' : 'ElevenLabs';
			progressModal.setStep('audio', 'active', `Converting to audio with ${ttsEngineLabel}...`);

			const { TTSGenerator } = await import('./src/tts/tts-generator');
			const ttsGenerator = new TTSGenerator();

			// Prepare audio file path with ABSOLUTE path
			// Note: Gemini TTS outputs .wav, Edge/ElevenLabs output .mp3
			const audioExtension = options.ttsEngine === 'gemini' ? 'wav' : 'mp3';
			const audioFileName = `${activeFile.basename}-briefing.${audioExtension}`;
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
				engine: options.ttsEngine,
				text: scriptResult.script,
				outputPath: audioPath,
				edgeVoice: options.edgeVoice,
				elevenLabsApiKey: this.settings.elevenLabsApiKey,
				elevenLabsVoiceId: this.settings.elevenLabsVoiceId,
				// Gemini TTS options
				geminiApiKey: this.settings.geminiApiKey,
				geminiVoice: options.geminiVoice,
				geminiLanguage: options.geminiLanguage
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

				if (uploadResult.success && uploadResult.fileId) {
					// Google Drive audio embed - using the embed player URL format
					// Format: https://drive.google.com/file/d/FILE_ID/preview for full player
					const driveEmbedUrl = `https://drive.google.com/file/d/${uploadResult.fileId}/preview`;
					const driveViewUrl = `https://drive.google.com/file/d/${uploadResult.fileId}/view`;

					// Use iframe with proper dimensions for audio player
					// Height 100 works well for Google Drive audio player
					audioEmbed = `

---

## 🎧 Voice Briefing

<iframe
	src="${driveEmbedUrl}"
	width="640"
	height="100"
	frameborder="0"
	allowfullscreen="true"
	allow="autoplay; encrypted-media">
</iframe>

> 📅 *Generated: ${new Date().toLocaleString()}*
> ⏱️ *Duration: ~${scriptResult.estimatedDuration}s*

**Links:** [🔗 Open in Google Drive](${driveViewUrl}) | [📥 Download](${uploadResult.downloadUrl || driveViewUrl})

---
`;

					progressModal.setStep('upload', 'completed', 'Uploaded to Google Drive');
					console.log('Audio embed created with fileId:', uploadResult.fileId);
					console.log('Embed URL:', driveEmbedUrl);
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

			// Step 4: Embed audio in note (right after YAML frontmatter/properties)
			progressModal.setStep('embed', 'active', 'Embedding audio in note...');

			console.log('Attempting to embed audio in note...');
			console.log('Current content length:', content.length);
			console.log('Audio embed to add:', audioEmbed);

			// Find the position right after YAML frontmatter (properties)
			// YAML frontmatter starts with --- and ends with ---
			let newContent: string;
			const frontmatterRegex = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/;
			const frontmatterMatch = content.match(frontmatterRegex);

			if (frontmatterMatch) {
				// Insert audio embed right after frontmatter
				const frontmatterEnd = frontmatterMatch[0].length;
				const beforeEmbed = content.substring(0, frontmatterEnd);
				const afterEmbed = content.substring(frontmatterEnd);
				newContent = beforeEmbed + audioEmbed + '\n' + afterEmbed;
				console.log('Inserted audio embed after YAML frontmatter');
			} else {
				// No frontmatter found, insert at the beginning
				newContent = audioEmbed + '\n' + content;
				console.log('No frontmatter found, inserted at beginning');
			}

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

	// Get current provider's API key
	getCurrentApiKey(): string {
		const provider = this.settings.aiProvider;
		switch (provider) {
			case 'gemini':
				return this.settings.geminiApiKey;
			case 'xai':
				return this.settings.xaiApiKey;
			case 'openai':
				return this.settings.openaiApiKey;
			case 'anthropic':
				return this.settings.anthropicApiKey;
			default:
				return '';
		}
	}

	// Get current provider's model
	getCurrentModel(): string {
		const provider = this.settings.aiProvider;
		switch (provider) {
			case 'gemini':
				return this.settings.geminiModel;
			case 'xai':
				return this.settings.xaiModel;
			case 'openai':
				return this.settings.openaiModel;
			case 'anthropic':
				return this.settings.anthropicModel;
			default:
				return 'gemini-2.0-flash';
		}
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
					this.display(); // Refresh to show provider-specific settings
				}));

		// Google Gemini Settings
		if (this.plugin.settings.aiProvider === 'gemini') {
			new Setting(containerEl)
				.setName('Gemini API Key')
				.setDesc('Enter your Google Gemini API key')
				.addText(text => {
					text.setPlaceholder('AI...')
						.setValue(this.plugin.settings.geminiApiKey)
						.onChange(async (value) => {
							this.plugin.settings.geminiApiKey = value;
							await this.plugin.saveSettings();
						});
					text.inputEl.type = 'password';
					return text;
				});

			new Setting(containerEl)
				.setName('Gemini Model')
				.setDesc('Model to use for script generation')
				.addText(text => text
					.setPlaceholder('gemini-2.0-flash')
					.setValue(this.plugin.settings.geminiModel)
					.onChange(async (value) => {
						this.plugin.settings.geminiModel = value || 'gemini-2.0-flash';
						await this.plugin.saveSettings();
					}));
		}

		// XAI (Grok) Settings
		if (this.plugin.settings.aiProvider === 'xai') {
			new Setting(containerEl)
				.setName('XAI API Key')
				.setDesc('Enter your XAI (Grok) API key')
				.addText(text => {
					text.setPlaceholder('xai-...')
						.setValue(this.plugin.settings.xaiApiKey)
						.onChange(async (value) => {
							this.plugin.settings.xaiApiKey = value;
							await this.plugin.saveSettings();
						});
					text.inputEl.type = 'password';
					return text;
				});

			new Setting(containerEl)
				.setName('XAI Model')
				.setDesc('Model to use for script generation')
				.addText(text => text
					.setPlaceholder('grok-4-1-fast')
					.setValue(this.plugin.settings.xaiModel)
					.onChange(async (value) => {
						this.plugin.settings.xaiModel = value || 'grok-4-1-fast';
						await this.plugin.saveSettings();
					}));
		}

		// OpenAI Settings
		if (this.plugin.settings.aiProvider === 'openai') {
			new Setting(containerEl)
				.setName('OpenAI API Key')
				.setDesc('Enter your OpenAI API key')
				.addText(text => {
					text.setPlaceholder('sk-...')
						.setValue(this.plugin.settings.openaiApiKey)
						.onChange(async (value) => {
							this.plugin.settings.openaiApiKey = value;
							await this.plugin.saveSettings();
						});
					text.inputEl.type = 'password';
					return text;
				});

			new Setting(containerEl)
				.setName('OpenAI Model')
				.setDesc('Model to use for script generation')
				.addText(text => text
					.setPlaceholder('gpt-4o')
					.setValue(this.plugin.settings.openaiModel)
					.onChange(async (value) => {
						this.plugin.settings.openaiModel = value || 'gpt-4o';
						await this.plugin.saveSettings();
					}));
		}

		// Anthropic (Claude) Settings
		if (this.plugin.settings.aiProvider === 'anthropic') {
			new Setting(containerEl)
				.setName('Anthropic API Key')
				.setDesc('Enter your Anthropic API key')
				.addText(text => {
					text.setPlaceholder('sk-ant-...')
						.setValue(this.plugin.settings.anthropicApiKey)
						.onChange(async (value) => {
							this.plugin.settings.anthropicApiKey = value;
							await this.plugin.saveSettings();
						});
					text.inputEl.type = 'password';
					return text;
				});

			new Setting(containerEl)
				.setName('Anthropic Model')
				.setDesc('Model to use for script generation')
				.addText(text => text
					.setPlaceholder('claude-3-5-sonnet-20241022')
					.setValue(this.plugin.settings.anthropicModel)
					.onChange(async (value) => {
						this.plugin.settings.anthropicModel = value || 'claude-3-5-sonnet-20241022';
						await this.plugin.saveSettings();
					}));
		}

		// ====================
		// TTS SETTINGS
		// ====================
		containerEl.createEl('h2', {text: '🔊 Text-to-Speech Settings'});

		new Setting(containerEl)
			.setName('Default TTS Engine')
			.setDesc('Choose the default TTS engine (can be changed per-generation in Quick Options)')
			.addDropdown(dropdown => dropdown
				.addOption('gemini', '🤖 Gemini TTS (Recommended)')
				.addOption('edge', '🔷 Edge TTS (Free)')
				.addOption('elevenlabs', '🟣 ElevenLabs (Premium)')
				.setValue(this.plugin.settings.ttsEngine)
				.onChange(async (value: any) => {
					this.plugin.settings.ttsEngine = value;
					await this.plugin.saveSettings();
					this.display(); // Refresh to show relevant settings
				}));

		// Gemini TTS Settings
		if (this.plugin.settings.ttsEngine === 'gemini') {
			const geminiInfo = containerEl.createDiv('voice-briefing-info');
			geminiInfo.createEl('p', {
				text: '💡 Gemini TTS uses the same API key as Gemini AI Provider. 30 voice options available with auto language detection.',
				cls: 'setting-item-description'
			});

			new Setting(containerEl)
				.setName('Default Gemini Voice')
				.setDesc('Select default voice (grouped by gender)')
				.addDropdown(dropdown => {
					// Get voices from Gemini TTS handler
					const femaleVoices = GEMINI_TTS_VOICES.filter(v => v.gender === 'F');
					const maleVoices = GEMINI_TTS_VOICES.filter(v => v.gender === 'M');

					// Add female voices group
					const femaleGroup = dropdown.selectEl.createEl('optgroup', { attr: { label: '👩 Female Voices' } });
					femaleVoices.forEach(voice => {
						const option = femaleGroup.createEl('option', {
							text: `${voice.name} - ${voice.style}`,
							value: voice.name
						});
						if (voice.name === this.plugin.settings.geminiTtsVoice) {
							option.selected = true;
						}
					});

					// Add male voices group
					const maleGroup = dropdown.selectEl.createEl('optgroup', { attr: { label: '👨 Male Voices' } });
					maleVoices.forEach(voice => {
						const option = maleGroup.createEl('option', {
							text: `${voice.name} - ${voice.style}`,
							value: voice.name
						});
						if (voice.name === this.plugin.settings.geminiTtsVoice) {
							option.selected = true;
						}
					});

					return dropdown
						.onChange(async (value) => {
							this.plugin.settings.geminiTtsVoice = value;
							await this.plugin.saveSettings();
						});
				});

			new Setting(containerEl)
				.setName('Default Gemini Language')
				.setDesc('Select output language (Auto Detect recommended)')
				.addDropdown(dropdown => {
					GEMINI_TTS_LANGUAGES.forEach(lang => {
						dropdown.addOption(lang.code, lang.label);
					});
					return dropdown
						.setValue(this.plugin.settings.geminiTtsLanguage)
						.onChange(async (value) => {
							this.plugin.settings.geminiTtsLanguage = value;
							await this.plugin.saveSettings();
						});
				});
		}

		// Edge TTS Settings
		if (this.plugin.settings.ttsEngine === 'edge') {
			new Setting(containerEl)
				.setName('Default Edge Voice')
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
		}

		// ElevenLabs Settings
		if (this.plugin.settings.ttsEngine === 'elevenlabs') {
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

	// Get current provider's API key
	getCurrentApiKey(): string {
		const provider = this.plugin.settings.aiProvider;
		switch (provider) {
			case 'gemini':
				return this.plugin.settings.geminiApiKey;
			case 'xai':
				return this.plugin.settings.xaiApiKey;
			case 'openai':
				return this.plugin.settings.openaiApiKey;
			case 'anthropic':
				return this.plugin.settings.anthropicApiKey;
			default:
				return '';
		}
	}

	// Get current provider's model
	getCurrentModel(): string {
		const provider = this.plugin.settings.aiProvider;
		switch (provider) {
			case 'gemini':
				return this.plugin.settings.geminiModel;
			case 'xai':
				return this.plugin.settings.xaiModel;
			case 'openai':
				return this.plugin.settings.openaiModel;
			case 'anthropic':
				return this.plugin.settings.anthropicModel;
			default:
				return 'gemini-2.0-flash';
		}
	}

	getDefaultModel(): string {
		return this.getCurrentModel();
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
