# X Account Tracker - AI Not Working After First Use - TROUBLESHOOTING GUIDE

## The Problem

Your AI analysis worked the first few times, but now it doesn't run when you click "+tag". This is happening because of a logic issue in your code.

## Root Cause

In your original `content.js` file, line 668:

```javascript
if (aiConfig.features.autoSuggest && !accountData) {
```

The AI only runs when:
1. ✅ `autoSuggest` is enabled
2. ❌ The account has **NO** existing data (`!accountData`)

**Once you tag an account, it has `accountData`, so AI never runs again for that account!**

## Solution

I've provided a **FIXED** version of `content.js` that removes the `!accountData` condition. Now AI will run every time you click "+tag" as long as `autoSuggest` is enabled.

### Key Changes

**Before (broken):**
```javascript
if (aiConfig.features.autoSuggest && !accountData) {
  // AI only runs for NEW accounts
  aiSuggestion = await getCombinedAISuggestion(username);
}
```

**After (fixed):**
```javascript
if (aiConfig.enabled && aiConfig.features.autoSuggest) {
  // AI runs for ALL accounts, every time
  aiSuggestion = await getCombinedAISuggestion(username);
}
```

## Installation Instructions

1. **Backup your current extension:**
   - Make a copy of your current `content.js` file
   - Save it as `content.js.backup`

2. **Replace with fixed version:**
   - Download the `content-FIXED.js` file I provided
   - Rename it to `content.js`
   - Replace your existing `content.js` with this file

3. **Reload the extension:**
   - Go to `chrome://extensions` (or `brave://extensions`)
   - Click the reload button on your extension
   - Or disable and re-enable it

4. **Test it:**
   - Visit X/Twitter
   - Hover over any username (even previously tagged ones)
   - Click "+tag"
   - You should see "🤖 Analyzing posts..." if AI is enabled

## Verification Checklist

Before testing, make sure:

### 1. Ollama is Running
```bash
# Check if Ollama is running
systemctl status ollama

# If not running, start it
sudo systemctl start ollama

# Check if models are available
ollama list
```

### 2. AI Settings Are Enabled
Open the extension popup and verify:
- ✅ "Enable AI Analysis" is ON
- ✅ "Auto-Suggest Tags" is ON
- ✅ "Content Analysis" is ON (recommended)
- ✅ Ollama URL is correct: `http://localhost:11434`
- ✅ Model is selected (e.g., `llama3.2:3b`)

### 3. Test Connection
In the extension popup:
- Go to "AI Settings" tab
- Click "Test Connection"
- You should see "✓ Connected"
- You should see available models listed

### 4. Check Browser Console
Open Developer Tools (F12) and look for:
```
🤖 OLLAMA REQUEST
✅ OLLAMA RESPONSE
✓ AI analysis complete
```

If you see these messages, AI is working!

## Common Issues and Fixes

### Issue 1: AI Never Runs

**Symptoms:**
- No "🤖 Analyzing..." message
- No AI suggestions appear

**Fixes:**
1. Check if `aiConfig.enabled` is `true`
2. Check if `aiConfig.features.autoSuggest` is `true`
3. Open browser console and look for: `ℹ️ AI not running - enabled: false`

### Issue 2: Ollama Connection Failed

**Symptoms:**
- Error: "Cannot reach Ollama"
- Console shows: "❌ Ollama analysis failed"

**Fixes:**
1. Verify Ollama is running:
   ```bash
   curl http://localhost:11434/api/tags
   ```
2. Check CORS is enabled (see your README.md)
3. Verify the URL in settings is correct
4. Try restarting Ollama:
   ```bash
   sudo systemctl restart ollama
   ```

### Issue 3: CORS Errors

**Symptoms:**
- Console error: "CORS policy: No 'Access-Control-Allow-Origin'"

**Fixes:**
1. Edit Ollama service:
   ```bash
   sudo systemctl edit ollama
   ```

2. Add CORS environment variable:
   ```
   [Service]
   Environment="OLLAMA_ORIGINS=*"
   ```

3. Reload and restart:
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl restart ollama
   ```

4. Verify CORS header:
   ```bash
   curl -H "Origin: https://x.com" \
        -H "Access-Control-Request-Method: POST" \
        -H "Access-Control-Request-Headers: Content-Type" \
        -X OPTIONS \
        http://localhost:11434/api/tags -v
   ```
   Should return: `Access-Control-Allow-Origin: *`

### Issue 4: No Posts Found

**Symptoms:**
- AI runs but says "No posts found"
- Works on profile pages but not timeline

**Explanation:**
- The extension scrapes posts visible on the current page
- If you're not on that user's profile, it might not find their posts

**Fixes:**
- Visit the user's profile page before tagging
- Or tag them from their profile page

### Issue 5: Analysis Takes Forever

**Symptoms:**
- "Analyzing..." message stays for 30+ seconds
- Eventually times out

**Fixes:**
1. Use a smaller/faster model:
   - Change to `llama3.2:1b` (fastest)
   - Or `llama3.2:3b` (balanced)

2. Check system resources:
   ```bash
   htop
   ```
   Ollama needs RAM and CPU

3. Reduce post count (edit in code):
   ```javascript
   if (posts.length >= 5) break;  // Change 5 to 3
   ```

## Debugging Tips

### Enable Verbose Logging

The fixed version includes extensive console logging. Open browser console (F12) and look for:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🏷️  +Tag clicked for @username
   AI enabled: true
   autoSuggest: true
   contentAnalysis: true
   patternRecognition: false
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🤖 Getting AI suggestion for @username...
  Scraping recent posts...
  Found 5 posts
  Analyzing content...
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🤖 OLLAMA REQUEST
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Model: llama3.2:3b
URL: http://localhost:11434
...
✅ OLLAMA RESPONSE (2.34s)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✓ Content analysis: agree (85%)
✅ AI analysis complete in 2.3s
```

