// X Account Tracker v2.1 - AI-Enhanced Content Script (Service Worker Integration)

const DB_NAME = 'XAccountTrackerDB';
const DB_VERSION = 7;
let db = null;

// AI Configuration (loaded from storage)
let aiConfig = {
  enabled: false,
  ollamaUrl: 'http://localhost:11434',
  model: 'llama3.2:3b',
  features: {
    contentAnalysis: false,
    patternRecognition: false,
    topicExtraction: false,
    autoSuggest: false
  }
};

// [All initDB, loadAIConfig, and database functions remain unchanged]

// Initialize IndexedDB with AI interaction tracking
async function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      
      // Main accounts store
      if (!db.objectStoreNames.contains('accounts')) {
        const store = db.createObjectStore('accounts', { keyPath: 'username' });
        store.createIndex('sentiment', 'sentiment', { unique: false });
        store.createIndex('lastUpdated', 'lastUpdated', { unique: false });
      }
      
      // Interaction tracking for AI pattern recognition
      if (!db.objectStoreNames.contains('interactions')) {
        const interactionStore = db.createObjectStore('interactions', { 
          keyPath: 'id', 
          autoIncrement: true 
        });
        interactionStore.createIndex('username', 'username', { unique: false });
        interactionStore.createIndex('type', 'type', { unique: false });
        interactionStore.createIndex('timestamp', 'timestamp', { unique: false });
      }
      
      // AI analysis cache
      if (!db.objectStoreNames.contains('aiAnalysis')) {
        const aiStore = db.createObjectStore('aiAnalysis', { 
          keyPath: 'id', 
          autoIncrement: true 
        });
        aiStore.createIndex('username', 'username', { unique: false });
        aiStore.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };
  });
}

// Load AI configuration from storage
async function loadAIConfig() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['aiConfig'], (result) => {
      if (result.aiConfig) {
        aiConfig = { ...aiConfig, ...result.aiConfig };
      }
      resolve(aiConfig);
    });
  });
}

// UPDATED: Test Ollama connection via service worker
async function testOllamaConnection() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({
      action: 'ollamaRequest',
      type: 'tags',
      data: { ollamaUrl: aiConfig.ollamaUrl }
    }, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ success: false, error: chrome.runtime.lastError.message });
        return;
      }
      resolve(response);
    });
  });
}

// UPDATED: Call Ollama API via service worker
async function analyzeWithOllama(prompt, systemPrompt = '') {
  if (!aiConfig.enabled) return null;

  const messages = [];
  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }
  messages.push({ role: 'user', content: prompt });

  return new Promise((resolve) => {
    chrome.runtime.sendMessage({
      action: 'ollamaRequest',
      type: 'chat',
      data: {
        ollamaUrl: aiConfig.ollamaUrl,
        model: aiConfig.model,
        messages: messages,
        options: {
          temperature: 0.3,
          num_predict: 200
        }
      }
    }, (response) => {
      if (chrome.runtime.lastError || !response.success) {
        console.error('❌ Ollama analysis failed:', chrome.runtime.lastError?.message || response.error);
        resolve(null);
        return;
      }
      resolve(response.data.message.content);
    });
  });
}

// Extract post text from tweet elements
function extractPostText(tweetElement) {
  const textElement = tweetElement.querySelector('[data-testid="tweetText"]');
  return textElement ? textElement.textContent.trim() : '';
}

// Scrape recent posts from an account visible on page
async function scrapeRecentPosts(username) {
  const posts = [];
  const articles = document.querySelectorAll('article');
  
  for (const article of articles) {
    const userElement = article.querySelector('[data-testid="User-Name"]');
    if (!userElement) continue;
    
    const articleUsername = extractUsername(userElement);
    if (articleUsername === username) {
      const postText = extractPostText(article);
      if (postText && postText.length > 10) {
        posts.push(postText);
        if (posts.length >= 5) break;
      }
    }
  }
  
  return posts;
}

