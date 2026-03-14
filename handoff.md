# X Account Tracker — Handoff Document

*Last updated: March 2026. Reflects state after Sprint 4 completion and Opus code review.*

---

## Current State

Sprint 4 is **complete and verified**. Ollama categorization is confirmed working with `ministral-3:8b` producing correct JSON categorizations for 19 accounts in ~9 seconds. The extension is in active daily use.

### Completed Sprints

| Sprint | What Was Built | Key Commit |
|--------|---------------|------------|
| 1 | Passive feed observation — IntersectionObserver dwell tracking, feedObservations IndexedDB store | — |
| 2 | Ollama batch categorization — accountProfiles store, pendingCategorization queue, idle scheduling | — |
| 3 | Category dashboard — popup with Categories + AI Settings tabs, export/import v2 format, clear all data | — |
| 4 | Engagement scoring + staleness — combined score (dwell + interactions), isStale/staleReason, sort/filter controls | `acbcda0` |
| 4 (fix) | Race condition fixes from Opus code review — atomic transactions in saveAccountProfiles and computeEngagementScore, live obsCount for staleness | `814c530` |
| 4 (fix) | background.js logging + OLLAMA_ORIGINS wildcard — POST failures were silently swallowed; extension ID was hardcoded and went stale after reloads | `cd9ec75` |

---

## Architecture

### Files

| File | Role |
|------|------|
| `content.js` | Content script injected on x.com. DOM observation, dwell tracking, IndexedDB read/write, Ollama categorization scheduling, engagement score computation. Delegates Ollama HTTP calls to background.js via `chrome.runtime.sendMessage`. |
| `background.js` | Service worker. Handles `ollamaTest` and `ollamaAnalyze` messages — makes the actual fetch calls to localhost Ollama. Required because content scripts cannot make cross-origin requests directly to `localhost`. |
| `popup.js` | Extension popup logic. Fetches accountProfiles from content script via message, renders Categories tab (grouped by category, sorted/filtered per user selection), handles AI Settings save. |
| `popup.html` | Popup markup and CSS. Two-tab layout: Categories and AI Settings. |
| `manifest.json` | Manifest V3. Host permissions for x.com and twitter.com. |

### Data Flow

```
Browse X → IntersectionObserver → feedObservations (IndexedDB)
                                       ↓ (every 20 signals or 5min)
                               categorizeAccountBatch()
                                       ↓
                          background.js → Ollama /api/chat
                                       ↓
                               accountProfiles (IndexedDB)
                                       ↓ (requestIdleCallback)
                          computeEngagementScore() → updateEngagementScore()
                                       ↓
                               accountProfiles.engagementScore
                                       ↓
                           popup.js ← getAccountProfiles message
```

---

## Data Model

### `feedObservations` store
```javascript
{
  id: autoIncrement,
  username: "handle",
  postText: "tweet content...",
  dwellTime: 3420,        // ms, capped at 30000
  timestamp: 1710000000000
}
```

### `accountProfiles` store (Sprint 4 schema)
```javascript
{
  username: "handle",           // keyPath
  category: "Technology",       // one of 11 valid categories
  avgDwell: 3420,               // ms average across all observations
  signalCount: 15,              // live observation count (updated by updateEngagementScore)
  lastSeen: "2026-03-14T...",
  categorizedAt: "2026-03-14T...",
  likeCount: 2,                 // total likes recorded
  retweetCount: 0,              // total retweets recorded
  engagementScore: -0.3,        // null = not enough data (<3 obs)
  isStale: true,
  staleReason: "low_engagement" // "low_engagement" | "not_seen" | null
}
```

### `interactions` store
```javascript
{
  id: autoIncrement,
  username: "handle",
  type: "like",   // "like" | "retweet" | "unretweet"
  timestamp: "2026-03-14T..."
}
```

### `accounts` store
Legacy store from pre-Sprint 1 manual tagging flow. Still exported/imported but not actively written to.

---

## Engagement Scoring

**Formula:** `(dwellSum + interactionSum) / obsCount`

| Signal | Points |
|--------|--------|
| Dwell < 2s | -1 |
| Dwell 2–8s | 0 |
| Dwell > 8s | +1 |
| Like | +2 |
| Retweet | +3 |

**Edge cases:**
- `< 3` observations → `engagementScore = null` ("Not enough data")
- Interactions with 0 feed observations → `score = 1.5` (interaction-only = high engagement)

**Staleness triggers:**
- `score < -0.5` AND `signalCount >= 10` → `staleReason = "low_engagement"`
- `lastSeen` > 30 days ago → `staleReason = "not_seen"`

---

## Dev Environment

- **Browser:** Brave (verified). Extension loaded unpacked via `brave://extensions`.
- **Ollama:** Running as systemd service on `localhost:11434`
- **OLLAMA_ORIGINS:** Set to `*` in `/etc/systemd/system/ollama.service.d/override.conf` (see README). Do not hardcode extension IDs — unpacked extensions change ID on reload.
- **Model in use:** `ministral-3:8b` (~9s for 19-account batch). `llama3.2:3b` also installed as a lighter fallback.
- **Service worker console:** `brave://extensions` → X Account Tracker → "service worker" link. Background logs are prefixed `[XAT BG]`.
- **Content script console:** DevTools on an x.com tab. Content logs are prefixed `[XAT Feed]`, `[XAT Cat]`, `[XAT Score]`.

---

## Sprint 5 Plan

Surface the staleness data collected in Sprint 4 and act on it.

**Unfollow queue:**
- UI to select stale accounts for queued unfollow (checkboxes on stale accounts in the dashboard)
- Human-like pacing: one unfollow every 2–5 minutes (randomized)
- Confirmation step before execution begins
- Undo window: cancel queued unfollows before they fire
- Progress indicator in popup while queue is running

Keep Sprint 5 focused on unfollowing only. Do not add follow suggestions or other account management.

---

## Open Questions

1. **Score decay** — Should old observations count less than recent ones? Currently all observations are weighted equally regardless of age.
2. **Interaction weight tuning** — Is like=+2, RT=+3 the right ratio? Needs real data to evaluate.
3. **Threshold tuning** — The -0.5/+0.5 score boundaries and the -0.3 category-level badge threshold are initial guesses.
4. **`unretweet` handling** — Currently recorded in the interactions store but doesn't decrement `retweetCount`. Acceptable for now (you did engage even if you undid it).
5. **`testConnectionStatus` in popup** — Fetches Ollama directly from popup context rather than routing through background.js. Works today but inconsistent with the established architecture. Revisit if CSP changes cause issues.

---

## Known Gotchas

- **Extension ID stability:** Unpacked extensions get a new ID on reload. `OLLAMA_ORIGINS=*` avoids this. Do not revert to a hardcoded ID.
- **Transaction autocommit:** IndexedDB transactions autocommit when there are no pending requests and the JS event loop ticks. Do not `await` inside a transaction loop — complete all reads before entering the write transaction, or use a single readwrite transaction with synchronous request chaining (see `saveAccountProfiles` for the pattern).
- **Service worker lifetime:** Manifest V3 service workers can be terminated by the browser. Long Ollama inference (>30s) may get cut off. The 5-minute extension pop-open trick keeps it alive during testing but don't rely on it in production.
- **Batch threshold:** Categorization fires at 20 signals (`BATCH_THRESHOLD`). On a fast scroll session, this can fire multiple times quickly — each batch schedules score recomputations via `requestIdleCallback`, which may pile up. Not a correctness issue, just slightly redundant work.
