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

The extension computes a combined **engagement score** per account from two signals:

- **Dwell time** — how long each post was visible in your viewport before you scrolled past
- **Interactions** — likes and retweets you make while browsing

| Score | Indicator | Meaning |
|-------|-----------|---------|
| < -0.5 | 🔴 Low | You consistently scroll past |
| -0.5 to +0.5 | 🟡 Medium | You occasionally engage |
| > +0.5 | 🟢 High | You actively engage |

Accounts with a low score over 10+ observations, or not seen in 30+ days, are flagged as stale.

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

```bash
sudo mkdir -p /etc/systemd/system/ollama.service.d
sudo tee /etc/systemd/system/ollama.service.d/override.conf << 'EOF'
[Service]
Environment="OLLAMA_ORIGINS=*"
EOF
sudo systemctl daemon-reload
sudo systemctl restart ollama
```

### macOS

Add to your shell profile (`~/.zshrc` or `~/.bashrc`):
```bash
export OLLAMA_ORIGINS="*"
```

Then restart Ollama.

### Windows

Set environment variable `OLLAMA_ORIGINS` to `*` in System Properties → Environment Variables, then restart Ollama.

> **Why `*` instead of a specific extension ID?** Unpacked extensions get a new `chrome-extension://` ID every time they are reloaded during development. A hardcoded ID will silently break POST requests (GET requests like `/api/tags` may still succeed, making this hard to diagnose). Since Ollama only listens on localhost, the wildcard has no security impact.

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
- [x] Sprint 4: Engagement scoring, staleness detection, sort/filter controls
- [ ] Sprint 5: Unfollow queue with human-like pacing and confirmation step

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