// Analyze post content for sentiment and topics
async function analyzePostContent(username, posts) {
  if (!aiConfig.features.contentAnalysis || posts.length === 0) return null;

  console.log(`X Account Tracker: Analyzing ${posts.length} posts from @${username}...`);

  const recentPosts = posts.slice(0, 5).join('\n\n---\n\n');
  
  const systemPrompt = `You are analyzing social media posts to help a user track whether they agree or disagree with accounts. Focus on SPECIFIC VIEWPOINTS and POSITIONS with concrete examples.

Respond ONLY with JSON:
{
  "overallSentiment": "agree|disagree|mixed|expert|neutral",
  "topics": ["topic1", "topic2", "topic3"],
  "confidence": 0.0-1.0,
  "reasoning": "DETAILED: specific positions they take with examples from posts",
  "expertise": "specific subjects they show knowledge about",
  "perspectives": "ideological stance with specific examples",
  "keyQuotes": ["memorable quote 1", "quote 2"]
}`;

  const prompt = `Analyze these recent posts from @${username}:

${recentPosts}

Provide SPECIFIC analysis:
- What exact viewpoints/positions do they express? Give examples.
- What topics do they discuss? List specific subjects.
- What ideological leanings are evident? Be concrete.
- Are they presenting facts, opinions, or advocacy? How?
- What memorable quotes capture their stance?

Be detailed and specific. Use examples from the posts. Don't be vague. Respond with JSON only.`;

  const result = await analyzeWithOllama(prompt, systemPrompt);
  
  if (!result) {
    console.log(`X Account Tracker: Content analysis failed for @${username}`);
    return null;
  }

  try {
    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      console.log(`X Account Tracker: Content analysis complete for @${username} - Found topics: ${parsed.topics.join(', ')}`);
      return parsed;
    }
  } catch (error) {
    console.error('Failed to parse AI content analysis:', error);
  }

  return null;
}

// Analyze user's interaction patterns with an account
async function analyzeInteractionPatterns(username) {
  if (!aiConfig.features.patternRecognition) return null;

  const interactions = await getInteractions(username);
  
  if (interactions.length < 3) {
    console.log(`X Account Tracker: Not enough data for @${username} (${interactions.length} interactions, need 3+)`);
    return null;
  }

  console.log(`X Account Tracker: Analyzing ${interactions.length} interactions with @${username}...`);

  const interactionSummary = interactions
    .map(i => `${i.type} on ${new Date(i.timestamp).toLocaleDateString()}`)
    .join(', ');

  const systemPrompt = `You are a pattern analyzer. Based on user interactions, suggest sentiment.

Respond ONLY with JSON:
{
  "suggestedSentiment": "agree|disagree|mixed|expert|biased|neutral",
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation"
}`;

  const prompt = `User's interactions with @${username}: ${interactionSummary}

What sentiment does this suggest? Respond with JSON only.`;

  const result = await analyzeWithOllama(prompt, systemPrompt);
  
  if (!result) {
    console.log(`X Account Tracker: AI analysis failed for @${username}`);
    return null;
  }

  try {
    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      console.log(`X Account Tracker: AI suggests "${parsed.suggestedSentiment}" for @${username} (${Math.round(parsed.confidence * 100)}% confident)`);
      return parsed;
    }
  } catch (error) {
    console.error('Failed to parse AI response:', error);
  }

  return null;
}

// Combine interaction patterns and content analysis
async function getCombinedAISuggestion(username) {
  let patternAnalysis = null;
  let contentAnalysis = null;

  // Get interaction pattern analysis
  if (aiConfig.features.patternRecognition) {
    patternAnalysis = await analyzeInteractionPatterns(username);
  }

  // Get content analysis if enabled
  if (aiConfig.features.contentAnalysis) {
    const posts = await scrapeRecentPosts(username);
    if (posts.length > 0) {
      contentAnalysis = await analyzePostContent(username, posts);
    }
  }

  // Combine both analyses
  if (contentAnalysis && patternAnalysis) {
    const patternsAgree = contentAnalysis.overallSentiment === patternAnalysis.suggestedSentiment;
    
    return {
      suggestedSentiment: contentAnalysis.overallSentiment,
      confidence: patternsAgree 
        ? Math.min(0.95, contentAnalysis.confidence * 1.2)
        : (contentAnalysis.confidence + patternAnalysis.confidence) / 2,
      reasoning: `Content shows: ${contentAnalysis.reasoning}. Your interactions ${patternsAgree ? 'confirm' : 'show'} ${patternAnalysis.suggestedSentiment} sentiment.`,
      topics: contentAnalysis.topics,
      expertise: contentAnalysis.expertise,
      perspectives: contentAnalysis.perspectives,
      keyQuotes: contentAnalysis.keyQuotes,
      sources: ['content', 'patterns']
    };
  } else if (contentAnalysis) {
    return {
      suggestedSentiment: contentAnalysis.overallSentiment,
      confidence: contentAnalysis.confidence,
      reasoning: contentAnalysis.reasoning,
      topics: contentAnalysis.topics,
      expertise: contentAnalysis.expertise,
      perspectives: contentAnalysis.perspectives,
      keyQuotes: contentAnalysis.keyQuotes,
      sources: ['content']
    };
  } else if (patternAnalysis) {
    return {
      ...patternAnalysis,
      sources: ['patterns']
    };
  }

  return null;
}

