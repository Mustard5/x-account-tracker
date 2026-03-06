# X Account Tracker — New Direction Summary
*Context document for continuing development in a new chat*

---

## Project Background

An existing Chrome browser extension called **X Account Tracker** (github.com/Mustard5/x-account-tracker) was originally built as an AI-powered sentiment analysis tool for X.com. The extension was developed with Claude Code / Claude Opus 4.5.

### Original Purpose
- User hovers over an account on X.com
- Clicks a `+ Tag` button that appears
- Extension fires an immediate Ollama request for sentiment analysis of that account's posts
- Result returned and stored in IndexedDB
- User manually tags accounts with sentiments: agree / disagree / mixed / expert / neutral / biased

### Why It Wasn't Practically Usable
The immediate on-click Ollama firing created race conditions with X's dynamic feed rendering:
- UI elements appearing in wrong positions as feed reflows
- Multiple simultaneous Ollama requests competing for resources
- Feed feeling sluggish and janky
- Ollama getting hammered with rapid sequential requests
- The tool worked technically but wasn't practically usable in daily browsing

---

## The Core Problem Being Solved (New Direction)

### The Follow Staleness Problem
X.com's follow system is **binary and permanent** — you either follow someone or you don't. But human interest is **dynamic and temporal**.

The pattern:
1. A topic gets hot (politics, crypto, AI, a news event)
2. You discover and follow accounts covering that topic
3. The topic cools or your interests shift
4. Those accounts remain in your feed generating noise
5. X's algorithm exploits this — it serves high-engagement content from stale follows because engagement (even negative) keeps you on platform
6. Your interests and X's interests are structurally misaligned

**Real example from the developer's own experience:** Feed was dominated by political accounts during a political cycle. Interests have since shifted entirely to AI, generative art, and agent frameworks. The political accounts are still there, still generating noise.

### What X Doesn't Provide
- No way to see follows grouped by topic/interest
- No staleness detection
- No bulk management by category
- No visibility into which follows are still relevant vs. historical artifacts
- Feed control is algorithmic, not user-controlled

---

## The New Product Direction

### Core Concept
**Passive feed categorization** — the extension observes what scrolls past as you browse normally, builds a picture of who you follow and what they talk about, and surfaces that picture in a management dashboard. No behavior change required from the user.

### The Key Architectural Shift
**From:** Explicit triggered analysis (you click, it fires, one post analysed immediately)

**To:** Passive continuous observation (it watches the feed silently, batches signals, processes periodically, builds account profiles over time)

### Primary Features

**1. Automatic Account Categorization**
- As posts scroll past, extension collects account + content signals
- Batched to local Ollama for topic classification periodically
- Each followed account gets assigned to 1-2 primary categories
- Categories build over time without any user action

**Suggested category taxonomy:**
- Technology
- AI / Machine Learning
- Politics
- Faith / Spirituality
- Finance / Crypto
- Sports
- Entertainment
- Science
- News / Media
- Personal / Lifestyle
- Other

**2. Staleness Detection**
- Extension tracks dwell time per post (how long it was visible in viewport before scrolling past)
- Tracks engagement (likes, retweets — already implemented)
- Combines behavioral signals to score each follow's current relevance
- Accounts you consistently scroll past quickly = low relevance signal
- Accounts you linger on = high relevance signal
- This is behavioral, not just content-based — independent of what Ollama categorizes

**3. Category Management Dashboard**
Popup panel showing:
```
AI / Machine Learning     — 47 accounts
Politics                  — 31 accounts  [⚠ last engaged 4 months ago]
Faith / Spirituality      — 18 accounts
Cryptocurrency            — 23 accounts  [⚠ last engaged 4 months ago]
Sports                    — 12 accounts
Uncategorized             — 34 accounts
```
- Expandable categories showing individual accounts
- Last engagement date per account
- Activity level indicator
- Bulk select and unfollow stale categories

**4. Unfollow Management**
- Queue-based unfollow with human-like pacing (one every few minutes)
- Avoids X's bot detection
- User reviews before execution
- NOT bulk simultaneous — rate limited and deliberate

---

## Technical Architecture

### What's Already Built (Reusable)

The existing codebase at `github.com/Mustard5/x-account-tracker` already has:

