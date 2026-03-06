# Sprint 4: Engagement Scoring & Staleness Detection

*Captured while ideas are fresh — March 2026*

---

## Problem Recap

Current dwell-time-only approach is too simplistic:
- Thresholds too tight (1s/4s doesn't distinguish "read" from "engaged")
- Doesn't account for explicit interaction signals (likes, retweets)
- AFK scenarios still skew data despite 30s cap
- No combined scoring to surface truly stale follows

---

## Revised Dwell Thresholds

| Dwell Time | Behavior | Label |
|------------|----------|-------|
| < 2 seconds | Scrolled past without reading | Low |
| 2-8 seconds | Read the tweet | Medium |
| > 8 seconds | Clicked in, watching video, reading replies | High |

These replace the current 1s/4s thresholds in popup.js.

---

## Interaction Signals

The `interactions` store already tracks likes/retweets via `observeInteractions()`. This data should factor into engagement scoring.

| Interaction | Signal Strength | Meaning |
|-------------|-----------------|---------|
| Like | Strong positive | User endorsed content |
| Retweet | Strongest positive | User amplified content |
| Quote tweet | Strong positive | User engaged critically |

Interactions are unambiguous — if you liked it, you engaged with it regardless of dwell time.

---

## Combined Engagement Score

Rather than separate dwell/interaction indicators, compute a single **engagement score** per account.

### Scoring Model (draft)

```
Base score starts at 0

Per observation:
  dwell < 2s:    -1 point
  dwell 2-8s:     0 points  
  dwell > 8s:    +1 point

Per interaction:
  like:          +2 points
  retweet:       +3 points

Final score = sum of all points / number of observations
```

### Score Interpretation

| Score Range | Engagement Level | Dashboard Display |
|-------------|------------------|-------------------|
| < -0.5 | Low | 🔴 You scroll past this account |
| -0.5 to +0.5 | Medium | 🟡 You occasionally engage |
| > +0.5 | High | 🟢 You actively engage |

### Edge Cases

- **New accounts** (< 3 observations): Show "Not enough data" instead of score
- **Interaction-only** (liked but never scrolled past in feed): High engagement, even with 0 dwell observations
- **Dwell-only** (scrolled past many times, never liked): Use dwell score alone

---

## Staleness Detection

An account is **stale** when:
1. **Time-based**: Last seen > 30 days ago (they're not appearing in your feed)
2. **Engagement-based**: Score < -0.5 over 10+ observations (you consistently scroll past)
3. **Category-based**: Entire category has low average engagement (your interests shifted)

### Staleness Flags

| Flag | Trigger | Dashboard Display |
|------|---------|-------------------|
| ⚠️ Stale | Score < -0.5 AND observations > 10 | Individual account warning |
| ⚠️ Cold Category | Category avg score < -0.3 | Category-level warning |
| 👻 Ghost | Last seen > 30 days | Account not appearing in feed |

---

## Data Model Changes

### accountProfiles store (update)

Add new fields:
```javascript
{
  username: "example",
  category: "Politics",
  avgDwell: 3420,           // existing
  signalCount: 15,          // existing
  lastSeen: "2026-03-06",   // existing
  categorizedAt: "...",     // existing
  
  // New fields for Sprint 4:
  engagementScore: -0.3,    // computed combined score
  likeCount: 2,             // total likes for this account
  retweetCount: 0,          // total retweets for this account
  isStale: true,            // computed flag
  staleReason: "low_engagement"  // "low_engagement" | "not_seen" | null
}
```

### Recomputation

Engagement score should recompute:
- After each categorization batch (new dwell data)
- After each interaction recorded (like/retweet)

Use `requestIdleCallback` to avoid blocking.

---

## Dashboard Changes (popup.html/js)

### Category Row
```
▶ Politics           23 accounts   ⚠️ low engagement (avg: -0.4)
▶ AI/ML              12 accounts   🟢 high engagement (avg: +0.8)
```

### Expanded Account Row
```
@someuser    3d ago    🔴 -0.6    2 likes    ⚠️ stale
@otheruser   1d ago    🟢 +1.2    8 likes    
```

Show:
- Last seen (relative time)
- Engagement score with color indicator
- Like count (compact)
- Stale warning if applicable

### Filter/Sort Options

Add to dashboard header:
- **Sort by**: Last seen | Engagement score | Like count
- **Filter**: Show stale only | Hide stale

---

## Unfollow Queue (Future Sprint 5)

Sprint 4 surfaces the data. Sprint 5 acts on it:
- Select stale accounts for unfollow
- Queue with human-like pacing (one every 2-5 minutes)
- Confirmation step before execution
- Undo window (cancel queued unfollows)

Keep Sprint 4 focused on **scoring and display**. Don't implement unfollow yet.

---

## Implementation Sequence

### 4.1: Update dwell thresholds
- Change 1s/4s to 2s/8s in popup.js
- Quick win, immediate improvement

### 4.2: Link interactions to accountProfiles
- When recording interaction, update accountProfiles with like/retweet counts
- Join on username

### 4.3: Compute engagement score
- Add computeEngagementScore(username) function
- Read from feedObservations + interactions
- Write engagementScore to accountProfiles

### 4.4: Update dashboard display
- Show engagement score instead of (or alongside) dwell indicator
- Add like count column
- Add staleness warnings

### 4.5: Add staleness flags
- Compute isStale and staleReason on each profile update
- Surface in dashboard with filter option

### 4.6: Add sort/filter controls
- Dropdown for sort order
- Toggle for "show stale only"

---

## Open Questions

1. **Score decay over time?** Should old observations count less than recent ones?
2. **Category-level scoring**: Average of account scores, or separate category engagement tracking?
3. **Interaction weight tuning**: Is like=+2, RT=+3 the right ratio?
4. **Threshold tuning**: The -0.5/+0.5 boundaries are guesses — may need adjustment after testing

---

## Files to Modify

| File | Changes |
|------|---------|
| content.js | Add engagementScore computation, update accountProfiles schema, link interactions to profiles |
| popup.js | New thresholds, score display, staleness indicators, sort/filter controls |
| popup.html | Updated dashboard layout, filter UI |

---

*Ready for implementation when time permits.*