// Track user interactions for pattern recognition
async function recordInteraction(username, type) {
  if (!aiConfig.features.patternRecognition) return;

  const transaction = db.transaction(['interactions'], 'readwrite');
  const store = transaction.objectStore('interactions');
  
  await store.add({
    username: username,
    type: type,
    timestamp: new Date().toISOString()
  });

  console.log(`X Account Tracker: Recorded ${type} interaction with @${username}`);
}

// Get interactions for a user
async function getInteractions(username) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['interactions'], 'readonly');
    const store = transaction.objectStore('interactions');
    const index = store.index('username');
    const request = index.getAll(username);
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Save account data
async function saveAccount(username, data) {
  const transaction = db.transaction(['accounts'], 'readwrite');
  const store = transaction.objectStore('accounts');
  
  const accountData = {
    username: username,
    sentiment: data.sentiment || 'neutral',
    topics: data.topics || {},
    notes: data.notes || '',
    interactionCount: (data.interactionCount || 0) + 1,
    lastUpdated: new Date().toISOString(),
    aiSuggested: data.aiSuggested || false,
    aiAnalysis: data.aiAnalysis || null,
    ...data
  };
  
  await store.put(accountData);
  return accountData;
}

// Get account data
async function getAccount(username) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['accounts'], 'readonly');
    const store = transaction.objectStore('accounts');
    const request = store.get(username);
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Get all accounts
async function getAllAccounts() {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['accounts'], 'readonly');
    const store = transaction.objectStore('accounts');
    const request = store.getAll();
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Delete account data
async function deleteAccount(username) {
  const transaction = db.transaction(['accounts'], 'readwrite');
  const store = transaction.objectStore('accounts');
  await store.delete(username);
}

// Extract username from various X/Twitter elements
function extractUsername(element) {
  const usernameElement = element.querySelector('[data-testid="User-Name"] a[href^="/"]') ||
                          element.querySelector('a[role="link"][href^="/"]') ||
                          element.closest('article')?.querySelector('a[href^="/"]');
  
  if (usernameElement) {
    const href = usernameElement.getAttribute('href');
    const match = href.match(/^\/([^\/\?]+)/);
    if (match && match[1] !== 'i' && match[1] !== 'home' && match[1] !== 'explore') {
      return match[1];
    }
  }
  
  return null;
}

// Create badge element with AI indicator
function createBadge(sentiment, topics, aiSuggested = false) {
  const badge = document.createElement('div');
  badge.className = 'xat-badge';
  badge.setAttribute('data-sentiment', sentiment);
  
  const icon = getSentimentIcon(sentiment);
  const color = getSentimentColor(sentiment);
  
  let badgeHTML = `<span class="xat-badge-icon" style="color: ${color}">${icon}</span>`;
  
  if (aiSuggested) {
    badgeHTML += '<span class="xat-ai-indicator" title="AI Suggested">🤖</span>';
  }
  
  badge.innerHTML = badgeHTML;
  
  if (topics && Object.keys(topics).length > 0) {
    badge.setAttribute('data-has-topics', 'true');
  }
  
  return badge;
}

// Get sentiment icon
function getSentimentIcon(sentiment) {
  const icons = {
    'agree': '✓',
    'disagree': '✗',
    'mixed': '~',
    'expert': '★',
    'biased': '⚠',
    'neutral': '•'
  };
  return icons[sentiment] || '•';
}

// Get sentiment color
function getSentimentColor(sentiment) {
  const colors = {
    'agree': '#10b981',
    'disagree': '#ef4444',
    'mixed': '#f59e0b',
    'expert': '#8b5cf6',
    'biased': '#f97316',
    'neutral': '#6b7280'
  };
  return colors[sentiment] || '#6b7280';
}