| Component | Status | Notes |
|-----------|--------|-------|
| IndexedDB (v7) | ✅ Complete | Already upgraded from Chrome storage |
| Ollama connection + CORS handling | ✅ Complete | Hardest part, already solved |
| MutationObserver with debounce | ✅ Complete | Feed observation infrastructure exists |
| Interaction tracking (likes/retweets) | ✅ Complete | Already records to DB |
| Input sanitization + validation | ✅ Complete | Thorough XSS protection throughout |
| Content script DOM injection | ✅ Complete | Badge and UI injection working |
| Popup + message passing | ✅ Complete | Chrome runtime message infrastructure |
| Export / Import | ✅ Complete | JSON backup/restore working |
| Post text extraction | ✅ Complete | `extractPostText()` working |
| Username extraction from DOM | ✅ Complete | `extractUsername()` working |

### What Needs to Change

**1. Replace triggered analysis with passive signal collection**

Current (remove):
```javascript
quickTag.addEventListener('click', async (e) => {
  aiSuggestion = await getCombinedAISuggestion(username); // fires immediately
```

New (add):
```javascript
function collectFeedSignal(username, postText, dwellTime) {
  signalQueue.push({
    username,
    postText,
    dwellTime,
    timestamp: Date.now()
  });
}
```

**2. Add IntersectionObserver for dwell time measurement**

```javascript
const dwellTracker = new Map(); // username -> entry timestamp

const viewportObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    const username = extractUsernameFromArticle(entry.target);
    if (!username) return;
    
    if (entry.isIntersecting) {
      dwellTracker.set(username, Date.now());
    } else {
      const entryTime = dwellTracker.get(username);
      if (entryTime) {
        const dwell = Date.now() - entryTime;
        collectFeedSignal(username, extractPostText(entry.target), dwell);
        dwellTracker.delete(username);
      }
    }
  });
}, { threshold: 0.5 });
```

**3. Add batch processor on idle cycles**

```javascript
const BATCH_THRESHOLD = 20; // process after 20 signals accumulated
const BATCH_MAX_WAIT_MS = 5 * 60 * 1000; // or after 5 minutes

async function processBatchSignals() {
  if (signalQueue.length < BATCH_THRESHOLD) return;
  const batch = signalQueue.splice(0, BATCH_SIZE);
  await categorizeAccountBatch(batch);
}

// Use requestIdleCallback to avoid impacting feed performance
requestIdleCallback(() => processBatchSignals());
```

**4. Add feedObservations IndexedDB store**

```javascript
// Add to onupgradeneeded in initDB()
if (!db.objectStoreNames.contains('feedObservations')) {
  const obsStore = db.createObjectStore('feedObservations', { 
    keyPath: 'id', autoIncrement: true 
  });
  obsStore.createIndex('username', 'username', { unique: false });
  obsStore.createIndex('timestamp', 'timestamp', { unique: false });
  obsStore.createIndex('category', 'category', { unique: false });
}
```

**5. New batch categorization Ollama prompt**

```javascript
const systemPrompt = `You are categorizing X/Twitter accounts by their primary topics. 
Given a batch of posts from different accounts, assign each account to 1-2 primary 
categories from this list: Technology, AI/ML, Politics, Faith/Spirituality, 
Finance/Crypto, Sports, Entertainment, Science, News/Media, Personal/Lifestyle, Other.
Respond ONLY with JSON: {"username": "category1, category2"}`;
```

**6. New popup dashboard UI**
- Redesign popup.html and popup.js
- Category summary view with account counts and staleness indicators
- Expandable category lists
- Bulk action controls
- Built on existing message passing infrastructure (no changes needed to message handlers)

### Storage Architecture
- **Keep:** Chrome storage local for AI config settings
- **Keep:** IndexedDB `accounts` store for tagged account data
- **Keep:** IndexedDB `interactions` store for like/retweet tracking
- **Keep:** IndexedDB `aiAnalysis` store for cached analysis results
- **Add:** IndexedDB `feedObservations` store for passive observation data
- **Upgrade note:** IndexedDB already in use — version bump to DB_VERSION 8 needed for new store

### Privacy Architecture
- Everything processed locally — no external API calls
- Extension reads DOM of page user is already viewing
- No X API dependency — reads page content not API responses
- Ollama runs locally (existing setup)
- Nothing stored externally
- No OAuth required
- **Key advantage over competitors:** Tools like Fedica, TweetDelete, CircleBoom are all cloud-based and require full OAuth account access. This tool never touches the X API.

---

## Why DOM Reading vs X API

