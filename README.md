Below is a new README for your extension, with clear guidance for integrating and configuring the Ollama server—especially focusing on adding the necessary CORS environment variables for Linux using systemd, and clarifying that successful operation is currently confirmed only on PopOS! with Brave. All instructions and limitations are explained in direct context for contributors and users.

***

# X Account Tracker – AI Enhanced

A browser extension that helps you track and organize your opinions about X (formerly Twitter) accounts, featuring AI-powered sentiment analysis using a local Ollama server.

## Features

- **Account Tracking:** Tag and categorize X/Twitter accounts with custom sentiments.
- **AI-Powered Analysis:** Get intelligent sentiment/tag suggestions using local LLM inference.
- **Content Analysis:** Analyze posts for sentiment and detect topics automatically.
- **Pattern Recognition:** Learns from your interaction history for improved suggestions.
- **Topic Extraction:** Spots subjects commonly discussed by accounts.
- **Privacy-First:** All AI processing is strictly local; no third-party APIs or data leaks.
- **Data Management:** Export and import your tracking data.

## Supported Platforms and Limitations

⚠️ **Current Limitations:**
- The extension’s AI features are fully verified only on **PopOS! (Linux) with Brave browser**.
- Chrome or other Chromium browsers with Manifest V3 may work, but are not officially supported yet.
- **Firefox is NOT supported** due to CORS incompatibilities and Manifest V3 limitations.
- Your Ollama server **must be installed locally** and properly configured to allow CORS requests from your browser/environment—see instructions below for Linux/systemd.
- Expect issues on other platforms or browsers until further development or community testing broadens support.

## Prerequisites

1. **Clone this Repository:**
   ```bash
   git clone https://github.com/Mustard5x/x-account-tracker.git
   cd x-account-tracker
   ```
2. **Install & Configure the Extension:**
   - For Brave/Chromium:
     - Go to `chrome://extensions`
     - Enable "Developer mode"
     - Click "Load unpacked" and select this directory
   - **Firefox is currently NOT supported**
3. **Set Up Ollama (for AI features):**
   - Install Ollama locally
   - Pull a recommended model, e.g.:
     ```bash
     ollama pull llama3:23b
     ```
   - Follow environment variable setup below to enable CORS if you want to use AI features.

## Vital Step: Configure Ollama for Browser CORS (PopOS! Example)

To let your local extension communicate with the Ollama API (which is necessary for sentiment AI analysis), you MUST allow CORS requests by adding the appropriate environment variable to your Ollama server configuration.

**For Linux (PopOS!) with Ollama installed as a systemd service:**

1. **Create or Edit the Service Override:**
   ```bash
   sudo systemctl edit ollama
   ```
2. **Add CORS Allow Environment Variable**
   Insert the following:
   ```
   [Service]
   Environment="OLLAMA_ORIGINS=*"
   ```
   Save (exit editor).
   
3. **Reload and Restart Ollama:**
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl restart ollama
   ```

4. **Verify the Configuration:**
   - Check the override file:
     ```
     cat /etc/systemd/system/ollama.service.d/override.conf
     ```
     You should see the `[Service] Environment="OLLAMA_ORIGINS=*"` line.
   - Restart Ollama and check log output:
     ```
     sudo journalctl -u ollama -n 20 --no-pager
     ```
     Look for mention of `OLLAMA_ORIGINS` to confirm it was picked up.

5. **Test CORS Header (Should Return `Access-Control-Allow-Origin: *`):**
   ```bash
   curl -H "Origin: https://x.com" -H "Access-Control-Request-Method: POST" -H "Access-Control-Request-Headers: Content-Type" -X OPTIONS http://localhost:11434/api/tags -v
   ```

   If the header is missing, double-check the steps above or consult systemd documentation. If still unresolved, you may need to edit the main service file directly and add the Environment line under `[Service]` before restarting.

## Usage

- **Tag Accounts:** Hover on X profiles to tag or add notes.
- **Set Sentiments:** Choose from "agree", "disagree", "mixed", etc.
- **Enable AI (Advanced settings):** Go to the extension popup, set Ollama URL (default: `http://localhost:11434`), choose a model, and toggle on AI features.
- **Export/Import Data:** Save or restore your tracking database as JSON.

## Project Roadmap

- Broader browser/platform support.
- Advanced filtering and visualization tools.
- Support for additional models and external APIs (subject to privacy).
- Community testing and feedback needed especially for other OS/browser combinations.

## Security & Privacy

- All data is stored locally—no tracking, analytics, or account registration.
- You must configure Ollama server security if making it accessible on your LAN or beyond localhost. By default, this extension assumes **localhost-only** for maximum safety.

## Disclaimer

This extension is not affiliated with or endorsed by X Corp (formerly Twitter, Inc). **CORS and AI features currently verified only on PopOS! + Brave.** Use on other platforms at your own risk—contributions to expand support are welcome!

***

Contributors and testers: Please help expand official support by submitting bugs and documentation for running configurations on other operating systems and browsers. See CONTRIBUTING.md for details.

[1](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/30798160/1d68619e-a323-48dd-9c1e-e811a78a9fd0/README.md)
[2](https://objectgraph.com/blog/ollama-cors/)
[3](https://singlequote.blog/cors-challenges-with-local-ollama-installations/)
[4](https://github.com/ollama/ollama/issues/13001)
[5](https://lobehub.com/docs/usage/providers/ollama)
[6](https://micz.it/thunderbird-addon-thunderai/ollama-cors-information/)
[7](https://translucentcomputing.github.io/kubert-assistant-lite/ollama.html)
[8](https://github.com/ollama/ollama/issues/2308)
[9](https://www.linkedin.com/posts/durgaprasad-budhwani_how-to-handle-cors-settings-in-ollama-a-activity-7177995418989969408-Lt4f)
[10](https://github.com/ollama/ollama/issues/6389)
[11](https://www.reddit.com/r/ollama/comments/1lkp8bu/anyone_using_ollama_with_browser_plugins_we_built/)
[12](https://apidog.com/blog/how-to-use-ollama/)
[13](https://github.com/ollama/ollama/issues/2941)
[14](https://ollama.readthedocs.io/en/faq/)
[15](https://hostkey.com/documentation/technical/gpu/ollama/)
[16](https://docs.ollama.com/faq)
[17](https://itsfoss.com/brave-web-browser/)
[18](https://github.com/ollama/ollama/issues/300)
[19](https://www.youtube.com/watch?v=9QvQvQOVdt8)
[20](https://community.brave.app/t/feature-request-custom-context-length/567509)
[21](https://atlassc.net/2025/01/15/configuring-your-ollama-server)
---

**Note**: This extension is not affiliated with or endorsed by X Corp (formerly Twitter, Inc.)