// Create tagging menu with AI suggestions
function createTaggingMenu(username, existingData, aiSuggestion = null) {
  const menu = document.createElement('div');
  menu.className = 'xat-menu';
  
  menu.addEventListener('click', (e) => {
    e.stopPropagation();
  });
  
  let aiSuggestionHTML = '';
  
  if (aiSuggestion && aiConfig.features.autoSuggest) {
    const confidencePercent = Math.round(aiSuggestion.confidence * 100);
    const confidenceColor = confidencePercent >= 75 ? '#10b981' : 
                           confidencePercent >= 50 ? '#f59e0b' : '#ef4444';
    
    const sources = aiSuggestion.sources || ['patterns'];
    const sourceText = sources.includes('content') && sources.includes('patterns')
      ? 'post content and your interactions'
      : sources.includes('content')
      ? 'post content analysis'
      : 'your interaction history';
    
    let detailedInfo = '';
    
    if (aiSuggestion.topics && aiSuggestion.topics.length > 0) {
      detailedInfo += `<div class="xat-ai-detail"><strong>Topics:</strong> ${aiSuggestion.topics.join(', ')}</div>`;
    }
    
    if (aiSuggestion.expertise) {
      detailedInfo += `<div class="xat-ai-detail"><strong>Expertise:</strong> ${aiSuggestion.expertise}</div>`;
    }
    
    if (aiSuggestion.perspectives) {
      detailedInfo += `<div class="xat-ai-detail"><strong>Perspectives:</strong> ${aiSuggestion.perspectives}</div>`;
    }
    
    if (aiSuggestion.keyQuotes && aiSuggestion.keyQuotes.length > 0) {
      detailedInfo += `<div class="xat-ai-detail"><strong>Key Quotes:</strong><ul>`;
      aiSuggestion.keyQuotes.forEach(quote => {
        detailedInfo += `<li>"${quote}"</li>`;
      });
      detailedInfo += `</ul></div>`;
    }
    
    aiSuggestionHTML = `
      <div class="xat-ai-suggestion">
        <div class="xat-ai-header">
          <span class="xat-ai-icon">🤖</span>
          <span class="xat-ai-title">AI Suggestion</span>
          <span class="xat-ai-confidence" style="background-color: ${confidenceColor}">${confidencePercent}%</span>
        </div>
        <div class="xat-ai-content">
          <div class="xat-ai-sentiment">
            Suggested: <strong>${aiSuggestion.suggestedSentiment}</strong>
          </div>
          <div class="xat-ai-source">Based on ${sourceText}</div>
          ${detailedInfo}
          <div class="xat-ai-reasoning">${aiSuggestion.reasoning}</div>
        </div>
      </div>
    `;
  } else if (aiConfig.enabled && aiConfig.features.autoSuggest) {
    aiSuggestionHTML = `
      <div class="xat-ai-suggestion xat-ai-loading">
        <div class="xat-ai-header">
          <span class="xat-ai-icon">🤖</span>
          <span class="xat-ai-title">AI Analysis</span>
        </div>
        <div class="xat-ai-content">
          Not enough interaction history yet. Tag this account and interact with their posts to enable AI suggestions.
        </div>
      </div>
    `;
  }
  
  const currentSentiment = existingData?.sentiment || 'neutral';
  const currentNotes = existingData?.notes || '';
  
  menu.innerHTML = `
    <div class="xat-menu-header">
      <span>Tag @${username}</span>
      <button class="xat-close-btn">×</button>
    </div>
    
    ${aiSuggestionHTML}
    
    <div class="xat-menu-section">
      <label>Sentiment:</label>
      <div class="xat-sentiment-buttons">
        <button class="xat-sentiment-btn" data-sentiment="agree" ${currentSentiment === 'agree' ? 'data-selected="true"' : ''}>
          <span class="xat-sentiment-icon">✓</span> Agree
        </button>
        <button class="xat-sentiment-btn" data-sentiment="disagree" ${currentSentiment === 'disagree' ? 'data-selected="true"' : ''}>
          <span class="xat-sentiment-icon">✗</span> Disagree
        </button>
        <button class="xat-sentiment-btn" data-sentiment="mixed" ${currentSentiment === 'mixed' ? 'data-selected="true"' : ''}>
          <span class="xat-sentiment-icon">~</span> Mixed
        </button>
        <button class="xat-sentiment-btn" data-sentiment="expert" ${currentSentiment === 'expert' ? 'data-selected="true"' : ''}>
          <span class="xat-sentiment-icon">★</span> Expert
        </button>
        <button class="xat-sentiment-btn" data-sentiment="biased" ${currentSentiment === 'biased' ? 'data-selected="true"' : ''}>
          <span class="xat-sentiment-icon">⚠</span> Biased
        </button>
        <button class="xat-sentiment-btn" data-sentiment="neutral" ${currentSentiment === 'neutral' ? 'data-selected="true"' : ''}>
          <span class="xat-sentiment-icon">•</span> Neutral
        </button>
      </div>
    </div>
    
    <div class="xat-menu-section">
      <label>Notes:</label>
      <textarea class="xat-notes-input" placeholder="Add notes about this account...">${currentNotes}</textarea>
    </div>
    
    <div class="xat-menu-actions">
      <button class="xat-save-btn">Save</button>
      ${existingData ? '<button class="xat-delete-btn">Delete</button>' : ''}
    </div>
  `;
  
  // Event listeners
  const closeBtn = menu.querySelector('.xat-close-btn');
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    menu.remove();
  });
  
  const sentimentBtns = menu.querySelectorAll('.xat-sentiment-btn');
  sentimentBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      sentimentBtns.forEach(b => b.removeAttribute('data-selected'));
      btn.setAttribute('data-selected', 'true');
    });
  });
  
  const saveBtn = menu.querySelector('.xat-save-btn');
  saveBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    
    const selectedBtn = menu.querySelector('.xat-sentiment-btn[data-selected="true"]');
    const sentiment = selectedBtn?.getAttribute('data-sentiment') || 'neutral';
    const notes = menu.querySelector('.xat-notes-input').value;
    
    const accountData = {
      sentiment: sentiment,
      notes: notes,
      aiSuggested: aiSuggestion ? true : false,
      aiAnalysis: aiSuggestion || null
    };
    
    await saveAccount(username, accountData);
    await recordInteraction(username, 'tagged');
    
    menu.remove();
    updateBadges();
  });
  
  const deleteBtn = menu.querySelector('.xat-delete-btn');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      
      if (confirm(`Remove tag for @${username}?`)) {
        await deleteAccount(username);
        menu.remove();
        updateBadges();
      }
    });
  }
  
  return menu;
}