| | DOM Reading (this approach) | X API |
|---|---|---|
| Cost | Free | Expensive, tiered |
| Approval | None needed | Developer account required |
| Dependency | X can change page structure | X can revoke API access |
| Data access | What user sees | What X permits |
| Privacy | Entirely local session | Credentials required |
| ToS risk | Low (user's own session) | High (Musk-era restrictions) |

X has aggressively monetized and restricted API access since acquisition. DOM reading is architecturally more fragile to page structure changes but far more independent.

---

## Monetization Path

**Free tier:**
- Basic category visualization
- Manual category assignment
- Simple follow management
- Limited observation history

**Pro tier — $5-8/month or $40/year:**
- Automatic AI categorization via local Ollama
- Stale category detection with behavioral scoring
- Feed filtering by category
- Dwell time sentiment dashboard
- Follow occasion memory (why did I follow this person?)
- Bulk unfollow queue with pacing

**One-time purchase option — $25-35 lifetime:**
- For privacy-conscious buyers who distrust recurring billing
- Lower LTV but removes subscription friction

**Distribution:**
- X itself is the primary channel — authentic post about the follow staleness problem
- Privacy-focused communities (already the target demographic)
- Chrome Web Store organic discovery
- GitHub visibility (already public)

---

## Competitive Positioning

**Target user:** X power user with 2+ years of follows, frustrated with algorithmic feed, technically comfortable enough to install a browser extension, privacy-conscious.

**Differentiators:**
1. Fully local processing — no data leaves the browser
2. No API dependency — no OAuth, no X developer account
3. Behavioral scoring (dwell time) not just content categorization
4. Staleness detection based on actual engagement patterns over time
5. Privacy story is genuine and architectural, not just a policy claim

**No direct competitor** doing this specific combination of passive categorization + local inference + privacy-first + no API dependency.

---

## Suggested Build Sequence

| Sprint | Focus | Effort |
|--------|-------|--------|
| 1 | Implement passive feed observer. IntersectionObserver for dwell time. Signal queue. No Ollama yet — just verify collection works. | ~2 evenings |
| 2 | Connect signal queue to Ollama batch processing. Build category taxonomy. Verify categorization quality on real feed. | ~2 evenings |
| 3 | Build category management dashboard in popup. Make data visible and understandable. | ~3 evenings |
| 4 | Implement unfollow queue with rate limiting. Test reliability and bot detection avoidance. | ~2 evenings |
| 5 | Polish, edge cases, pricing implementation, Chrome Web Store preparation. | ~3 evenings |

**Estimated time to working proof of concept:** 4 focused evenings
**Estimated time to shippable product:** 4-6 weeks part-time

---

## Files in Existing Codebase

```
x-account-tracker/
├── manifest.json          — Extension config, permissions
├── content.js             — Main content script (primary file to modify)
├── popup.html             — Extension popup shell
├── popup.js               — Popup logic and message handling
├── styles.css             — Main styles
├── styles-visibility-fix.css — Feed rendering fixes
├── icon16/48/128.png      — Extension icons
├── README.md              — Thorough setup documentation
├── SECURITY-template.md
├── CONTRIBUTING-template.md
├── CHANGELOG-template.md
└── TROUBLESHOOTING-AI-ISSUE.md
```

**Primary file to modify:** `content.js` — all passive observation logic goes here

**Primary file to redesign:** `popup.html` + `popup.js` — new category dashboard

**No changes needed:** `manifest.json`, styles, icons, message handler infrastructure

---

## Key Design Decisions Already Made

1. **Batch not immediate** — Ollama called on accumulated batches, never per-post in real time
2. **requestIdleCallback** — batch processing scheduled during browser idle time to avoid feed impact
3. **IntersectionObserver at 0.5 threshold** — post considered "viewed" when 50% visible
4. **Minimum batch of 20 signals** — avoids Ollama calls for trivial amounts of data
5. **Maximum wait of 5 minutes** — ensures processing happens even during slow browsing sessions
6. **Human-like unfollow pacing** — one unfollow every few minutes, not bulk simultaneous
7. **Hybrid category taxonomy** — fixed top-level categories, AI-inferred subcategories
8. **DOM reading not API** — no X API dependency, no OAuth

---

*Generated from brainstorming session — March 2026*
*Existing codebase: github.com/Mustard5/x-account-tracker*
*Previously developed with: Claude Code, Claude Opus 4.5*