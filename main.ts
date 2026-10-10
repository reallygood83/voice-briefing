/**
 * Voice Briefing - Obsidian Plugin
 *
 * Copyright (c) 2025-2026 reallygood83
 *
 * Released under the MIT License. See the LICENSE file.
 */

import { App, Plugin, PluginSettingTab, Setting, Notice, TFile, Modal, requestUrl } from 'obsidian';
import { ensureBriefingAudioPath } from './src/desktop/files';

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
		this.progressBar.removeClass('is-complete');
		this.progressBar.style.width = `${percentage}%`;
		this.statusText.textContent = `${percentage}%`;
	}

	setProgress(percentage: number) {
		this.progressBar.removeClass('is-complete');
		this.progressBar.style.width = `${percentage}%`;
		this.statusText.textContent = `${Math.round(percentage)}%`;
	}

	setStatusText(text: string) {
		this.currentStepEl.textContent = text;
	}

	showSuccess(message: string) {
		this.currentStepEl.textContent = message;
		this.progressBar.style.removeProperty('width');
		this.progressBar.addClass('is-complete');
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
import { XAI_TTS_VOICES } from './src/tts/xai-tts-handler';
import {
	ANTHROPIC_TEXT_MODELS,
	DEFAULT_ANTHROPIC_TEXT_MODEL,
	DEFAULT_ELEVENLABS_MODEL,
	DEFAULT_GEMINI_TEXT_MODEL,
	DEFAULT_GEMINI_TTS_MODEL,
	DEFAULT_OPENAI_TEXT_MODEL,
	DEFAULT_OPENAI_TTS_MODEL,
	DEFAULT_OPENAI_TTS_VOICE,
	DEFAULT_XAI_TEXT_MODEL,
	ELEVENLABS_MODELS,
	GEMINI_TEXT_MODELS,
	GEMINI_TTS_MODELS,
	OPENAI_TEXT_MODELS,
	OPENAI_TTS_MODELS,
	OPENAI_TTS_VOICES,
	XAI_TEXT_MODELS,
	type ModelOption
} from './src/models/catalog';
import { redactSecrets } from './src/ai/extract-text';
import { migrateModelSettings } from './src/settings/migrate-settings';
import {
	buildKeyProbe,
	checkApiKey,
	checkClientId,
	checkFolderId,
	checkModelId,
	checkVoiceId,
	clampUnitInterval,
	probeNotice,
	type AiProvider,
	type TtsEngine
} from './src/settings/settings-form';

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
			xaiVoice: settings.xaiTtsVoice,
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
			const engines = [
				{ value: 'gemini', label: '🤖 Gemini TTS (Recommended)' },
				{ value: 'openai', label: '🟢 OpenAI TTS' },
				{ value: 'xai', label: '🚀 xAI Grok TTS (Premium)' },
				{ value: 'edge', label: '🔷 Edge TTS (Free)' },
				{ value: 'elevenlabs', label: '🟣 ElevenLabs (Premium)' }
			];

			this.createCustomDropdown(container, engines, this.currentOptions.ttsEngine, (value) => {
				this.currentOptions.ttsEngine = value as 'edge' | 'elevenlabs' | 'gemini' | 'xai' | 'openai';
				this.refreshForm();
			});
		});

		// Gemini Voice Selection (only show if Gemini is selected)
		if (this.currentOptions.ttsEngine === 'gemini') {
			this.createSection(formEl, '🎭 Voice', (container) => {
				// Build options with groups
				const voiceOptions: { value: string; label: string; group?: string }[] = [];

				const femaleVoices = GEMINI_TTS_VOICES.filter(v => v.gender === 'F');
				const maleVoices = GEMINI_TTS_VOICES.filter(v => v.gender === 'M');

				femaleVoices.forEach(voice => {
					voiceOptions.push({
						value: voice.name,
						label: `${voice.name} - ${voice.style}`,
						group: '👩 Female Voices'
					});
				});

				maleVoices.forEach(voice => {
					voiceOptions.push({
						value: voice.name,
						label: `${voice.name} - ${voice.style}`,
						group: '👨 Male Voices'
					});
				});

				this.createCustomDropdown(container, voiceOptions, this.currentOptions.geminiVoice, (value) => {
					this.currentOptions.geminiVoice = value;
				});
			});

			this.createSection(formEl, '🌐 Language', (container) => {
				const langOptions = GEMINI_TTS_LANGUAGES.map(lang => ({
					value: lang.code,
					label: lang.label
				}));

				this.createCustomDropdown(container, langOptions, this.currentOptions.geminiLanguage, (value) => {
					this.currentOptions.geminiLanguage = value;
				});
			});
		}

		// xAI Voice Selection (only show if xAI is selected)
		if (this.currentOptions.ttsEngine === 'xai') {
			this.createSection(formEl, '🎭 xAI Voice', (container) => {
				// Import XAI_TTS_VOICES from the handler
				const xaiVoices = [
					{ name: 'Sal', style: 'Conversational', gender: 'M' },
					{ name: 'Rex', style: 'Professional', gender: 'M' },
					{ name: 'Eve', style: 'Warm', gender: 'F' },
					{ name: 'Leo', style: 'Energetic', gender: 'M' },
					{ name: 'Ara', style: 'Friendly', gender: 'F' },
					{ name: 'Mika', style: 'Casual', gender: 'F' },
					{ name: 'Valentin', style: 'Smooth', gender: 'M' }
				];

				const voiceOptions: { value: string; label: string; group?: string }[] = [];

				const femaleVoices = xaiVoices.filter(v => v.gender === 'F');
				const maleVoices = xaiVoices.filter(v => v.gender === 'M');

				femaleVoices.forEach(voice => {
					voiceOptions.push({
						value: voice.name,
						label: `${voice.name} - ${voice.style}`,
						group: '👩 Female Voices'
					});
				});

				maleVoices.forEach(voice => {
					voiceOptions.push({
						value: voice.name,
						label: `${voice.name} - ${voice.style}`,
						group: '👨 Male Voices'
					});
				});

				this.createCustomDropdown(container, voiceOptions, this.currentOptions.xaiVoice, (value) => {
					this.currentOptions.xaiVoice = value;
				});
			});

			// xAI API key notice
			if (!this.settings.xaiApiKey) {
				const noteEl = formEl.createDiv({ cls: 'voice-briefing-note' });
				noteEl.createEl('p', {
					text: '⚠️ xAI API key required. Configure in Plugin Settings.',
					cls: 'voice-briefing-note-text'
				});
			}
		}

		// Edge Voice Selection (only show if Edge is selected)
		if (this.currentOptions.ttsEngine === 'edge') {
			this.createSection(formEl, '🎭 Edge Voice', (container) => {
				const edgeVoices: Record<string, string[]> = {
					'Korean': ['ko-KR-SunHiNeural', 'ko-KR-InJoonNeural'],
					'English (US)': ['en-US-AriaNeural', 'en-US-GuyNeural', 'en-US-JennyNeural'],
					'Japanese': ['ja-JP-NanamiNeural', 'ja-JP-KeitaNeural'],
					'Chinese': ['zh-CN-XiaoxiaoNeural', 'zh-CN-YunxiNeural'],
					'Spanish': ['es-ES-ElviraNeural', 'es-ES-AlvaroNeural'],
					'French': ['fr-FR-DeniseNeural', 'fr-FR-HenriNeural'],
					'German': ['de-DE-KatjaNeural', 'de-DE-ConradNeural']
				};

				const voiceOptions: { value: string; label: string; group?: string }[] = [];
				Object.entries(edgeVoices).forEach(([lang, voices]) => {
					voices.forEach(voice => {
						voiceOptions.push({
							value: voice,
							label: voice,
							group: lang
						});
					});
				});

				this.createCustomDropdown(container, voiceOptions, this.currentOptions.edgeVoice, (value) => {
					this.currentOptions.edgeVoice = value;
				});
			});
		}

		// ElevenLabs note (if selected)
		if (this.currentOptions.ttsEngine === 'elevenlabs') {
			const noteEl = formEl.createDiv({ cls: 'voice-briefing-note' });
			noteEl.createEl('p', {
				text: `💡 ElevenLabs uses the voice and model (${this.settings.elevenLabsModelId || DEFAULT_ELEVENLABS_MODEL}) from Plugin Settings.`,
				cls: 'voice-briefing-note-text'
			});
		}

		if (this.currentOptions.ttsEngine === 'openai') {
			const noteEl = formEl.createDiv({ cls: 'voice-briefing-note' });
			noteEl.createEl('p', {
				text: `💡 OpenAI TTS uses ${this.settings.openaiTtsModel || DEFAULT_OPENAI_TTS_MODEL} / ${this.settings.openaiTtsVoice || DEFAULT_OPENAI_TTS_VOICE} from Plugin Settings.`,
				cls: 'voice-briefing-note-text'
			});
		}

		// Briefing Style Selection
		this.createSection(formEl, '📝 Briefing Style', (container) => {
			const styles = [
				{ value: 'metaphor', label: '🌟 Metaphorical (Easy analogies)' },
				{ value: 'feynman', label: '🎓 Feynman Technique (Teaching style)' },
				{ value: 'anchor', label: '📰 News Anchor (Professional)' },
				{ value: 'custom', label: '✏️ Custom (Use prompt below)' }
			];

			this.createCustomDropdown(container, styles, this.currentOptions.briefingStyle, (value) => {
				this.currentOptions.briefingStyle = value as 'metaphor' | 'feynman' | 'anchor' | 'custom';
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
			hintEl.createSpan({
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

	/**
	 * Create a custom dropdown component that works in dark theme
	 * Uses a visible div for display instead of native select (which has OS-level rendering issues)
	 */
	private createCustomDropdown(
		container: HTMLElement,
		options: { value: string; label: string; group?: string }[],
		selectedValue: string,
		onChange: (value: string) => void
	): HTMLElement {
		const wrapper = container.createDiv({ cls: 'voice-briefing-custom-dropdown' });

		// Find the selected option's label
		const selectedOption = options.find(opt => opt.value === selectedValue);
		const selectedLabel = selectedOption ? selectedOption.label : options[0]?.label || '';

		// Display element (always visible and fully controlled by CSS)
		const display = wrapper.createDiv({ cls: 'voice-briefing-dropdown-display' });
		display.textContent = selectedLabel;

		// Arrow indicator
		const arrow = wrapper.createDiv({ cls: 'voice-briefing-dropdown-arrow' });
		arrow.textContent = '▼';

		// Options list (hidden by default)
		const optionsList = wrapper.createDiv({ cls: 'voice-briefing-dropdown-options is-closed' });

		// Group options if they have groups
		const groups = new Map<string, { value: string; label: string }[]>();
		const ungrouped: { value: string; label: string }[] = [];

		options.forEach(opt => {
			if (opt.group) {
				if (!groups.has(opt.group)) {
					groups.set(opt.group, []);
				}
				groups.get(opt.group)!.push(opt);
			} else {
				ungrouped.push(opt);
			}
		});

		// Render ungrouped options first
		ungrouped.forEach(opt => {
			const optionEl = optionsList.createDiv({
				cls: 'voice-briefing-dropdown-option' + (opt.value === selectedValue ? ' selected' : ''),
				text: opt.label
			});
			optionEl.dataset.value = opt.value;
		});

		// Render grouped options
		groups.forEach((groupOptions, groupName) => {
			const groupEl = optionsList.createDiv({ cls: 'voice-briefing-dropdown-group' });
			groupEl.createDiv({ cls: 'voice-briefing-dropdown-group-label', text: groupName });

			groupOptions.forEach(opt => {
				const optionEl = groupEl.createDiv({
					cls: 'voice-briefing-dropdown-option' + (opt.value === selectedValue ? ' selected' : ''),
					text: opt.label
				});
				optionEl.dataset.value = opt.value;
			});
		});

		// Toggle dropdown on click
		let isOpen = false;

		const toggleDropdown = (e: Event) => {
			e.stopPropagation();
			isOpen = !isOpen;
			optionsList.toggleClass('is-closed', !isOpen);
			wrapper.classList.toggle('open', isOpen);
		};

		display.addEventListener('click', toggleDropdown);
		arrow.addEventListener('click', toggleDropdown);

		// Handle option selection
		optionsList.addEventListener('click', (e) => {
			const target = e.target as HTMLElement;
			if (target.classList.contains('voice-briefing-dropdown-option')) {
				const value = target.dataset.value || '';
				display.textContent = target.textContent || '';

				// Update selected state
				optionsList.querySelectorAll('.voice-briefing-dropdown-option').forEach(el => {
					el.classList.remove('selected');
				});
				target.classList.add('selected');

				// Close dropdown
				isOpen = false;
				optionsList.addClass('is-closed');
				wrapper.classList.remove('open');

				// Trigger change callback
				onChange(value);
			}
		});

		// Close dropdown when clicking outside
		const closeDropdown = (e: Event) => {
			if (!wrapper.contains(e.target as Node)) {
				isOpen = false;
				optionsList.addClass('is-closed');
				wrapper.classList.remove('open');
			}
		};

		document.addEventListener('click', closeDropdown);

		// Store cleanup function
		(wrapper as any)._cleanup = () => {
			document.removeEventListener('click', closeDropdown);
		};

		return wrapper;
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
	ttsEngine: 'edge' | 'elevenlabs' | 'gemini' | 'xai' | 'openai';
	edgeVoice: string;
	elevenLabsApiKey: string;
	elevenLabsVoiceId: string;
	elevenLabsModelId: string;
	elevenLabsStability: number;
	elevenLabsSimilarityBoost: number;
	elevenLabsStyle: number;
	elevenLabsSpeakerBoost: boolean;

	// Gemini TTS Settings
	geminiTtsVoice: string;
	geminiTtsLanguage: string;
	geminiTtsModel: string;

	// OpenAI TTS Settings
	openaiTtsModel: string;
	openaiTtsVoice: string;

	// xAI TTS Settings
	xaiTtsVoice: string;

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
	ttsEngine: 'edge' | 'elevenlabs' | 'gemini' | 'xai' | 'openai';
	geminiVoice: string;
	geminiLanguage: string;
	edgeVoice: string;
	xaiVoice: string;
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
	geminiModel: DEFAULT_GEMINI_TEXT_MODEL,
	xaiModel: DEFAULT_XAI_TEXT_MODEL,
	openaiModel: DEFAULT_OPENAI_TEXT_MODEL,
	anthropicModel: DEFAULT_ANTHROPIC_TEXT_MODEL,

	ttsEngine: 'gemini',
	edgeVoice: 'ko-KR-SunHiNeural',
	elevenLabsApiKey: '',
	elevenLabsVoiceId: '',
	elevenLabsModelId: DEFAULT_ELEVENLABS_MODEL,
	elevenLabsStability: 0.5,
	elevenLabsSimilarityBoost: 0.75,
	elevenLabsStyle: 0.0,
	elevenLabsSpeakerBoost: true,

	// Gemini TTS defaults
	geminiTtsVoice: 'Kore',
	geminiTtsLanguage: 'auto',
	geminiTtsModel: DEFAULT_GEMINI_TTS_MODEL,
	openaiTtsModel: DEFAULT_OPENAI_TTS_MODEL,
	openaiTtsVoice: DEFAULT_OPENAI_TTS_VOICE,

	// xAI TTS defaults
	xaiTtsVoice: 'Sal',

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
		this.addRibbonIcon('mic', 'Generate briefing', async () => {
			await this.generateVoiceBriefing();
		});

		// Add command
		this.addCommand({
			id: 'generate-briefing',
			name: 'Generate briefing',
			callback: async () => {
				await this.generateVoiceBriefing();
			}
		});

		// Add settings tab
		this.addSettingTab(new VoiceBriefingSettingTab(this.app, this));

		console.debug('Voice Briefing Plugin loaded');
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

		if (options.ttsEngine === 'openai' && !this.settings.openaiApiKey) {
			new Notice('Please set your OpenAI API key in settings');
			return;
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
				modelName: this.getCurrentModel(),
				onStatus: (message) => new Notice(message)
			});

			progressModal.setStep('script', 'completed', `Script generated (~${scriptResult.estimatedDuration}s audio)`);

			// Step 2: Convert script to audio with TTS
			const ttsEngineLabels: Record<QuickOptions['ttsEngine'], string> = {
				edge: 'Edge TTS',
				gemini: 'Gemini TTS',
				xai: 'xAI TTS',
				openai: 'OpenAI TTS',
				elevenlabs: 'ElevenLabs'
			};
			const ttsEngineLabel = ttsEngineLabels[options.ttsEngine];
			progressModal.setStep('audio', 'active', `Converting to audio with ${ttsEngineLabel}...`);

			const { TTSGenerator } = await import('./src/tts/tts-generator');
			const ttsGenerator = new TTSGenerator();

			// Prepare audio file path with ABSOLUTE path
			// Note: Gemini TTS outputs .wav, Edge/ElevenLabs output .mp3
			const audioExtension = options.ttsEngine === 'gemini' || options.ttsEngine === 'xai' ? 'wav' : 'mp3';
			const audioFileName = `${activeFile.basename}-briefing.${audioExtension}`;
			const vaultBasePath = (this.app.vault.adapter as any).basePath;
			const audioPath = ensureBriefingAudioPath(vaultBasePath, this.app.vault.configDir, audioFileName);

			const ttsResult = await ttsGenerator.generate({
				engine: options.ttsEngine,
				text: scriptResult.script,
				outputPath: audioPath,
				edgeVoice: options.edgeVoice,
				elevenLabsApiKey: this.settings.elevenLabsApiKey,
				elevenLabsVoiceId: this.settings.elevenLabsVoiceId,
				elevenLabsModelId: this.settings.elevenLabsModelId,
				elevenLabsStability: this.settings.elevenLabsStability,
				elevenLabsSimilarityBoost: this.settings.elevenLabsSimilarityBoost,
				elevenLabsStyle: this.settings.elevenLabsStyle,
				elevenLabsSpeakerBoost: this.settings.elevenLabsSpeakerBoost,
				// Gemini TTS options
					geminiApiKey: this.settings.geminiApiKey,
					geminiVoice: options.geminiVoice,
					geminiLanguage: options.geminiLanguage,
					geminiModel: this.settings.geminiTtsModel,
					// xAI TTS options
				xaiApiKey: this.settings.xaiApiKey,
				xaiVoice: options.xaiVoice,
				openaiApiKey: this.settings.openaiApiKey,
				openaiTtsModel: this.settings.openaiTtsModel,
				openaiTtsVoice: this.settings.openaiTtsVoice
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

				const audioMime = audioExtension === 'wav' ? 'audio/wav' : 'audio/mpeg';
				const uploadResult = await driveClient.uploadFile(audioPath, audioFileName, audioMime);

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
					console.debug('Audio embed created with fileId:', uploadResult.fileId);
					console.debug('Embed URL:', driveEmbedUrl);
				} else {
					// Fallback to local file
					progressModal.setStep('upload', 'error', 'Cloud upload failed, using local file');
					audioEmbed = `\n\n## 🎧 Voice Briefing\n\n![[${audioFileName}]]\n\n*Generated on ${new Date().toLocaleString()} • Duration: ~${scriptResult.estimatedDuration}s*\n*⚠️ Cloud upload failed - audio stored locally only*\n`;
					console.debug('Fallback to local file embed');
				}
			} else {
				// Local file only
				audioEmbed = `\n\n## 🎧 Voice Briefing\n\n![[${audioFileName}]]\n\n*Generated on ${new Date().toLocaleString()} • Duration: ~${scriptResult.estimatedDuration}s*\n`;
			}

			// Step 4: Embed audio in note (right after YAML frontmatter/properties)
			progressModal.setStep('embed', 'active', 'Embedding audio in note...');

			console.debug('Attempting to embed audio in note...');
			console.debug('Current content length:', content.length);
			console.debug('Audio embed to add:', audioEmbed);

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
				console.debug('Inserted audio embed after YAML frontmatter');
			} else {
				// No frontmatter found, insert at the beginning
				newContent = audioEmbed + '\n' + content;
				console.debug('No frontmatter found, inserted at beginning');
			}

			console.debug('New content length:', newContent.length);

			await this.app.vault.modify(activeFile, newContent);
			console.debug('Note modified successfully');

			progressModal.setStep('embed', 'completed', 'Audio embedded in note');

			// Show success
			progressModal.showSuccess('✅ Voice briefing generated successfully!');

			// Auto-close modal after 2 seconds
			window.setTimeout(() => {
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
		console.debug('Voice Briefing Plugin unloaded');
	}

	async loadSettings() {
		const merged = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
		const changes = migrateModelSettings(merged);
		this.settings = merged;
		if (changes.length > 0) {
			console.debug(`Voice Briefing migrated saved models: ${changes.join('; ')}`);
			await this.saveSettings();
		}
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
				return DEFAULT_GEMINI_TEXT_MODEL;
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
		const { containerEl } = this;
		containerEl.empty();
		containerEl.addClass('voice-briefing-settings');

		this.renderAiSection(containerEl);
		this.renderTtsSection(containerEl);
		this.renderBriefingSection(containerEl);
		this.renderDriveSection(containerEl);
		this.renderAdvancedSection(containerEl);
	}

	private renderAiSection(containerEl: HTMLElement): void {
		const provider = this.plugin.settings.aiProvider;
		new Setting(containerEl).setName('AI 원고 생성').setHeading();
		containerEl.createDiv({
			cls: 'voice-briefing-settings-note',
			text: '고른 서비스의 키와 모델만 표시합니다. 다른 서비스에 저장해 둔 키는 지우지 않습니다.'
		});

		new Setting(containerEl)
			.setName('원고 서비스')
			.setDesc('대본을 만들 서비스. 기본값: Gemini.')
			.addDropdown(dropdown => dropdown
				.addOption('gemini', 'Gemini')
				.addOption('xai', 'Grok')
				.addOption('openai', 'OpenAI')
				.addOption('anthropic', 'Claude')
				.setValue(provider)
				.onChange(async (value: AiProvider) => {
					this.plugin.settings.aiProvider = value;
					await this.plugin.saveSettings();
					this.display();
				}));

		this.addProviderKey(containerEl, provider);
		if (provider === 'gemini') {
			this.addModelPicker(containerEl, 'Gemini 모델', '대본 모델', GEMINI_TEXT_MODELS, DEFAULT_GEMINI_TEXT_MODEL, this.plugin.settings.geminiModel, async (modelId) => {
				this.plugin.settings.geminiModel = modelId;
				await this.plugin.saveSettings();
			});
		} else if (provider === 'xai') {
			this.addModelPicker(containerEl, 'Grok 모델', '대본 모델', XAI_TEXT_MODELS, DEFAULT_XAI_TEXT_MODEL, this.plugin.settings.xaiModel, async (modelId) => {
				this.plugin.settings.xaiModel = modelId;
				await this.plugin.saveSettings();
			});
		} else if (provider === 'openai') {
			this.addModelPicker(containerEl, 'OpenAI 모델', '대본 모델. GPT-6 ID는 Responses API를 사용합니다.', OPENAI_TEXT_MODELS, DEFAULT_OPENAI_TEXT_MODEL, this.plugin.settings.openaiModel, async (modelId) => {
				this.plugin.settings.openaiModel = modelId;
				await this.plugin.saveSettings();
			});
		} else {
			this.addModelPicker(containerEl, 'Claude 모델', '대본 모델', ANTHROPIC_TEXT_MODELS, DEFAULT_ANTHROPIC_TEXT_MODEL, this.plugin.settings.anthropicModel, async (modelId) => {
				this.plugin.settings.anthropicModel = modelId;
				await this.plugin.saveSettings();
			});
		}
	}

	private renderTtsSection(containerEl: HTMLElement): void {
		const engine = this.plugin.settings.ttsEngine;
		new Setting(containerEl).setName('TTS 음성').setHeading();
		containerEl.createDiv({
			cls: 'voice-briefing-settings-note',
			text: '생성할 때마다 빠른 선택에서 바꿀 수 있습니다. 여기에는 기본 음성만 둡니다.'
		});

		new Setting(containerEl)
			.setName('음성 엔진')
			.setDesc('기본값: Gemini TTS.')
			.addDropdown(dropdown => dropdown
				.addOption('gemini', 'Gemini TTS')
				.addOption('openai', 'OpenAI TTS')
				.addOption('xai', 'Grok TTS')
				.addOption('edge', 'Edge TTS (무료)')
				.addOption('elevenlabs', 'ElevenLabs')
				.setValue(engine)
				.onChange(async (value: TtsEngine) => {
					this.plugin.settings.ttsEngine = value;
					await this.plugin.saveSettings();
					this.display();
				}));

		const shared = this.plugin.settings.aiProvider === engine;
		if (engine === 'gemini') {
			if (shared) {
				containerEl.createDiv({ cls: 'voice-briefing-settings-note', text: 'Gemini 키는 위의 원고 생성 키를 그대로 사용합니다.' });
			} else {
				this.addProviderKey(containerEl, 'gemini');
			}
			this.addModelPicker(containerEl, 'Gemini TTS 모델', '음성 모델', GEMINI_TTS_MODELS, DEFAULT_GEMINI_TTS_MODEL, this.plugin.settings.geminiTtsModel, async (modelId) => {
				this.plugin.settings.geminiTtsModel = modelId;
				await this.plugin.saveSettings();
			});
			this.addGeminiVoice(containerEl);
			this.addGeminiLanguage(containerEl);
		} else if (engine === 'openai') {
			if (shared) {
				containerEl.createDiv({ cls: 'voice-briefing-settings-note', text: 'OpenAI 키는 위의 원고 생성 키를 그대로 사용합니다.' });
			} else {
				this.addProviderKey(containerEl, 'openai');
			}
			this.addModelPicker(containerEl, 'OpenAI TTS 모델', '음성 모델', OPENAI_TTS_MODELS, DEFAULT_OPENAI_TTS_MODEL, this.plugin.settings.openaiTtsModel, async (modelId) => {
				this.plugin.settings.openaiTtsModel = modelId;
				await this.plugin.saveSettings();
			});
			this.addOpenAiVoice(containerEl);
		} else if (engine === 'xai') {
			containerEl.createDiv({
				cls: 'voice-briefing-settings-note',
				text: 'Grok 음성 생성은 아직 꺼져 있습니다. 키 확인과 목소리 선택만 저장됩니다.'
			});
			if (!shared) this.addProviderKey(containerEl, 'xai');
			this.addXaiVoice(containerEl);
		} else if (engine === 'edge') {
			new Setting(containerEl)
				.setName('Edge 목소리')
				.setDesc(`기본값은 출력 언어에 맞춥니다. 한국어 기본값: ko-KR-SunHiNeural.`)
				.addDropdown(dropdown => {
					this.addEdgeVoiceOptions(dropdown);
					return dropdown
						.setValue(this.plugin.settings.edgeVoice)
						.onChange(async (value) => {
							const check = checkVoiceId(value, false);
							if (!check.ok) {
								new Notice(check.message);
								return;
							}
							this.plugin.settings.edgeVoice = check.value;
							await this.plugin.saveSettings();
						});
				});
			new Setting(containerEl)
				.setName('Edge TTS 확인')
				.setDesc('이 컴퓨터에 edge-tts 명령이 있는지 확인합니다. API 키는 없습니다.')
				.addButton(button => button
					.setButtonText('연결 테스트')
					.onClick(async () => {
						try {
							const { execDesktop } = await import('./src/desktop/files');
							await execDesktop('edge-tts --help');
							new Notice('✅ Edge TTS를 찾았습니다.');
						} catch (error: any) {
							new Notice(`❌ Edge TTS를 찾지 못했습니다. ${redactSecrets(error?.message || '')}`);
						}
					}));
		} else {
			this.addElevenKey(containerEl);
			this.addModelPicker(containerEl, 'ElevenLabs 모델', '권장 모델은 v4입니다.', ELEVENLABS_MODELS, DEFAULT_ELEVENLABS_MODEL, this.plugin.settings.elevenLabsModelId, async (modelId) => {
				this.plugin.settings.elevenLabsModelId = modelId;
				await this.plugin.saveSettings();
			});
			new Setting(containerEl)
				.setName('ElevenLabs 보이스 ID')
				.setDesc('ElevenLabs에서 복사한 보이스 ID. 비워 두면 음성을 만들 수 없습니다.')
				.addText(text => text
					.setPlaceholder('voice-id')
					.setValue(this.plugin.settings.elevenLabsVoiceId)
					.onChange(async (value) => {
						const check = checkVoiceId(value, true);
						if (!check.ok) {
							new Notice(check.message);
							return;
						}
						this.plugin.settings.elevenLabsVoiceId = check.value;
						await this.plugin.saveSettings();
					}));
		}
	}

	private renderBriefingSection(containerEl: HTMLElement): void {
		new Setting(containerEl).setName('브리핑 길이·프롬프트').setHeading();
		containerEl.createDiv({
			cls: 'voice-briefing-settings-note',
			text: '기본 스타일은 75–110초로 맞춥니다. 커스텀 스타일은 그 길이를 강제하지 않고 3000자까지만 자릅니다.'
		});

		new Setting(containerEl)
			.setName('출력 언어')
			.setDesc('대본과 Edge 기본 목소리에 함께 쓰입니다. 기본값: 한국어.')
			.addDropdown(dropdown => dropdown
				.addOption('ko-KR', '한국어')
				.addOption('en-US', 'English (US)')
				.addOption('ja-JP', '日本語')
				.addOption('zh-CN', '中文')
				.addOption('es-ES', 'Español')
				.addOption('fr-FR', 'Français')
				.addOption('de-DE', 'Deutsch')
				.setValue(this.plugin.settings.language)
				.onChange(async (value) => {
					this.plugin.settings.language = value;
					await this.plugin.saveSettings();
					this.autoSelectVoice(value);
				}));

		new Setting(containerEl)
			.setName('브리핑 스타일')
			.setDesc('기본값: Feynman.')
			.addDropdown(dropdown => dropdown
				.addOption('metaphor', '비유')
				.addOption('feynman', 'Feynman')
				.addOption('anchor', '뉴스 앵커')
				.addOption('custom', '커스텀')
				.setValue(this.plugin.settings.briefingStyle)
				.onChange(async (value: 'metaphor' | 'feynman' | 'anchor' | 'custom') => {
					this.plugin.settings.briefingStyle = value;
					await this.plugin.saveSettings();
					this.display();
				}));

		if (this.plugin.settings.briefingStyle === 'custom') {
			new Setting(containerEl)
				.setName('커스텀 프롬프트')
				.setDesc('비어 있으면 스타일만 커스텀이고, 길이는 기본 규칙을 따릅니다.')
				.addTextArea(text => text
					.setPlaceholder('예: 초등학생에게 설명하듯 말해 주세요.')
					.setValue(this.plugin.settings.customStylePrompt)
					.onChange(async (value) => {
						this.plugin.settings.customStylePrompt = value;
						await this.plugin.saveSettings();
					}));
		}
	}

	private renderDriveSection(containerEl: HTMLElement): void {
		const settings = this.plugin.settings;
		new Setting(containerEl).setName('구글 드라이브').setHeading();

		new Setting(containerEl)
			.setName('클라우드 공유')
			.setDesc('켜면 음성 파일을 구글 드라이브에 올리고 노트에 링크를 넣습니다. 기본값: 꺼짐.')
			.addToggle(toggle => toggle
				.setValue(settings.cloudSharingEnabled)
				.onChange(async (value) => {
					this.plugin.settings.cloudSharingEnabled = value;
					await this.plugin.saveSettings();
					this.display();
				}));

		if (!settings.cloudSharingEnabled) return;

		const connected = settings.googleDriveConnected;
		containerEl.createDiv({
			cls: `voice-briefing-status-row ${connected ? 'is-connected' : 'is-disconnected'}`,
			text: connected
				? '연결됨. 토큰은 이 플러그인 데이터에만 저장되고 자동으로 갱신됩니다.'
				: '연결 안 됨. 데스크톱 클라이언트 ID를 넣은 뒤 로그인하세요.'
		});

		new Setting(containerEl)
			.setName('클라이언트 ID')
			.setDesc('Google Cloud 데스크톱 앱 클라이언트. 예: ….apps.googleusercontent.com')
			.addText(text => text
				.setPlaceholder('….apps.googleusercontent.com')
				.setValue(settings.googleDriveClientId)
				.onChange(async (value) => {
					const trimmed = value.trim();
					if (trimmed && !/\s/.test(trimmed) && !trimmed.endsWith('.apps.googleusercontent.com')) return;
					const check = checkClientId(value);
					if (!check.ok) {
						new Notice(check.message);
						return;
					}
					this.plugin.settings.googleDriveClientId = check.value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('클라이언트 시크릿')
			.setDesc('같은 데스크톱 클라이언트의 시크릿. 화면에서는 가려집니다.')
			.addText(text => {
				text.setPlaceholder('GOCSPX-…')
					.setValue(settings.googleDriveClientSecret)
					.onChange(async (value) => {
						const check = checkApiKey(value);
						if (!check.ok) {
							new Notice(check.message);
							return;
						}
						this.plugin.settings.googleDriveClientSecret = check.value;
						await this.plugin.saveSettings();
					});
				text.inputEl.type = 'password';
				return text;
			});

		const actions = new Setting(containerEl)
			.setName(connected ? '로그아웃' : '로그인')
			.setDesc('브라우저에서 Google 계정으로 연결합니다. 테스트 모드 앱의 갱신 토큰은 7일 뒤 만료됩니다.');
		if (!connected) {
			actions.addButton(button => button
				.setButtonText('로그인')
				.setCta()
				.onClick(() => this.loginDrive()));
		} else {
			actions
				.addButton(button => button
					.setButtonText('연결 테스트')
					.onClick(() => this.testDrive()))
				.addButton(button => button
					.setButtonText('로그아웃')
					.setWarning()
					.onClick(() => this.logoutDrive()));
		}

		new Setting(containerEl)
			.setName('링크 형식')
			.setDesc('노트에 넣는 형식. 기본값: HTML 오디오 플레이어.')
			.addDropdown(dropdown => dropdown
				.addOption('html', 'HTML 오디오 플레이어')
				.addOption('markdown', '마크다운 링크')
				.addOption('direct', '주소만')
				.setValue(settings.linkFormat)
				.onChange(async (value: 'html' | 'direct' | 'markdown') => {
					this.plugin.settings.linkFormat = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('드라이브 폴더 ID')
			.setDesc('비우면 내 드라이브 루트에 올립니다. 폴더 주소를 붙여 넣으면 ID만 저장합니다.')
			.addText(text => text
				.setPlaceholder('폴더 ID 또는 폴더 주소')
				.setValue(settings.googleDriveFolderId || '')
				.onChange(async (value) => {
					const trimmed = value.trim();
					if (trimmed && !trimmed.includes('/') && trimmed.length < 10 && !/\s/.test(trimmed)) return;
					const check = checkFolderId(value);
					if (!check.ok) {
						new Notice(check.message);
						return;
					}
					this.plugin.settings.googleDriveFolderId = check.value;
					await this.plugin.saveSettings();
					if (check.message) new Notice(check.message);
				}));
	}

	private renderAdvancedSection(containerEl: HTMLElement): void {
		new Setting(containerEl).setName('고급').setHeading();
		if (this.plugin.settings.ttsEngine !== 'elevenlabs') {
			containerEl.createDiv({
				cls: 'voice-briefing-settings-note',
				text: 'ElevenLabs를 고르면 안정성, 유사도, 스타일 조절이 여기에 나타납니다.'
			});
			return;
		}

		new Setting(containerEl)
			.setName('목소리 프리셋')
			.setDesc('고르면 아래 슬라이더를 바꿉니다. 기본 브리핑 값은 안정성 0.5, 유사도 0.75, 스타일 0입니다.')
			.addDropdown(dropdown => dropdown
				.addOption('custom', '직접 조절')
				.addOption('briefing', '브리핑')
				.addOption('lecture', '강의')
				.addOption('news', '뉴스')
				.addOption('story', '이야기')
				.addOption('asmr', 'ASMR')
				.setValue('custom')
				.onChange(async (value) => {
					if (value === 'custom') return;
					const preset = this.elevenPreset(value);
					this.plugin.settings.elevenLabsStability = preset.stability;
					this.plugin.settings.elevenLabsSimilarityBoost = preset.similarity;
					this.plugin.settings.elevenLabsStyle = preset.style;
					this.plugin.settings.elevenLabsSpeakerBoost = preset.boost;
					await this.plugin.saveSettings();
					this.display();
					new Notice(`「${value}」 프리셋을 적용했습니다.`);
				}));

		this.addUnitSlider(containerEl, '안정성', '높을수록 일정하고, 낮을수록 변화가 큽니다. 기본값: 0.5.', this.plugin.settings.elevenLabsStability, 0.5, async (value) => {
			this.plugin.settings.elevenLabsStability = value;
			await this.plugin.saveSettings();
		});
		this.addUnitSlider(containerEl, '유사도', '높을수록 원본 목소리에 가깝습니다. 기본값: 0.75.', this.plugin.settings.elevenLabsSimilarityBoost, 0.75, async (value) => {
			this.plugin.settings.elevenLabsSimilarityBoost = value;
			await this.plugin.saveSettings();
		});
		this.addUnitSlider(containerEl, '스타일', '0은 중립입니다. v2 모델에서만 전달됩니다. 기본값: 0.', this.plugin.settings.elevenLabsStyle, 0, async (value) => {
			this.plugin.settings.elevenLabsStyle = value;
			await this.plugin.saveSettings();
		});
		new Setting(containerEl)
			.setName('화자 부스트')
			.setDesc('명료도를 올립니다. v2 모델에서만 전달됩니다. 기본값: 켜짐.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.elevenLabsSpeakerBoost)
				.onChange(async (value) => {
					this.plugin.settings.elevenLabsSpeakerBoost = value;
					await this.plugin.saveSettings();
				}));
	}

	private addProviderKey(containerEl: HTMLElement, provider: AiProvider): void {
		const meta = {
			gemini: { name: 'Gemini API 키', placeholder: 'AIza…', field: 'geminiApiKey' as const, label: 'Gemini' },
			xai: { name: 'Grok API 키', placeholder: 'xai-…', field: 'xaiApiKey' as const, label: 'Grok' },
			openai: { name: 'OpenAI API 키', placeholder: 'sk-…', field: 'openaiApiKey' as const, label: 'OpenAI' },
			anthropic: { name: 'Claude API 키', placeholder: 'sk-ant-…', field: 'anthropicApiKey' as const, label: 'Claude' }
		}[provider];
		this.addSecretField(containerEl, meta.name, '입력값은 가려집니다. 연결 테스트는 키로 목록 조회만 합니다.', this.plugin.settings[meta.field], meta.placeholder, async (value) => {
			this.plugin.settings[meta.field] = value;
			await this.plugin.saveSettings();
		}, () => this.testProviderKey(provider, this.plugin.settings[meta.field], meta.label));
	}

	private addElevenKey(containerEl: HTMLElement): void {
		this.addSecretField(containerEl, 'ElevenLabs API 키', '입력값은 가려집니다. 연결 테스트는 계정 조회만 합니다.', this.plugin.settings.elevenLabsApiKey, 'xi-…', async (value) => {
			this.plugin.settings.elevenLabsApiKey = value;
			await this.plugin.saveSettings();
		}, () => this.testProviderKey('elevenlabs', this.plugin.settings.elevenLabsApiKey, 'ElevenLabs'));
	}

	private addSecretField(
		containerEl: HTMLElement,
		name: string,
		desc: string,
		value: string,
		placeholder: string,
		save: (value: string) => Promise<void>,
		test: () => Promise<void>
	): void {
		new Setting(containerEl)
			.setName(name)
			.setDesc(desc)
			.addText(text => {
				text.setPlaceholder(placeholder)
					.setValue(value)
					.onChange(async (raw) => {
						const trimmed = raw.trim();
						if (trimmed && trimmed.length < 8 && !/\s/.test(trimmed)) return;
						const check = checkApiKey(raw);
						if (!check.ok) {
							new Notice(check.message);
							return;
						}
						await save(check.value);
					});
				text.inputEl.type = 'password';
				return text;
			})
			.addButton(button => button
				.setButtonText('연결 테스트')
				.onClick(() => test()));
	}

	private async testProviderKey(provider: AiProvider | 'elevenlabs', apiKey: string, label: string): Promise<void> {
		let spec;
		try {
			spec = buildKeyProbe(provider, apiKey);
		} catch (error: any) {
			new Notice(error?.message || 'API 키를 입력한 뒤 연결 테스트를 누르세요.');
			return;
		}
		try {
			const response = await requestUrl({
				url: spec.url,
				method: 'GET',
				headers: spec.headers,
				throw: false
			});
			const result = probeNotice(response.status, label);
			new Notice(`${result.ok ? '✅' : '❌'} ${result.message}`);
		} catch (error: any) {
			new Notice(`❌ ${label} 연결에 실패했습니다. ${redactSecrets(error?.message || '네트워크를 확인하세요.')}`);
		}
	}

	private addGeminiVoice(containerEl: HTMLElement): void {
		new Setting(containerEl)
			.setName('Gemini 목소리')
			.setDesc('기본값: Kore.')
			.addDropdown(dropdown => {
				const female = dropdown.selectEl.createEl('optgroup', { attr: { label: '여성' } });
				const male = dropdown.selectEl.createEl('optgroup', { attr: { label: '남성' } });
				GEMINI_TTS_VOICES.forEach(voice => {
					const group = voice.gender === 'F' ? female : male;
					const option = group.createEl('option', { text: `${voice.name} (${voice.style})`, value: voice.name });
					if (voice.name === this.plugin.settings.geminiTtsVoice) option.selected = true;
				});
				return dropdown.onChange(async (value) => {
					this.plugin.settings.geminiTtsVoice = value;
					await this.plugin.saveSettings();
				});
			});
	}

	private addGeminiLanguage(containerEl: HTMLElement): void {
		new Setting(containerEl)
			.setName('Gemini 음성 언어')
			.setDesc('기본값: 자동.')
			.addDropdown(dropdown => {
				GEMINI_TTS_LANGUAGES.forEach(lang => dropdown.addOption(lang.code, lang.label));
				return dropdown
					.setValue(this.plugin.settings.geminiTtsLanguage)
					.onChange(async (value) => {
						this.plugin.settings.geminiTtsLanguage = value;
						await this.plugin.saveSettings();
					});
			});
	}

	private addOpenAiVoice(containerEl: HTMLElement): void {
		const known = OPENAI_TTS_VOICES.some((voice) => voice.id === this.plugin.settings.openaiTtsVoice);
		new Setting(containerEl)
			.setName('OpenAI 목소리')
			.setDesc(`목록의 목소리. 기본값: ${DEFAULT_OPENAI_TTS_VOICE}.`)
			.addDropdown(dropdown => {
				OPENAI_TTS_VOICES.forEach((voice) => dropdown.addOption(voice.id, voice.label));
				return dropdown
					.setValue(known ? this.plugin.settings.openaiTtsVoice : DEFAULT_OPENAI_TTS_VOICE)
					.onChange(async (value) => {
						this.plugin.settings.openaiTtsVoice = value;
						await this.plugin.saveSettings();
						this.display();
					});
			});
		new Setting(containerEl)
			.setName('OpenAI 목소리 ID')
			.setDesc('목록에 없는 ID를 적을 때 사용합니다. 비우면 위 목록을 사용합니다.')
			.addText(text => text
				.setPlaceholder(DEFAULT_OPENAI_TTS_VOICE)
				.setValue(known ? '' : this.plugin.settings.openaiTtsVoice)
				.onChange(async (value) => {
					const check = checkVoiceId(value, true);
					if (!check.ok) {
						new Notice(check.message);
						return;
					}
					if (!check.value) {
						this.plugin.settings.openaiTtsVoice = DEFAULT_OPENAI_TTS_VOICE;
						await this.plugin.saveSettings();
						return;
					}
					this.plugin.settings.openaiTtsVoice = check.value;
					await this.plugin.saveSettings();
				}));
	}

	private addXaiVoice(containerEl: HTMLElement): void {
		new Setting(containerEl)
			.setName('Grok 목소리')
			.setDesc('기본값: Sal.')
			.addDropdown(dropdown => {
				const male = dropdown.selectEl.createEl('optgroup', { attr: { label: '남성' } });
				const female = dropdown.selectEl.createEl('optgroup', { attr: { label: '여성' } });
				XAI_TTS_VOICES.forEach(voice => {
					const group = voice.gender === 'F' ? female : male;
					const option = group.createEl('option', { text: `${voice.name} (${voice.style})`, value: voice.name });
					if (voice.name === this.plugin.settings.xaiTtsVoice) option.selected = true;
				});
				return dropdown.onChange(async (value) => {
					if (!value) return;
					this.plugin.settings.xaiTtsVoice = value;
					await this.plugin.saveSettings();
				});
			});
	}

	private addUnitSlider(
		containerEl: HTMLElement,
		name: string,
		desc: string,
		value: number,
		fallback: number,
		save: (value: number) => Promise<void>
	): void {
		new Setting(containerEl)
			.setName(name)
			.setDesc(desc)
			.addSlider(slider => slider
				.setLimits(0, 1, 0.01)
				.setValue(clampUnitInterval(value, fallback))
				.setDynamicTooltip()
				.onChange(async (next) => {
					await save(clampUnitInterval(next, fallback));
				}));
	}

	private elevenPreset(value: string): { stability: number; similarity: number; style: number; boost: boolean } {
		if (value === 'lecture') return { stability: 0.75, similarity: 0.75, style: 0, boost: true };
		if (value === 'news') return { stability: 0.85, similarity: 0.75, style: 0, boost: true };
		if (value === 'story') return { stability: 0.4, similarity: 0.75, style: 0.45, boost: true };
		if (value === 'asmr') return { stability: 0.5, similarity: 0.9, style: 0, boost: false };
		return { stability: 0.5, similarity: 0.75, style: 0, boost: true };
	}

	private async loginDrive(): Promise<void> {
		if (!this.plugin.settings.googleDriveClientId || !this.plugin.settings.googleDriveClientSecret) {
			new Notice('클라이언트 ID와 시크릿을 먼저 입력하세요.');
			return;
		}
		try {
			new Notice('Google 로그인 창을 엽니다.');
			const { GoogleOAuthFlow } = await import('./src/cloud/google-oauth-flow');
			const oauthFlow = new GoogleOAuthFlow({
				clientId: this.plugin.settings.googleDriveClientId,
				clientSecret: this.plugin.settings.googleDriveClientSecret,
				redirectPort: 8585
			});
			const tokens = await oauthFlow.startOAuthFlow();
			this.plugin.settings.googleDriveToken = tokens.accessToken;
			this.plugin.settings.googleDriveRefreshToken = tokens.refreshToken;
			this.plugin.settings.googleDriveTokenExpiresAt = tokens.expiresAt;
			this.plugin.settings.googleDriveConnected = true;
			await this.plugin.saveSettings();
			new Notice('✅ 구글 드라이브에 로그인했습니다.');
			this.display();
		} catch (error: any) {
			new Notice(`❌ 로그인에 실패했습니다. ${redactSecrets(error?.message || '')}`);
		}
	}

	private async logoutDrive(): Promise<void> {
		this.plugin.settings.googleDriveConnected = false;
		this.plugin.settings.googleDriveToken = '';
		this.plugin.settings.googleDriveRefreshToken = '';
		this.plugin.settings.googleDriveTokenExpiresAt = 0;
		await this.plugin.saveSettings();
		this.display();
		new Notice('구글 드라이브에서 로그아웃했습니다. 폴더 ID는 그대로 둡니다.');
	}

	private async testDrive(): Promise<void> {
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
					if (tokens.refreshToken) this.plugin.settings.googleDriveRefreshToken = tokens.refreshToken;
					await this.plugin.saveSettings();
				}
			});
			const isConnected = await client.testConnection();
			if (!isConnected) {
				new Notice('❌ 구글 드라이브 연결에 실패했습니다.');
				return;
			}
			const userInfo = await client.getUserInfo();
			new Notice(`✅ ${userInfo?.email || '계정'}으로 연결되어 있습니다.`);
		} catch (error: any) {
			new Notice(`❌ 구글 드라이브 연결에 실패했습니다. ${redactSecrets(error?.message || '')}`);
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
				return DEFAULT_GEMINI_TEXT_MODEL;
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

	private addModelPicker(
		containerEl: HTMLElement,
		name: string,
		desc: string,
		models: ModelOption[],
		defaultId: string,
		current: string,
		apply: (modelId: string) => Promise<void>
	): void {
		const known = models.some((model) => model.id === current);
		let selected = known ? current : (models[0]?.id || defaultId);
		let custom = known ? '' : current;

		const save = async (next: string) => {
			const check = checkModelId(next, false);
			if (!check.ok) {
				new Notice(check.message);
				return;
			}
			await apply(check.value);
		};

		new Setting(containerEl)
			.setName(name)
			.setDesc(`${desc} 기본값: ${defaultId}.`)
			.addDropdown((dropdown) => {
				models.forEach((model) => dropdown.addOption(model.id, model.label));
				if (!known && current) dropdown.addOption(current, `${current} (저장됨)`);
				return dropdown
					.setValue(known ? selected : (current || selected))
					.onChange(async (value) => {
						selected = value;
						custom = '';
						await save(selected);
						this.display();
					});
			});

		new Setting(containerEl)
			.setName(`${name} 직접 입력`)
			.setDesc('비우면 위 목록을 사용합니다. 적은 ID는 목록보다 우선합니다.')
			.addText((text) => text
				.setPlaceholder(defaultId)
				.setValue(custom)
				.onChange(async (value) => {
					const check = checkModelId(value, true);
					if (!check.ok) {
						new Notice(check.message);
						return;
					}
					custom = check.value;
					await save(custom || selected);
				}));
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