// Add badges to user profile elements
async function addBadges() {
  const userElements = document.querySelectorAll('[data-testid="User-Name"]');
  
  for (const userElement of userElements) {
    if (userElement.querySelector('.xat-badge')) continue;
    
    const username = extractUsername(userElement);
    if (!username) continue;
    
    const accountData = await getAccount(username);
    if (!accountData) continue;
    
    const badge = createBadge(
      accountData.sentiment,
      accountData.topics,
      accountData.aiSuggested
    );
    
    const container = userElement.querySelector('[dir="ltr"]') || userElement;
    container.appendChild(badge);
  }
}

// Add tagging buttons
async function addTagButtons() {
  const userElements = document.querySelectorAll('[data-testid="User-Name"]');
  
  for (const userElement of userElements) {
    if (userElement.querySelector('.xat-tag-btn')) continue;
    
    const username = extractUsername(userElement);
    if (!username) continue;
    
    const tagBtn = document.createElement('button');
    tagBtn.className = 'xat-tag-btn';
    tagBtn.textContent = '+ Tag';
    
    tagBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      e.preventDefault();
      
      document.querySelectorAll('.xat-menu').forEach(m => m.remove());
      
      const existingData = await getAccount(username);
      let aiSuggestion = null;
      
      if (aiConfig.enabled && (aiConfig.features.contentAnalysis || aiConfig.features.patternRecognition)) {
        aiSuggestion = await getCombinedAISuggestion(username);
      }
      
      const menu = createTaggingMenu(username, existingData, aiSuggestion);
      
      const rect = tagBtn.getBoundingClientRect();
      menu.style.position = 'fixed';
      menu.style.top = `${rect.bottom + 5}px`;
      menu.style.left = `${rect.left}px`;
      menu.style.zIndex = '10000';
      
      document.body.appendChild(menu);
    });
    
    const container = userElement.querySelector('[dir="ltr"]') || userElement;
    container.appendChild(tagBtn);
  }
}

// Update all badges
async function updateBadges() {
  document.querySelectorAll('.xat-badge').forEach(b => b.remove());
  document.querySelectorAll('.xat-tag-btn').forEach(b => b.remove());
  
  await addBadges();
  await addTagButtons();
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getAllAccounts') {
    getAllAccounts().then(accounts => {
      sendResponse({ accounts: accounts });
    });
    return true;
  }
  
  if (request.action === 'updateBadges') {
    updateBadges();
    sendResponse({ success: true });
    return true;
  }
});

// Initialize
(async function init() {
  console.log('X Account Tracker: Initializing...');
  
  await initDB();
  await loadAIConfig();
  
  await updateBadges();
  
  const observer = new MutationObserver(() => {
    updateBadges();
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
  
  console.log('X Account Tracker: Ready!');
})();