### Test AI Manually

You can test if Ollama is working:

```bash
curl http://localhost:11434/api/chat -d '{
  "model": "llama3.2:3b",
  "messages": [
    {"role": "user", "content": "Say hello"}
  ],
  "stream": false
}'
```

Should return JSON with a response.

### Check Extension Permissions

Verify in `manifest.json`:
```json
"host_permissions": [
  "https://twitter.com/*",
  "https://x.com/*",
  "http://localhost:11434/*"
]
```

## Comparison: Original vs Fixed

### Original Code (Broken)
```javascript
// AI only runs for NEW accounts
element.addEventListener('mouseenter', () => {
  if (!element.querySelector('.xat-quick-tag')) {
    const quickTag = document.createElement('button');
    quickTag.addEventListener('click', async (e) => {
      let aiSuggestion = null;
      if (aiConfig.features.autoSuggest && !accountData) {  // ❌ BUG HERE
        aiSuggestion = await getCombinedAISuggestion(username);
      }
      showTaggingMenu(username, accountData, quickTag, aiSuggestion);
    });
  }
});
```

### Fixed Code (Working)
```javascript
// AI runs for ALL accounts
element.addEventListener('mouseenter', () => {
  if (!element.querySelector('.xat-quick-tag')) {
    const quickTag = document.createElement('button');
    quickTag.addEventListener('click', async (e) => {
      let aiSuggestion = null;
      if (aiConfig.enabled && aiConfig.features.autoSuggest) {  // ✅ FIXED
        console.log('🤖 Running AI analysis...');
        aiSuggestion = await getCombinedAISuggestion(username);
      }
      showTaggingMenu(username, accountData, quickTag, aiSuggestion);
    });
  }
});
```

## Additional Improvements in Fixed Version

1. **Better Logging**
   - Shows exactly when AI runs and why it doesn't
   - Detailed timing information
   - Clear error messages

2. **Always Check AI Enabled**
   - Original only checked `autoSuggest`
   - Fixed version also checks `aiConfig.enabled`

3. **More Verbose Console Output**
   - See what features are enabled
   - See how many posts were found
   - See what sentiment was suggested

## Testing Plan

After installing the fixed version:

1. **Test with New Account:**
   - Find an account you haven't tagged
   - Hover over username
   - Click "+tag"
   - Should show AI analysis

2. **Test with Tagged Account:**
   - Find an account you already tagged
   - Hover over username
   - Click "+tag"
   - Should STILL show AI analysis (this is the fix!)

3. **Test Settings Toggle:**
   - Disable "Auto-Suggest Tags" in settings
   - Try tagging - should NOT run AI
   - Enable it again
   - Try tagging - should run AI

4. **Test Different Pages:**
   - Test on home timeline
   - Test on user profile
   - Test on search results
   - AI should work on all pages

## Performance Notes

Running AI on every +tag click will be slower than the original behavior. If this becomes an issue, you can:

1. **Cache AI Results:**
   The extension already has an `aiAnalysis` table in IndexedDB. You could modify the code to:
   - Check if AI analysis exists and is recent (< 1 day old)
   - If yes, use cached result
   - If no, run new analysis

2. **Add a "Refresh AI" Button:**
   Instead of always running AI, add a separate button:
   - "+Tag" opens menu without AI
   - "🤖 Get AI Suggestion" button runs analysis

3. **Use Keyboard Shortcut:**
   - Normal click: no AI
   - Shift+click: run AI

## Need More Help?

1. **Check Console Logs:**
   - Press F12 to open Developer Tools
   - Go to Console tab
   - Look for red errors or yellow warnings

2. **Export Debug Info:**
   ```javascript
   // Run this in browser console
   console.log('AI Config:', await new Promise(resolve => {
     chrome.storage.local.get(['aiConfig'], result => resolve(result.aiConfig));
   }));
   ```

3. **Test Ollama Directly:**
   ```bash
   # List models
   ollama list
   
   # Test a model
   ollama run llama3.2:3b "Hello, are you working?"
   
   # Check logs
   sudo journalctl -u ollama -f
   ```

4. **Check Extension Logs:**
   - Go to `chrome://extensions`
   - Click "Details" on your extension
   - Click "Inspect views: background page" (if available)
   - Check for errors

## Summary

The issue was simple: AI only ran for accounts that had no existing data. Once you tagged an account, the `!accountData` check prevented AI from running again.

The fix removes that restriction so AI runs whenever:
- ✅ AI is enabled in settings
- ✅ Auto-suggest feature is enabled
- ✅ You click the "+tag" button

Replace your `content.js` with the fixed version and AI will work consistently!

---

**Still having issues?** Make sure:
1. Ollama is running: `systemctl status ollama`
2. AI is enabled in extension settings
3. You've reloaded the extension
4. You're checking the browser console for errors
