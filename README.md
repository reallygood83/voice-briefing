# 🎙️ Obsidian Voice Briefing Plugin

Convert your Obsidian notes into 1-2 minute audio briefings using AI and Text-to-Speech, with cloud sharing support via Google Drive.

---

## ⚖️ LICENSE AND COPYRIGHT

**Copyright © 2025 reallygood83. All Rights Reserved.**

**IMPORTANT:** This software is for **personal use only**.

### Commercial Use Restrictions
- ❌ **Commercial use is PROHIBITED** without explicit written permission from the author
- ❌ You may NOT use this software in any business or commercial environment
- ❌ You may NOT sell, distribute, or sublicense this software
- ❌ You may NOT provide paid services using this software

### Permission Required
- ✅ **Personal, non-commercial use** is permitted
- 📧 **All other uses** require written permission from the author
- 🔐 Contact: [GitHub](https://github.com/reallygood83/voice-note-obsidian)

For full license terms, see the [LICENSE](LICENSE) file.

---

## ✨ Features

### 🤖 Multi-Provider AI Script Generation
- **Google Gemini** (Recommended - Free)
- **XAI/Grok**
- **OpenAI GPT-4**
- **Anthropic Claude**

### 🔊 Dual TTS Support
- **Edge TTS** - Free, built-in Microsoft voices
- **ElevenLabs** - Premium, natural-sounding voices

### ☁️ Google Drive Cloud Sharing
- Upload audio files to Google Drive
- Generate public sharing links
- Three link format options:
  - HTML Audio Player (recommended)
  - Markdown Link
  - Direct URL

### 🌐 Multi-Language Support
- 🇰🇷 Korean (한국어)
- 🇺🇸 English (US)
- 🇯🇵 Japanese (日本語)
- 🇨🇳 Chinese (中文)
- 🇪🇸 Spanish (Español)
- 🇫🇷 French (Français)
- 🇩🇪 German (Deutsch)

### 🎨 Three Briefing Styles
- **Metaphorical** - Easy analogies for complex concepts
- **Feynman Technique** - Teaching-style explanations
- **News Anchor** - Professional presentation style
- **Custom** - Define your own style with prompts

## 📦 Installation

### Prerequisites
1. **Obsidian** v0.15.0 or higher
2. **Node.js** v16 or higher (for development)
3. **Edge TTS** (for free TTS option):
   ```bash
   pip install edge-tts
   ```

### Install Plugin
1. Download the latest release from [GitHub](https://github.com/reallygood83/voice-note-obsidian)
2. Extract to `.obsidian/plugins/voice-note-obsidian/`
3. Enable the plugin in Obsidian Settings → Community Plugins

## ⚙️ Configuration

### 1️⃣ AI Provider Setup

#### Google Gemini (Recommended - Free)
1. Get API key from [Google AI Studio](https://makersuite.google.com/app/apikey)
2. In plugin settings:
   - AI Provider: **Google Gemini**
   - API Key: `your-gemini-api-key`
   - Model: `gemini-2.0-flash` (default)

#### Other Providers
- **XAI**: Get key from [XAI Console](https://console.x.ai/)
- **OpenAI**: Get key from [OpenAI Platform](https://platform.openai.com/)
- **Anthropic**: Get key from [Anthropic Console](https://console.anthropic.com/)

### 2️⃣ TTS Engine Setup

#### Option A: Edge TTS (Free)
1. Install Edge TTS:
   ```bash
   pip install edge-tts
   ```
2. In plugin settings:
   - TTS Engine: **Edge TTS (Free)**
   - Select voice based on your language

#### Option B: ElevenLabs (Premium)
1. Sign up at [ElevenLabs](https://elevenlabs.io/)
2. Get API key from account settings
3. In plugin settings:
   - TTS Engine: **ElevenLabs (Premium)**
   - API Key: `your-elevenlabs-api-key`
   - Voice ID: `voice-id-from-elevenlabs`

### 3️⃣ Google Drive Setup (Optional)

#### Get OAuth 2.0 Access Token
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable Google Drive API
4. Create OAuth 2.0 credentials:
   - Application type: **Desktop app**
   - Download credentials JSON
5. Use OAuth Playground or script to get access token:
   ```bash
   # Example using OAuth Playground
   https://developers.google.com/oauthplayground/
   ```
6. In plugin settings:
   - Enable Cloud Sharing: **ON**
   - Paste access token
   - Click **Test Connection** to verify

#### Optional: Create Upload Folder
1. Create folder in Google Drive
2. Copy folder ID from URL: `https://drive.google.com/drive/folders/YOUR_FOLDER_ID`
3. Paste folder ID in plugin settings

## 🚀 Usage

### Generate Voice Briefing
1. Open any note in Obsidian
2. Run command: `Generate Voice Briefing` (Ctrl/Cmd+P)
3. Wait for AI script generation and audio conversion
4. Audio will be embedded at the bottom of your note

### Link Format Examples

#### HTML Audio Player (Recommended)
```markdown
## 🎧 Voice Briefing

<audio controls src="https://drive.google.com/uc?export=download&id=FILE_ID"></audio>

*Generated on 2025-01-24 • Duration: ~90s*
*[View in Google Drive](https://drive.google.com/file/d/FILE_ID/view)*
```

#### Markdown Link
```markdown
## 🎧 Voice Briefing

[🔊 Play Audio](https://drive.google.com/uc?export=download&id=FILE_ID)

*Generated on 2025-01-24 • Duration: ~90s*
*[View in Google Drive](https://drive.google.com/file/d/FILE_ID/view)*
```

#### Direct URL
```markdown
## 🎧 Voice Briefing

https://drive.google.com/uc?export=download&id=FILE_ID

*Generated on 2025-01-24 • Duration: ~90s*
```

## 🔧 Troubleshooting

### Common Issues

#### "Edge TTS: command not found"
- **Solution**: Install Edge TTS with `pip install edge-tts`
- **Verify**: Run `edge-tts --help` to confirm installation

#### "Invalid API key"
- **Solution**: Check API key format and provider selection
- Ensure API key has proper permissions

#### "Google Drive upload failed"
- **Solution**: Test connection in settings
- Check access token validity (tokens expire after ~1 hour)
- Verify folder ID if using custom folder

#### "Audio not playing in shared notes"
- **Solution**: Use HTML or Markdown link format instead of local files
- Local `![[file.mp3]]` syntax only works in your vault

## 🛠️ Development

### Build from Source
```bash
# Clone repository
git clone https://github.com/reallygood83/voice-note-obsidian.git
cd voice-note-obsidian

# Install dependencies
npm install

# Build plugin
npm run build

# Development mode (watch)
npm run dev
```

### Project Structure
```
voice-note-obsidian/
├── main.ts                     # Plugin main file
├── src/
│   ├── ai/
│   │   └── script-generator.ts # AI script generation
│   ├── tts/
│   │   ├── edge-tts-handler.ts # Edge TTS integration
│   │   ├── elevenlabs-handler.ts # ElevenLabs integration
│   │   └── tts-generator.ts    # Unified TTS interface
│   └── cloud/
│       └── google-drive-client.ts # Google Drive API client
├── styles.css                  # Plugin styles
├── manifest.json               # Plugin metadata
└── package.json                # Dependencies
```

## 📋 Roadmap

- [x] Multi-provider AI script generation
- [x] Edge TTS and ElevenLabs support
- [x] Google Drive cloud sharing
- [x] Multi-language support
- [ ] OAuth 2.0 flow UI
- [ ] Batch processing for multiple notes
- [ ] Custom voice cloning (ElevenLabs)
- [ ] Audio transcription for existing recordings

## 🙏 Acknowledgments

- Built with [Obsidian API](https://github.com/obsidianmd/obsidian-api)
- AI powered by Google Gemini, XAI, OpenAI, and Anthropic
- TTS by Microsoft Edge TTS and ElevenLabs
- Cloud storage by Google Drive

## 🐛 Bug Reports & Feature Requests

Please open an issue on [GitHub](https://github.com/reallygood83/voice-note-obsidian/issues)

## 👤 Author

**문정** (reallygood83)
- GitHub: [@reallygood83](https://github.com/reallygood83)

## 🌟 Support

If you find this plugin useful, please consider:
- ⭐ Starring the repository
- 🐛 Reporting bugs and issues
- 💡 Suggesting new features
- 📖 Contributing to documentation

---

**Made with ❤️ for the Obsidian community**

🚧 **Development Status**: Active development, ready for testing
