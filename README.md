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
- **Google Gemini** (default `gemini-3.8-flash`)
- **xAI Grok** (default `grok-4.7`)
- **OpenAI** (default `gpt-6.1-sol`)
- **Anthropic Claude** (default `claude-sonnet-5`)

Each provider has a model dropdown plus a custom model ID field. Saved IDs that vendors have retired are moved to a current ID the first time settings load. An ID you typed yourself is left as-is.

### 🔊 Text-to-Speech
- **Edge TTS** - Free local Microsoft voices (`edge-tts` CLI)
- **Gemini TTS** - default `gemini-3.8-flash-tts`
- **OpenAI TTS** - default `gpt-4o-mini-tts`
- **ElevenLabs** - default `eleven_v4`, with `eleven_v4_turbo` and earlier models in the dropdown, plus a custom model ID field
- **xAI TTS** - present in settings, not used for generation (the realtime socket cannot refresh auth)

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
2. Extract to `.obsidian/plugins/voice-briefing/` (the folder name must match the plugin id)
3. Enable the plugin in Obsidian Settings → Community Plugins

## ⚙️ Configuration

### 1️⃣ AI Provider Setup

#### Google Gemini (Recommended - Free)
1. Get API key from [Google AI Studio](https://makersuite.google.com/app/apikey)
2. In plugin settings:
   - AI Provider: **Google Gemini**
   - API Key: `your-gemini-api-key`
   - Model: `gemini-3.8-flash` (default). Pick another listed model, or type a model ID in the custom field.

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

#### Option B: ElevenLabs
1. Sign up at [ElevenLabs](https://elevenlabs.io/)
2. Get an API key from account settings
3. In plugin settings:
   - TTS Engine: **ElevenLabs**
   - API Key: your ElevenLabs API key
   - Voice ID: a voice id from ElevenLabs
   - Model: **Eleven v4** (`eleven_v4`) is the default. `eleven_v4_turbo` is also listed. A non-empty custom model ID overrides the dropdown.

#### Option C: Gemini TTS or OpenAI TTS
Select the engine, set that provider's API key, then choose a model from the dropdown or type a custom model ID.

### 3️⃣ Google Drive 연결 (선택)

액세스 토큰을 붙여 넣지 않습니다. 데스크톱 앱이 `127.0.0.1` 루프백으로 Google 로그인 창을 열고, PKCE로 코드를 바꾼 뒤 refresh token을 플러그인 데이터에 저장합니다. 토큰은 로그에 남기지 않습니다. 공식 안내: [OAuth 2.0 for Mobile & Desktop Apps](https://developers.google.com/identity/protocols/oauth2/native-app).

#### Google Cloud에서 데스크톱 클라이언트 만들기
1. [Google Cloud Console](https://console.cloud.google.com/)에서 프로젝트를 만들거나 고릅니다.
2. **API 및 서비스 → 라이브러리**에서 **Google Drive API**를 사용 설정합니다.
3. **OAuth 동의 화면**을 구성합니다. 앱이 **테스트** 상태이면 refresh token이 **7일** 뒤에 만료됩니다. 본인 Google 계정을 **테스트 사용자**로 추가하거나, 앱을 게시하세요.
4. **사용자 인증 정보 → 사용자 인증 정보 만들기 → OAuth 클라이언트 ID**에서 애플리케이션 유형을 **데스크톱 앱**으로 만듭니다. 데스크톱 클라이언트에는 클라이언트 ID와 클라이언트 시크릿이 함께 있습니다.
5. 콘솔이 리디렉션 URI를 요구하면 `http://127.0.0.1:8585/callback` 을 추가합니다. 플러그인 기본 포트는 8585입니다.
6. 플러그인 설정에서 Cloud Sharing을 켜고 Client ID와 Client Secret을 입력한 뒤 **Connect with Google**을 누릅니다. 브라우저에서 허용하면 창을 닫고 Obsidian으로 돌아오면 됩니다.
7. 업로드할 폴더를 쓰려면 드라이브 폴더 URL의 폴더 ID를 설정에 넣습니다. 비우면 내 드라이브 루트에 업로드합니다.

#### Optional: Create Upload Folder
1. Create folder in Google Drive
2. Copy folder ID from URL: `https://drive.google.com/drive/folders/YOUR_FOLDER_ID`
3. Paste folder ID in plugin settings

## 🚀 Usage

### Generate Voice Briefing
1. Open any note in Obsidian
2. Run command: `Generate briefing` (the palette shows it as Voice Briefing: Generate briefing)
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
- **Solution**: Use **Connect with Google** again if the refresh token was revoked
- A consent screen left in Testing mode expires refresh tokens after 7 days
- Verify the folder ID if you set one

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
- [x] Google Drive desktop OAuth (loopback + PKCE + refresh token)
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

## Network, accounts, and files

This plugin is desktop-only (`isDesktopOnly: true`). Edge TTS runs the `edge-tts` command, Google sign-in listens on `127.0.0.1`, and audio is written with Node.js file APIs.

It sends note text and API keys only to the provider you select:

- Google Gemini script and TTS APIs, when Gemini is selected
- xAI APIs, when xAI is selected
- OpenAI script and speech APIs, when OpenAI is selected
- Anthropic Messages API, when Claude is selected
- ElevenLabs text-to-speech API, when ElevenLabs is selected
- Google OAuth and Google Drive, when cloud sharing is connected. The access token and refresh token stay in this plugin's data. They are not written to the console.
- Microsoft, indirectly, when Edge TTS is installed: the local `edge-tts` CLI contacts Microsoft to synthesize speech

Audio files are written inside the vault at `<vault>/.obsidian/voice-briefings/` (via `Vault.configDir`, not a hardcoded path). The plugin does not read files outside the vault. There is no telemetry and no self-update.

API keys and Google client credentials are your accounts. Several of these services are paid or have a free tier. Full use of a provider requires that provider's key.

## 커뮤니티 디렉터리에 올리기 전에

라이선스 본문(이 README 위의 LICENSE 절과 저장소 `LICENSE` 파일)은 바꾸지 않았습니다. 그 조건은 개인적 사용만 허용하고 배포·수정·상업적 사용을 금지합니다.

공식 정책:

- [Developer policies](https://docs.obsidian.md/community-directory/developer-policies) — 디렉터리 플러그인은 `LICENSE`가 있어야 하고, 네트워크 사용과 계정 필요 여부를 README에 밝혀야 합니다. 비공개 소스는 건별로 봅니다.
- [The future of Obsidian plugins](https://obsidian.md/blog/future-of-plugins/) — 이 글을 기준으로는 새 비공개 소스 플러그인을 디렉터리에 받지 않습니다.
- 커뮤니티 디렉터리는 릴리스 자산(`main.js`, `manifest.json`, `styles.css`)을 사용자에게 배포합니다. 현재 `LICENSE`는 허가 없는 배포를 금지하므로, 라이선스를 바꾸기 전에는 등록이 막힙니다. 라이선스를 바꿀지는 작성자 결정입니다.

작성자가 직접 할 일:

1. 라이선스를 디렉터리 배포가 가능한 조건으로 바꿀지 결정합니다. 이 저장소는 그 문장을 수정하지 않습니다.
2. GitHub 저장소를 공개합니다.
3. 저장소 Settings → Actions → General → Workflow permissions를 **Read and write**로 둡니다. 릴리스 워크플로는 태그 푸시 때 draft 릴리스를 만들고 공식 템플릿처럼 아티팩트 attestation을 붙입니다.
4. `manifest.json`의 `version`과 같은 주석 태그(`git tag -a 0.5.0 -m "0.5.0"`)를 푸시합니다. Actions가 draft 릴리스를 만들면 **Publish**해야 설치할 수 있습니다. 태그 문자열은 매니페스트 버전과 같아야 합니다.
5. [community.obsidian.md](https://community.obsidian.md)에 GitHub 계정을 연결하고 플러그인을 제출합니다. 제출 화면이 `obsidianmd/obsidian-releases` 풀 리퀘스트를 요구하면 그 PR은 작성자가 만듭니다. 안내: [Submit your plugin](https://docs.obsidian.md/Plugins/Releasing/Submit+your+plugin), [Release your plugin with GitHub Actions](https://docs.obsidian.md/Plugins/Releasing/Release+your+plugin+with+GitHub+Actions).

저장소 루트의 `main.js`는 소스와 함께 커밋된 빌드입니다. 디렉터리는 그 파일을 저장소에서 받지 않고, 릴리스에 첨부된 `main.js`, `manifest.json`, `styles.css`를 받습니다. `versions.json`은 플러그인 버전과 `minAppVersion`을 대응시키며, `minAppVersion`이 바뀐 0.5.0 항목을 추가해 두었습니다.

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
