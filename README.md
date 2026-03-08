# X Account Tracker

A browser extension that helps you understand and manage your X (Twitter) feed by passively categorizing the accounts you follow.

## The Problem

X's follow system is **binary and permanent** — you either follow someone or you don't. But your interests are **dynamic and temporal**.

The pattern:
1. A topic gets hot (politics, crypto, AI, a news event)
2. You discover and follow accounts covering that topic
3. The topic cools or your interests shift
4. Those accounts remain in your feed, generating noise
5. Your follow list becomes a graveyard of stale interests

X provides no way to see your follows grouped by topic, no staleness detection, and no bulk management by category.

## The Solution

This extension observes your feed passively as you browse and builds a picture of who you follow and what they talk about. No behavior change required — just scroll normally.

### How It Works

1. **Passive Observation** — As posts scroll past, the extension silently collects signals: who posted, what they said, how long you dwelled on it
2. **Batch Categorization** — Periodically, accumulated posts are sent to your local Ollama instance for topic categorization
3. **Dashboard View** — Open the extension popup to see your feed composition broken down by category with engagement indicators

### Categories

Accounts are automatically sorted into:
- Technology
- AI/ML
- Politics
- Faith/Spirituality
- Finance/Crypto
- Sports
- Entertainment
- Science
- News/Media
- Personal/Lifestyle
- Other

### Engagement Indicators

The extension tracks **dwell time** — how long each post was visible in your viewport before you scrolled past. This behavioral signal reveals actual engagement independent of content:

| Dwell Time | Indicator | Meaning |
|------------|-----------|---------|
| < 1 second | 🔴 Low | You scroll past quickly |
| 1-4 seconds | 🟡 Medium | You glance at it |
| > 4 seconds | 🟢 High | You actually read it |

Categories dominated by low-engagement accounts are flagged — these are your stale follows.

## Privacy Architecture

- **100% local processing** — No data leaves your browser
- **No X API dependency** — Reads DOM content only, no OAuth required
- **No external servers** — Categorization runs on your local Ollama instance
- **No tracking or analytics** — We don't know you exist

## Requirements

### Browser
- Brave (verified)
- Chrome/Chromium (should work, not officially tested)
- Firefox is **not supported** (Manifest V3 limitations)

### Ollama (for AI categorization)
The extension works without Ollama — it will collect signals and track dwell time, but won't categorize accounts by topic.

For full functionality:
1. Install [Ollama](https://ollama.ai)
2. Pull a model: `ollama pull llama3.2`
3. Configure CORS (see below)

## Installation

1. Clone or download this repository:
   ```bash
   git clone https://github.com/Mustard5/x-account-tracker.git
   ```

2. Load in your browser:
   - Go to `chrome://extensions` or `brave://extensions`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the repository folder

3. Browse X normally — the extension activates automatically on x.com

## Configuring Ollama for CORS

The extension needs to communicate with Ollama running on localhost. You must configure CORS to allow this.

### Linux (systemd)

1. Get your extension ID from `chrome://extensions`

2. Create a service override:
   ```bash
   sudo systemctl edit ollama
   ```

3. Add (replace YOUR_EXTENSION_ID):
   ```ini
   [Service]
   Environment="OLLAMA_ORIGINS=chrome-extension://YOUR_EXTENSION_ID"
   ```

4. Reload and restart:
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl restart ollama
   ```
### Important: Extension ID Changes

When you load an unpacked extension, the browser assigns a temporary ID. This ID **changes** if you remove and re-add the extension.
Always verify your current ID at `chrome://extensions` or `brave://extensions` matches what's in your Ollama configuration.

### macOS

Add to your shell profile (~/.zshrc or ~/.bashrc):
```bash
export OLLAMA_ORIGINS="chrome-extension://YOUR_EXTENSION_ID"
```

Then restart Ollama.

### Windows

Set environment variable `OLLAMA_ORIGINS` to `chrome-extension://YOUR_EXTENSION_ID` in System Properties → Environment Variables, then restart Ollama.

## Usage

1. **Enable AI** — Open the extension popup, go to AI Settings, toggle on "Enable AI Analysis"
2. **Set Ollama URL** — Default is `http://localhost:11434`
3. **Select Model** — Choose from your installed Ollama models
4. **Browse X** — Scroll through your feed normally
5. **Check Dashboard** — Open the extension popup to see your feed composition

The extension processes signals in batches during browser idle time, so categorization happens in the background without impacting your browsing.

## Troubleshooting

### Brave Shields Blocking Ollama

Brave Shields may block requests to your local Ollama server, preventing categorization from working.

**Symptoms:**
- Signals collect but accounts never get categorized
- Console shows fetch errors to localhost:11434

**Fix:**
1. While on x.com, click the Brave Shields icon (lion) in the address bar
2. Set tracker blocking to "Allow all trackers & ads" for this site
3. Refresh the page

This only affects x.com — your other browsing remains protected. The extension only communicates with localhost, so allowing trackers on x.com doesn't expose you to external tracking.

## What You'll See

After browsing for a while, your dashboard might show:

```
Feed Categories                    47 accounts observed

▶ Politics           23 accounts   ⚠ low engagement
▶ AI/ML              12 accounts
▶ Finance/Crypto      6 accounts
▶ Technology          4 accounts
▶ Entertainment       2 accounts
```

Click a category to expand and see individual accounts with their engagement levels. The ⚠ warning indicates categories where you consistently scroll past quickly — these are candidates for unfollowing.

## Roadmap

- [x] Sprint 1: Passive feed observation with dwell time tracking
- [x] Sprint 2: Ollama batch categorization
- [x] Sprint 3: Category management dashboard
- [ ] Sprint 4: Unfollow queue with rate limiting
- [ ] Sprint 5: Export/import category data

## Technical Notes

- **Manifest V3** — Uses modern Chrome extension APIs
- **IndexedDB Storage** — All data persists locally in browser storage
- **IntersectionObserver** — Efficient viewport-based dwell time tracking
- **requestIdleCallback** — AI processing scheduled during browser idle time
- **WeakMap** — No memory leaks as X recycles DOM elements

## Contributing

This project is in active development. Issues and PRs welcome.

## License

MIT

---

**Note:** This extension is not affiliated with or endorsed by X Corp.
