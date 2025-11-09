# X Account Tracker - AI Enhanced

[![Version](https://img.shields.io/badge/version-2.0.0-blue.svg)](https://github.com/Mustard5/x-account-tracker)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Chrome](https://img.shields.io/badge/browser-Chrome-yellow.svg)](https://www.google.com/chrome/)
[![Firefox](https://img.shields.io/badge/browser-Firefox-orange.svg)](https://www.mozilla.org/firefox/)

A browser extension that helps you track and organize your opinions about X (formerly Twitter) accounts with AI-powered sentiment analysis using local Ollama models.

![Extension Demo](docs/demo.gif)

## 🌟 Features

- **Account Tracking**: Easily tag and categorize X/Twitter accounts with customizable sentiments
- **AI-Powered Analysis**: Leverage local Ollama models for intelligent sentiment suggestions
- **Content Analysis**: Automatically analyze posts for sentiment and topic extraction
- **Pattern Recognition**: Learn from your interaction history to provide better suggestions
- **Topic Extraction**: Automatically detect topics from user posts
- **Privacy-First**: All AI processing happens locally via Ollama - no data sent to external servers
- **Data Management**: Export and import your tracking data

## 🚀 Quick Start

### Prerequisites

- Chrome, Firefox, or any Chromium-based browser
- [Ollama](https://ollama.ai) installed locally (optional, for AI features)

### Installation

#### From Source

1. Clone this repository:
   ```bash
   git clone https://github.com/Mustard5/x-account-tracker.git
   cd x-account-tracker
   ```

2. Load the extension in your browser:

   **Chrome/Chromium:**
   - Navigate to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the extension directory

   **Firefox:**
   - Navigate to `about:debugging#/runtime/this-firefox`
   - Click "Load Temporary Add-on"
   - Select `manifest.json` from the extension directory

3. (Optional) Set up Ollama:
   - Install [Ollama](https://ollama.ai)
   - Pull a recommended model: `ollama pull llama3.2:3b`
   - Configure the extension settings to connect to Ollama

## 📖 Usage

### Basic Usage

1. **Visit X/Twitter**: Navigate to any X/Twitter profile or feed
2. **Tag Accounts**: Hover over usernames to see the "+ Tag" button
3. **Set Sentiments**: Choose from agree, disagree, mixed, expert, biased, or neutral
4. **Add Notes**: Include custom notes about why you tagged an account
5. **Track Topics**: Associate specific topics with accounts

### AI Features

1. **Enable AI**: Open the extension popup and navigate to AI Settings
2. **Configure Ollama**: Set your Ollama URL (default: `http://localhost:11434`)
3. **Select Model**: Choose from available models (Llama 3.2, Llama 3.1, or Mistral)
4. **Enable Features**:
   - Content Analysis: Analyze post content for sentiment
   - Pattern Recognition: Learn from your interactions
   - Topic Extraction: Auto-detect topics from posts
   - Auto-Suggest Tags: Get AI suggestions when tagging

### Data Management

- **Export Data**: Click "Export Data" to save your tracking database as JSON
- **Import Data**: Click "Import Data" to restore from a previous export

## 🛠️ Configuration

### AI Settings

| Setting | Description | Default |
|---------|-------------|---------|
| Ollama URL | Local Ollama server address | `http://localhost:11434` |
| Model | AI model to use | `llama3.2:3b` |
| Enable AI Analysis | Master switch for all AI features | Disabled |
| Content Analysis | Analyze post content | Disabled |
| Pattern Recognition | Learn from interactions | Disabled |
| Topic Extraction | Auto-detect topics | Disabled |
| Auto-Suggest Tags | Get AI suggestions | Disabled |

## 🏗️ Project Structure

```
x-account-tracker/
├── manifest.json          # Extension manifest
├── content.js            # Content script (main logic)
├── popup.html            # Extension popup interface
├── popup.js              # Popup functionality
├── styles.css            # Extension styles
├── icons/                # Extension icons
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── docs/                 # Documentation
│   └── screenshots/      # Screenshots and demos
├── LICENSE               # License file
├── README.md             # This file
├── CONTRIBUTING.md       # Contribution guidelines
├── CODE_OF_CONDUCT.md    # Code of conduct
└── CHANGELOG.md          # Version history
```

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guidelines](CONTRIBUTING.md) for details on:

- How to report bugs
- How to suggest features
- How to submit pull requests
- Coding standards
- Development setup

## 📋 Requirements

- **Browser**: Chrome 88+, Firefox 89+, or any Chromium-based browser with Manifest V3 support
- **Ollama** (optional): Latest version for AI features
- **Storage**: Minimal local storage for tracking database

## 🔒 Privacy

This extension prioritizes your privacy:

- All tracking data is stored locally in your browser
- AI processing happens locally via Ollama
- No data is sent to external servers
- No analytics or telemetry
- No account registration required

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Ollama](https://ollama.ai) for local AI model inference
- [Mozilla Web Extensions](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions) documentation
- All contributors who help improve this extension

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/Mustard5/x-account-tracker/issues)
- **Discussions**: [GitHub Discussions](https://github.com/Mustard5/x-account-tracker/discussions)

## 🗺️ Roadmap

- [ ] Support for additional AI models
- [ ] Advanced filtering and search
- [ ] Export to different formats (CSV, Markdown)
- [ ] Cross-browser sync (optional)
- [ ] Customizable sentiment categories
- [ ] Analytics dashboard

## 📊 Changelog

See [CHANGELOG.md](CHANGELOG.md) for a detailed version history.

---

**Note**: This extension is not affiliated with or endorsed by X Corp (formerly Twitter, Inc.)
