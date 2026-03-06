// X Account Tracker v2.0 - AI-Enhanced Content Script (FIXED - AI ALWAYS RUNS)

const DB_NAME = 'XAccountTrackerDB';
const DB_VERSION = 8;
let db = null;

// Sprint 1: Passive feed observation
const signalQueue = [];
const BATCH_THRESHOLD = 20;
const BATCH_FLUSH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const dwellTracker = new WeakMap(); // article element -> entry timestamp

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

// Post scraping cache (username -> {posts, timestamp})
const postsCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Input Validation Functions
const VALID_SENTIMENTS = ['agree', 'disagree', 'mixed', 'expert', 'neutral', 'biased'];
const MAX_USERNAME_LENGTH = 15; // Twitter username max length
const MAX_TOPIC_LENGTH = 50;
const MAX_NOTES_LENGTH = 1000;

function sanitizeUsername(username) {
  if (typeof username !== 'string') return null;
  // Twitter usernames: alphanumeric and underscore only, 1-15 chars
  const sanitized = username.replace(/[^a-zA-Z0-9_]/g, '').substring(0, MAX_USERNAME_LENGTH);
  return sanitized.length > 0 ? sanitized : null;
}

function validateSentiment(sentiment) {
  return VALID_SENTIMENTS.includes(sentiment);
}

function sanitizeTopic(topic) {
  if (typeof topic !== 'string') return null;
  // Remove any HTML/script tags and trim
  const sanitized = topic.replace(/<[^>]*>/g, '').trim().substring(0, MAX_TOPIC_LENGTH);
  return sanitized.length > 0 ? sanitized : null;
}

function sanitizeNotes(notes) {
  if (typeof notes !== 'string') return '';
  // Remove any HTML/script tags and trim
  return notes.replace(/<[^>]*>/g, '').trim().substring(0, MAX_NOTES_LENGTH);
}

function validateTopics(topics) {
  if (typeof topics !== 'object' || topics === null || Array.isArray(topics)) {
    return {};
  }

  const validTopics = {};
  for (const [topic, sentiment] of Object.entries(topics)) {
    const sanitizedTopic = sanitizeTopic(topic);
    if (sanitizedTopic && validateSentiment(sentiment)) {
      validTopics[sanitizedTopic] = sentiment;
    }
  }
  return validTopics;
}

function validateAccountData(data) {
  if (typeof data !== 'object' || data === null) {
    throw new Error('Invalid account data: must be an object');
  }

  if (!data.username) {
    throw new Error('Invalid account data: missing username');
  }

  const sanitizedUsername = sanitizeUsername(data.username);
  if (!sanitizedUsername) {
    throw new Error(`Invalid username: ${data.username}`);
  }

  if (!validateSentiment(data.sentiment)) {
    throw new Error(`Invalid sentiment: ${data.sentiment}`);
  }

  return {
    username: sanitizedUsername,
    sentiment: data.sentiment,
    topics: validateTopics(data.topics || {}),
    notes: sanitizeNotes(data.notes || ''),
    lastUpdated: data.lastUpdated || new Date().toISOString(),
    interactionCount: typeof data.interactionCount === 'number' ? data.interactionCount : 0,
    aiSuggested: Boolean(data.aiSuggested),
    aiAnalysis: data.aiAnalysis || null
  };
}

function validateImportData(data) {
  if (!Array.isArray(data)) {
    throw new Error('Import data must be an array');
  }

  const validatedAccounts = [];
  const errors = [];

  for (let i = 0; i < data.length; i++) {
    try {
      const validated = validateAccountData(data[i]);
      validatedAccounts.push(validated);
    } catch (error) {
      errors.push(`Account ${i + 1}: ${error.message}`);
    }
  }

  return { accounts: validatedAccounts, errors };
}

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
      
      // New: Interaction tracking for AI pattern recognition
      if (!db.objectStoreNames.contains('interactions')) {
        const interactionStore = db.createObjectStore('interactions', { keyPath: 'id', autoIncrement: true });
        interactionStore.createIndex('username', 'username', { unique: false });
        interactionStore.createIndex('type', 'type', { unique: false });
        interactionStore.createIndex('timestamp', 'timestamp', { unique: false });
      }
      
      // New: AI analysis cache
      if (!db.objectStoreNames.contains('aiAnalysis')) {
        const aiStore = db.createObjectStore('aiAnalysis', { keyPath: 'id', autoIncrement: true });
        aiStore.createIndex('username', 'username', { unique: false });
        aiStore.createIndex('timestamp', 'timestamp', { unique: false });
      }

      // Sprint 1: Passive feed observations
      if (!db.objectStoreNames.contains('feedObservations')) {
        const obsStore = db.createObjectStore('feedObservations', { keyPath: 'id', autoIncrement: true });
        obsStore.createIndex('username', 'username', { unique: false });
        obsStore.createIndex('timestamp', 'timestamp', { unique: false });
        obsStore.createIndex('category', 'category', { unique: false });
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

// Test Ollama connection
async function testOllamaConnection() {
  try {
    const response = await fetch(`${aiConfig.ollamaUrl}/api/tags`);
    if (response.ok) {
      const data = await response.json();
      return { success: true, models: data.models };
    }
    return { success: false, error: 'Ollama not responding' };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Call Ollama API for text analysis
async function analyzeWithOllama(prompt, systemPrompt = '') {
  if (!aiConfig.enabled) {
    console.log('❌ AI disabled in settings');
    return null;
  }
  
  try {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🤖 OLLAMA REQUEST');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Model:', aiConfig.model);
    console.log('URL:', aiConfig.ollamaUrl);
    if (systemPrompt) {
      console.log('System Prompt:', systemPrompt);
    }
    console.log('User Prompt:', prompt);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const messages = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });
    
    const startTime = Date.now();
    const response = await fetch(`${aiConfig.ollamaUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: aiConfig.model,
        messages: messages,
        stream: false,
        options: {
          temperature: 0.3,
          num_predict: 200  // Increased for more detailed responses
        }
      })
    });
    
    if (!response.ok) throw new Error('Ollama request failed');
    
    const data = await response.json();
    const elapsed = Date.now() - startTime;
    
    console.log('✅ OLLAMA RESPONSE (' + (elapsed/1000).toFixed(2) + 's)');
    console.log('Raw Response:', data.message.content);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    return data.message.content;
  } catch (error) {
    console.error('❌ Ollama analysis failed:', error);
    return null;
  }
}

// Extract post text from tweet elements
function extractPostText(tweetElement) {
  const textElement = tweetElement.querySelector('[data-testid="tweetText"]');
  return textElement ? textElement.textContent.trim() : '';
}

// Scrape recent posts from an account visible on page (with caching)
async function scrapeRecentPosts(username) {
  try {
    // Check cache first
    const cached = postsCache.get(username);
    const now = Date.now();

    if (cached && (now - cached.timestamp) < CACHE_TTL_MS) {
      console.log(`Using cached posts for @${username} (age: ${Math.round((now - cached.timestamp) / 1000)}s)`);
      return cached.posts;
    }

    // Cache miss or expired - scrape fresh posts
    const posts = [];

    // Find all tweets on the page
    const articles = document.querySelectorAll('article');

    for (const article of articles) {
      // Check if this tweet is from the target username
      const userElement = article.querySelector('[data-testid="User-Name"]');
      if (!userElement) continue;

      const articleUsername = extractUsername(userElement);
      if (articleUsername === username) {
        const postText = extractPostText(article);
        if (postText && postText.length > 10) { // Ignore very short posts
          posts.push(postText);

          // Limit to 5 most recent posts to keep analysis fast
          if (posts.length >= 5) break;
        }
      }
    }

    // Update cache
    if (posts.length > 0) {
      postsCache.set(username, {
        posts,
        timestamp: now
      });
      console.log(`Cached ${posts.length} posts for @${username}`);
    }

    return posts;
  } catch (error) {
    console.error(`Failed to scrape posts for @${username}:`, error);
    return []; // Return empty array on error
  }
}

// Analyze post content for sentiment and topics
async function analyzePostContent(username, posts) {
  if (!aiConfig.features.contentAnalysis || posts.length === 0) return null;
  
  console.log(`X Account Tracker: Analyzing ${posts.length} posts from @${username}...`);
  
  // Limit total text to avoid overwhelming the model
  const recentPosts = posts.slice(0, 5).join('\n\n---\n\n');
  
  const systemPrompt = `You are analyzing social media posts to help a user track whether they agree or disagree with accounts. Focus on SPECIFIC VIEWPOINTS and POSITIONS with concrete examples. Respond ONLY with JSON:
{
  "overallSentiment": "agree|disagree|mixed|expert|neutral",
  "topics": ["topic1", "topic2", "topic3"],
  "confidence": 0.0-1.0,
  "reasoning": "DETAILED: specific positions they take with examples from posts",
  "expertise": "specific subjects they show knowledge about",
  "perspectives": "ideological stance with specific examples (e.g., 'pro-market, skeptical of regulation - argues for free trade', 'progressive environmental views - advocates carbon tax')",
  "keyQuotes": ["memorable/representative quote 1", "quote 2"]
}`;
  
  const prompt = `Analyze these recent posts from @${username}:

${recentPosts}

Provide SPECIFIC analysis:
- What exact viewpoints/positions do they express? Give examples.
- What topics do they discuss? List specific subjects.
- What ideological leanings are evident? Be concrete.
- Are they presenting facts, opinions, or advocacy? How?
- What memorable quotes capture their stance?

Be detailed and specific. Use examples from the posts. Don't be vague.
Respond with JSON only.`;
  
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

// Get user interactions from DB
async function getUserInteractions(username) {
  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction(['interactions'], 'readonly');
      const store = transaction.objectStore('interactions');
      const index = store.index('username');
      const request = index.getAll(username);

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => {
        console.error(`Error retrieving interactions for @${username}:`, request.error);
        reject(request.error);
      };
    } catch (error) {
      console.error(`Exception in getUserInteractions for @${username}:`, error);
      reject(error);
    }
  });
}

// Analyze interaction patterns
async function analyzeInteractionPatterns(username) {
  if (!aiConfig.features.patternRecognition) return null;

  try {
    const interactions = await getUserInteractions(username);
    if (interactions.length < 3) return null; // Need some history

    const likesCount = interactions.filter(i => i.type === 'like').length;
    const retweetsCount = interactions.filter(i => i.type === 'retweet').length;
    const totalInteractions = interactions.length;

    // Simple pattern: if you mostly like/retweet, you probably agree
    if (likesCount + retweetsCount > totalInteractions * 0.6) {
      return {
        suggestedSentiment: 'agree',
        confidence: 0.7,
        reasoning: `You've interacted positively with this account ${likesCount + retweetsCount} times out of ${totalInteractions} interactions`
      };
    }

    return null;
  } catch (error) {
    console.error(`Failed to analyze interaction patterns for @${username}:`, error);
    return null;
  }
}

// Record an interaction
async function recordInteraction(username, interactionType) {
  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction(['interactions'], 'readwrite');
      const store = transaction.objectStore('interactions');

      store.add({
        username,
        type: interactionType,
        timestamp: new Date().toISOString()
      });

      transaction.oncomplete = () => resolve(true);
      transaction.onerror = () => {
        console.error(`Error recording interaction for @${username}:`, transaction.error);
        reject(transaction.error);
      };
    } catch (error) {
      console.error(`Exception in recordInteraction for @${username}:`, error);
      reject(error);
    }
  });
}

// Combine interaction patterns and content analysis - FIXED VERSION
async function getCombinedAISuggestion(username) {
  console.log(`🤖 Getting AI suggestion for @${username}...`);
  
  let patternAnalysis = null;
  let contentAnalysis = null;
  
  // Get interaction pattern analysis
  if (aiConfig.features.patternRecognition) {
    console.log('  Analyzing interaction patterns...');
    patternAnalysis = await analyzeInteractionPatterns(username);
    if (patternAnalysis) {
      console.log(`  ✓ Pattern analysis: ${patternAnalysis.suggestedSentiment} (${Math.round(patternAnalysis.confidence * 100)}%)`);
    }
  }
  
  // Get content analysis if enabled
  if (aiConfig.features.contentAnalysis) {
    console.log('  Scraping recent posts...');
    const posts = await scrapeRecentPosts(username);
    console.log(`  Found ${posts.length} posts`);
    
    if (posts.length > 0) {
      console.log('  Analyzing content...');
      contentAnalysis = await analyzePostContent(username, posts);
      if (contentAnalysis) {
        console.log(`  ✓ Content analysis: ${contentAnalysis.overallSentiment} (${Math.round(contentAnalysis.confidence * 100)}%)`);
      }
    }
  }
  
  // Combine both analyses
  if (contentAnalysis && patternAnalysis) {
    // Use content analysis but boost confidence with pattern agreement
    if (contentAnalysis.overallSentiment === patternAnalysis.suggestedSentiment) {
      console.log('  ✓ Both analyses agree!');
      return {
        ...contentAnalysis,
        suggestedSentiment: contentAnalysis.overallSentiment,
        confidence: Math.min(contentAnalysis.confidence + 0.15, 1.0),
        reasoning: contentAnalysis.reasoning + `\n\nYour interaction pattern also suggests "${patternAnalysis.suggestedSentiment}".`
      };
    }
    console.log('  ⚠ Analyses differ, using content analysis');
    return {
      ...contentAnalysis,
      suggestedSentiment: contentAnalysis.overallSentiment,
      reasoning: contentAnalysis.reasoning + `\n\n(Note: Your interactions suggest "${patternAnalysis.suggestedSentiment}", but content analysis says "${contentAnalysis.overallSentiment}")`
    };
  }
  
  if (contentAnalysis) {
    console.log('  ✓ Returning content analysis');
    return {
      ...contentAnalysis,
      suggestedSentiment: contentAnalysis.overallSentiment
    };
  }
  
  if (patternAnalysis) {
    console.log('  ✓ Returning pattern analysis');
    return patternAnalysis;
  }
  
  console.log('  ❌ No AI analysis available');
  return null;
}

// Database operations
async function saveAccount(username, data) {
  return new Promise((resolve, reject) => {
    try {
      // Validate and sanitize all input data
      const validatedData = validateAccountData({
        username,
        ...data
      });

      const transaction = db.transaction(['accounts'], 'readwrite');
      const store = transaction.objectStore('accounts');

      store.put(validatedData);
      transaction.oncomplete = () => resolve(true);
      transaction.onerror = () => reject(transaction.error);
    } catch (error) {
      console.error('Validation error in saveAccount:', error);
      reject(error);
    }
  });
}

async function getAccount(username) {
  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction(['accounts'], 'readonly');
      const store = transaction.objectStore('accounts');
      const request = store.get(username);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        console.error(`Error retrieving account @${username}:`, request.error);
        reject(request.error);
      };
    } catch (error) {
      console.error(`Exception in getAccount for @${username}:`, error);
      reject(error);
    }
  });
}

async function deleteAccount(username) {
  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction(['accounts'], 'readwrite');
      const store = transaction.objectStore('accounts');
      store.delete(username);

      transaction.oncomplete = () => resolve(true);
      transaction.onerror = () => {
        console.error(`Error deleting account @${username}:`, transaction.error);
        reject(transaction.error);
      };
    } catch (error) {
      console.error(`Exception in deleteAccount for @${username}:`, error);
      reject(error);
    }
  });
}

async function getAllAccounts() {
  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction(['accounts'], 'readonly');
      const store = transaction.objectStore('accounts');
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => {
        console.error('Error retrieving all accounts:', request.error);
        reject(request.error);
      };
    } catch (error) {
      console.error('Exception in getAllAccounts:', error);
      reject(error);
    }
  });
}

// Extract username from User-Name element
function extractUsername(element) {
  const link = element.querySelector('a[href^="/"]');
  if (!link) return null;

  const href = link.getAttribute('href');
  const match = href.match(/^\/([^/?]+)/);
  if (!match) return null;

  // Sanitize and validate username
  const username = sanitizeUsername(match[1]);
  // Skip invalid usernames and system paths
  if (!username || username === 'i' || username === 'home' || username === 'explore') {
    return null;
  }

  return username;
}

// Collect a feed signal into the in-memory queue
function collectFeedSignal(username, postText, dwellTime) {
  signalQueue.push({ username, postText, dwellTime, timestamp: Date.now() });
  console.log(`[XAT Feed] Signal: @${username} — ${dwellTime}ms dwell — queue: ${signalQueue.length}`);
  if (signalQueue.length >= BATCH_THRESHOLD) {
    flushSignalQueue();
  }
}

// Write accumulated signals to IndexedDB
async function flushSignalQueue() {
  if (signalQueue.length === 0 || !db) return;
  const batch = signalQueue.splice(0, signalQueue.length);
  console.log(`[XAT Feed] Flushing ${batch.length} signals to IndexedDB...`);
  try {
    const transaction = db.transaction(['feedObservations'], 'readwrite');
    const store = transaction.objectStore('feedObservations');
    for (const signal of batch) {
      store.add(signal);
    }
    await new Promise((resolve, reject) => {
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });
    console.log(`[XAT Feed] Flush complete. ${batch.length} signals written.`);
  } catch (error) {
    console.error('[XAT Feed] Flush failed:', error);
    signalQueue.unshift(...batch); // put them back
  }
}

// Observe tweet articles entering/exiting the viewport to measure dwell time
const viewportObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    const article = entry.target;
    if (entry.isIntersecting) {
      dwellTracker.set(article, Date.now());
    } else {
      const entryTime = dwellTracker.get(article);
      if (entryTime) {
        const dwellTime = Date.now() - entryTime;
        const username = extractUsername(article);
        if (username) {
          const postText = extractPostText(article);
          collectFeedSignal(username, postText, dwellTime);
        }
        dwellTracker.delete(article);
      }
    }
  });
}, { threshold: 0.5 });

// Create badge element
function createBadge(sentiment, topics = {}, aiSuggested = false) {
  const badge = document.createElement('div');
  badge.className = 'xat-badge';
  
  // Emoji based on sentiment
  const emoji = {
    agree: '✓',
    disagree: '✗',
    mixed: '±',
    expert: '★',
    neutral: '◯',
    biased: '⚠'
  }[sentiment] || '?';
  
  // Add AI indicator if this was AI-suggested
  badge.textContent = aiSuggested ? `🤖 ${emoji}` : emoji;
  
  // Add topics if any
  if (Object.keys(topics).length > 0) {
    const topicCount = Object.keys(topics).length;
    badge.textContent += ` (${topicCount})`;
  }
  
  // Color coding
  const colors = {
    agree: '#10b981',
    disagree: '#ef4444',
    mixed: '#f59e0b',
    expert: '#3b82f6',
    neutral: '#6b7280',
    biased: '#f97316'
  };
  badge.style.background = colors[sentiment] || '#6b7280';
  
  return badge;
}

// Create tagging menu
function createTaggingMenu(username, existingData = null, aiSuggestion = null) {
  const menu = document.createElement('div');
  menu.className = 'xat-menu';
  
  // Header
  const header = document.createElement('div');
  header.className = 'xat-menu-header';

  const headerDiv = document.createElement('div');
  const strong = document.createElement('strong');
  strong.textContent = `Tag @${username}`;
  headerDiv.appendChild(strong);
  headerDiv.appendChild(document.createTextNode(' '));

  const badge = document.createElement('span');
  badge.className = existingData ? 'xat-edit-badge' : 'xat-new-badge';
  badge.textContent = existingData ? 'Editing' : 'New';
  headerDiv.appendChild(badge);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'xat-menu-close';
  closeBtn.textContent = '×';

  header.appendChild(headerDiv);
  header.appendChild(closeBtn);
  
  // Body
  const body = document.createElement('div');
  body.className = 'xat-menu-body';
  
  // AI Suggestion Section (if available)
  if (aiSuggestion && aiConfig.features.autoSuggest) {
    const aiSection = document.createElement('div');
    aiSection.className = 'xat-ai-suggestion';

    const confidencePercent = Math.round(aiSuggestion.confidence * 100);
    const confidenceColor = aiSuggestion.confidence > 0.7 ? '#10b981' : aiSuggestion.confidence > 0.5 ? '#f59e0b' : '#ef4444';

    // AI Header
    const aiHeader = document.createElement('div');
    aiHeader.className = 'xat-ai-header';
    const aiHeaderSpan = document.createElement('span');
    aiHeaderSpan.textContent = '🤖 AI Suggestion';
    const aiConfidence = document.createElement('span');
    aiConfidence.className = 'xat-ai-confidence';
    aiConfidence.style.color = confidenceColor;
    aiConfidence.style.fontWeight = '700';
    aiConfidence.textContent = `${confidencePercent}% confident`;
    aiHeader.appendChild(aiHeaderSpan);
    aiHeader.appendChild(aiConfidence);
    aiSection.appendChild(aiHeader);

    // AI Sentiment
    const aiSentimentDiv = document.createElement('div');
    aiSentimentDiv.className = 'xat-ai-sentiment';
    aiSentimentDiv.textContent = 'Suggested: ';
    const sentimentStrong = document.createElement('strong');
    sentimentStrong.textContent = aiSuggestion.suggestedSentiment;
    aiSentimentDiv.appendChild(sentimentStrong);
    aiSection.appendChild(aiSentimentDiv);

    // AI Reasoning (sanitized)
    if (aiSuggestion.reasoning) {
      const reasoningDiv = document.createElement('div');
      reasoningDiv.className = 'xat-ai-reasoning';
      reasoningDiv.textContent = aiSuggestion.reasoning;
      aiSection.appendChild(reasoningDiv);
    }

    // AI Topics (sanitized)
    if (aiSuggestion.topics && aiSuggestion.topics.length > 0) {
      const topicsDiv = document.createElement('div');
      topicsDiv.className = 'xat-ai-topics';
      topicsDiv.textContent = `Topics: ${aiSuggestion.topics.join(', ')}`;
      aiSection.appendChild(topicsDiv);
    }

    // Accept Button
    const acceptBtn = document.createElement('button');
    acceptBtn.className = 'xat-ai-accept';
    acceptBtn.textContent = 'Accept AI Suggestion';
    aiSection.appendChild(acceptBtn);

    body.appendChild(aiSection);
  }
  
  // Sentiment buttons
  const sentimentSection = document.createElement('div');
  sentimentSection.className = 'xat-sentiment-section';
  sentimentSection.innerHTML = '<h3>Sentiment</h3>';
  
  const sentiments = ['agree', 'disagree', 'mixed', 'expert', 'neutral', 'biased'];
  const sentimentGrid = document.createElement('div');
  sentimentGrid.className = 'xat-sentiment-grid';
  
  sentiments.forEach(sentiment => {
    const btn = document.createElement('button');
    btn.className = 'xat-sentiment-btn';
    btn.setAttribute('data-sentiment', sentiment);
    btn.textContent = sentiment.charAt(0).toUpperCase() + sentiment.slice(1);
    
    if (existingData?.sentiment === sentiment || aiSuggestion?.suggestedSentiment === sentiment) {
      btn.classList.add('active');
    }
    
    sentimentGrid.appendChild(btn);
  });
  
  sentimentSection.appendChild(sentimentGrid);
  body.appendChild(sentimentSection);
  
  // Topics section
  const topicSection = document.createElement('div');
  topicSection.className = 'xat-topic-section';
  topicSection.innerHTML = `
    <h3>Topics</h3>
    <div class="xat-topic-input-group">
      <input type="text" class="xat-topic-input" placeholder="Add topic...">
      <select class="xat-topic-sentiment">
        <option value="agree">Agree</option>
        <option value="disagree">Disagree</option>
        <option value="mixed">Mixed</option>
      </select>
      <button class="xat-topic-add">Add</button>
    </div>
    <div class="xat-topics-list"></div>
  `;
  body.appendChild(topicSection);
  
  // Notes section
  const notesSection = document.createElement('div');
  notesSection.className = 'xat-notes-section';
  const notesHeader = document.createElement('h3');
  notesHeader.textContent = 'Notes';
  const notesTextarea = document.createElement('textarea');
  notesTextarea.className = 'xat-notes';
  notesTextarea.placeholder = 'Add notes...';
  notesTextarea.value = existingData?.notes || '';
  notesSection.appendChild(notesHeader);
  notesSection.appendChild(notesTextarea);
  body.appendChild(notesSection);
  
  // Buttons
  const buttonsSection = document.createElement('div');
  buttonsSection.className = 'xat-buttons-section';
  buttonsSection.innerHTML = `
    <button class="xat-save-btn">Save</button>
    ${existingData ? '<button class="xat-delete-btn">Delete</button>' : ''}
  `;
  body.appendChild(buttonsSection);
  
  menu.appendChild(header);
  menu.appendChild(body);
  
  return menu;
}

// Render topics in the menu
function renderTopics(menu, topics) {
  const topicsList = menu.querySelector('.xat-topics-list');
  topicsList.innerHTML = '';

  Object.entries(topics).forEach(([topic, sentiment]) => {
    const topicTag = document.createElement('div');
    topicTag.className = `xat-topic-tag xat-topic-${sentiment}`;

    const topicSpan = document.createElement('span');
    topicSpan.textContent = topic;

    const removeBtn = document.createElement('button');
    removeBtn.className = 'xat-topic-remove';
    removeBtn.setAttribute('data-topic', topic);
    removeBtn.textContent = '×';

    topicTag.appendChild(topicSpan);
    topicTag.appendChild(removeBtn);
    topicsList.appendChild(topicTag);
  });
}

// Process all usernames on the page
async function processUsernames() {
  const userElements = document.querySelectorAll('[data-testid="User-Name"]');

  for (const element of userElements) {
    if (element.hasAttribute('data-xat-processed')) continue;
    element.setAttribute('data-xat-processed', 'true');

    const username = extractUsername(element);
    if (!username || username === 'i') continue; // Skip invalid usernames

    // Observe the parent article for dwell time tracking
    const article = element.closest('article');
    if (article && !article.hasAttribute('data-xat-observed')) {
      article.setAttribute('data-xat-observed', 'true');
      viewportObserver.observe(article);
    }

    let accountData = null;
    try {
      accountData = await getAccount(username);
    } catch (error) {
      console.error(`Failed to get account data for @${username}:`, error);
      continue; // Skip this username and move to next
    }
    
    if (accountData) {
      const badge = createBadge(accountData.sentiment, accountData.topics, accountData.aiSuggested);
      badge.setAttribute('data-username', username);
      
      // Add tooltip showing AI status
      if (accountData.aiSuggested && accountData.aiAnalysis) {
        badge.title = `AI Suggested: ${accountData.sentiment} (${Math.round(accountData.aiAnalysis.confidence * 100)}% confident)\n${accountData.aiAnalysis.reasoning}`;
      } else {
        badge.title = `Sentiment: ${accountData.sentiment}\nClick to edit`;
      }
      
      // IMPROVED: Place badge after the entire User-Name container, not inside it
      // This avoids conflict with X's hover profile card
      if (!element.querySelector('.xat-badge')) {
        element.style.position = 'relative';
        element.appendChild(badge);
      }
      
      badge.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        showTaggingMenu(username, accountData, badge);
      });
    }
    
    // Add hover listener - FIXED VERSION: Always runs AI if autoSuggest is enabled
    element.addEventListener('mouseenter', () => {
      if (!element.querySelector('.xat-quick-tag')) {
        const quickTag = document.createElement('button');
        quickTag.className = 'xat-quick-tag';
        quickTag.textContent = '+ Tag';
        quickTag.addEventListener('click', async (e) => {
          e.preventDefault();
          e.stopPropagation();
          
          let aiSuggestion = null;
          
          // FIXED: Run AI even if account exists, as long as autoSuggest is enabled
          if (aiConfig.enabled && aiConfig.features.autoSuggest) {
            console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
            console.log(`🏷️  +Tag clicked for @${username}`);
            console.log(`   AI enabled: ${aiConfig.enabled}`);
            console.log(`   autoSuggest: ${aiConfig.features.autoSuggest}`);
            console.log(`   contentAnalysis: ${aiConfig.features.contentAnalysis}`);
            console.log(`   patternRecognition: ${aiConfig.features.patternRecognition}`);
            console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
            
            // Show AI working indicator
            const analysisTypes = [];
            if (aiConfig.features.contentAnalysis) analysisTypes.push('posts');
            if (aiConfig.features.patternRecognition) analysisTypes.push('interactions');
            
            const analysisText = analysisTypes.length > 0 ? 
              `Analyzing ${analysisTypes.join(' & ')}...` : 
              'Analyzing...';
            
            quickTag.innerHTML = `🤖 <span style="font-size: 10px;">${analysisText}</span>`;
            quickTag.style.width = 'auto';
            quickTag.style.minWidth = '180px';
            
            const startTime = Date.now();
            aiSuggestion = await getCombinedAISuggestion(username);
            const elapsed = Date.now() - startTime;
            
            if (aiSuggestion) {
              quickTag.innerHTML = `✓ <span style="font-size: 10px;">Ready (${(elapsed/1000).toFixed(1)}s)</span>`;
              console.log(`✅ AI analysis complete in ${(elapsed/1000).toFixed(1)}s`);
              setTimeout(() => {
                quickTag.textContent = '+ Tag';
                quickTag.style.width = '';
                quickTag.style.minWidth = '';
              }, 1000);
            } else {
              console.log(`⚠️  AI analysis returned no suggestion`);
              quickTag.textContent = '+ Tag';
              quickTag.style.width = '';
              quickTag.style.minWidth = '';
            }
          } else {
            console.log(`ℹ️  AI not running - enabled: ${aiConfig.enabled}, autoSuggest: ${aiConfig.features.autoSuggest}`);
          }
          
          showTaggingMenu(username, accountData, quickTag, aiSuggestion);
        });
        element.appendChild(quickTag);
      }
    });
    
    element.addEventListener('mouseleave', () => {
      const quickTag = element.querySelector('.xat-quick-tag');
      if (quickTag) quickTag.remove();
    });
  }
}

// Show tagging menu - FIXED POSITIONING
function showTaggingMenu(username, existingData, anchorElement, aiSuggestion = null) {
  const existingMenu = document.querySelector('.xat-menu');
  if (existingMenu) existingMenu.remove();
  
  const menu = createTaggingMenu(username, existingData, aiSuggestion);
  document.body.appendChild(menu);
  
  // FIXED: Better positioning calculation
  const rect = anchorElement.getBoundingClientRect();
  const scrollY = window.scrollY || window.pageYOffset;
  const scrollX = window.scrollX || window.pageXOffset;
  
  // Position menu to the right of the anchor, accounting for scroll
  let top = rect.bottom + scrollY + 10;
  let left = rect.left + scrollX;
  
  // Apply initial position
  menu.style.position = 'absolute';
  menu.style.top = `${top}px`;
  menu.style.left = `${left}px`;
  menu.style.zIndex = '999999';
  
  // Wait for menu to render, then adjust if needed
  setTimeout(() => {
    const menuRect = menu.getBoundingClientRect();
    
    // If menu goes off right edge, move it left
    if (menuRect.right > window.innerWidth) {
      left = window.innerWidth - menuRect.width - 20 + scrollX;
      menu.style.left = `${left}px`;
    }
    
    // If menu goes off bottom edge, position above anchor instead
    if (menuRect.bottom > window.innerHeight) {
      top = rect.top + scrollY - menuRect.height - 10;
      menu.style.top = `${top}px`;
    }
    
    // If menu goes off top edge, position at top of viewport
    if (top < scrollY) {
      top = scrollY + 10;
      menu.style.top = `${top}px`;
    }
  }, 0);
  
  setupMenuListeners(menu, username, existingData, aiSuggestion);
}

// Setup menu event listeners with AI acceptance - FIXED CLICK HANDLING
function setupMenuListeners(menu, username, existingData, aiSuggestion) {
  let selectedSentiment = existingData?.sentiment || aiSuggestion?.suggestedSentiment || 'neutral';
  let topics = existingData?.topics ? {...existingData.topics} : {};
  let aiAccepted = false;
  
  // AI Accept button
  const acceptAIBtn = menu.querySelector('.xat-ai-accept');
  if (acceptAIBtn && aiSuggestion) {
    acceptAIBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      selectedSentiment = aiSuggestion.suggestedSentiment;
      menu.querySelectorAll('.xat-sentiment-btn').forEach(b => b.classList.remove('active'));
      const btn = menu.querySelector(`[data-sentiment="${selectedSentiment}"]`);
      if (btn) btn.classList.add('active');
      aiAccepted = true;
      
      menu.querySelector('.xat-ai-suggestion').style.background = '#d1fae5';
      acceptAIBtn.textContent = '✓ Accepted';
      acceptAIBtn.disabled = true;
    });
  }
  
  // Sentiment buttons with visual feedback
  menu.querySelectorAll('.xat-sentiment-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      
      // Visual feedback - button press animation
      btn.style.transform = 'scale(0.95)';
      btn.style.transition = 'transform 0.1s ease';
      setTimeout(() => {
        btn.style.transform = 'scale(1)';
      }, 100);
      
      // Update selection
      menu.querySelectorAll('.xat-sentiment-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedSentiment = btn.getAttribute('data-sentiment');
      
      console.log(`✓ Sentiment selected: ${selectedSentiment}`);
    });
  });
  
  // Add topic with feedback
  const addTopicBtn = menu.querySelector('.xat-topic-add');
  addTopicBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const topicInput = menu.querySelector('.xat-topic-input');
    const sentimentSelect = menu.querySelector('.xat-topic-sentiment');
    const topic = topicInput.value.trim();

    if (topic) {
      // Validate and sanitize topic
      const sanitizedTopic = sanitizeTopic(topic);

      if (!sanitizedTopic) {
        // Show error feedback
        addTopicBtn.style.background = '#ef4444';
        addTopicBtn.textContent = '✗';
        setTimeout(() => {
          addTopicBtn.style.background = '';
          addTopicBtn.textContent = 'Add';
        }, 500);
        return;
      }

      // Visual feedback
      addTopicBtn.style.background = '#10b981';
      addTopicBtn.textContent = '✓';

      topics[sanitizedTopic] = sentimentSelect.value;
      renderTopics(menu, topics);
      topicInput.value = '';

      console.log(`✓ Topic added: ${sanitizedTopic} (${sentimentSelect.value})`);

      setTimeout(() => {
        addTopicBtn.style.background = '';
        addTopicBtn.textContent = 'Add';
      }, 500);
    }
  });
  
  // Remove topic - use event delegation
  menu.addEventListener('click', (e) => {
    e.stopPropagation();
    if (e.target.classList.contains('xat-topic-remove')) {
      const topic = e.target.getAttribute('data-topic');
      delete topics[topic];
      renderTopics(menu, topics);
    }
  });
  
  // Save button with feedback
  const saveBtn = menu.querySelector('.xat-save-btn');
  saveBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const notes = menu.querySelector('.xat-notes').value;

    // Visual feedback - saving
    saveBtn.textContent = 'Saving...';
    saveBtn.disabled = true;
    saveBtn.style.opacity = '0.7';

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('💾 SAVING ACCOUNT DATA');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Username:', username);
    console.log('Sentiment:', selectedSentiment);
    console.log('Topics:', Object.keys(topics).length > 0 ? topics : 'None');
    console.log('Notes:', notes ? notes.substring(0, 50) + '...' : 'None');
    console.log('AI Suggested:', aiAccepted ? 'Yes' : 'No');
    if (aiSuggestion) {
      console.log('AI Confidence:', Math.round(aiSuggestion.confidence * 100) + '%');
      console.log('AI Reasoning:', aiSuggestion.reasoning);
    }
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    try {
      await saveAccount(username, {
        sentiment: selectedSentiment,
        topics: topics,
        notes: notes,
        interactionCount: existingData?.interactionCount || 0,
        aiSuggested: aiAccepted,
        aiAnalysis: aiSuggestion
      });

      // Success feedback
      saveBtn.textContent = '✓ Saved!';
      saveBtn.style.background = '#10b981';

      console.log('✅ Account data saved successfully for @' + username + '\n');

      setTimeout(() => {
        menu.remove();
      }, 500);

      // Force refresh of badges
      document.querySelectorAll('[data-xat-processed]').forEach(el => {
        el.removeAttribute('data-xat-processed');
      });
      processUsernames();
    } catch (error) {
      // Error feedback
      saveBtn.textContent = '✗ Error';
      saveBtn.style.background = '#ef4444';
      saveBtn.disabled = false;
      saveBtn.style.opacity = '1';

      console.error('❌ Failed to save account data:', error);

      setTimeout(() => {
        saveBtn.textContent = 'Save';
        saveBtn.style.background = '';
      }, 2000);
    }
  });
  
  // Delete button
  const deleteBtn = menu.querySelector('.xat-delete-btn');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (confirm(`Delete tracking data for @${username}?`)) {
        try {
          deleteBtn.textContent = 'Deleting...';
          deleteBtn.disabled = true;
          await deleteAccount(username);
          menu.remove();
          document.querySelectorAll(`[data-username="${username}"]`).forEach(badge => badge.remove());
        } catch (error) {
          console.error(`Failed to delete account @${username}:`, error);
          deleteBtn.textContent = '✗ Error';
          deleteBtn.style.background = '#ef4444';
          setTimeout(() => {
            deleteBtn.textContent = 'Delete';
            deleteBtn.style.background = '';
            deleteBtn.disabled = false;
          }, 2000);
        }
      }
    });
  }
  
  // Close button
  const closeBtn = menu.querySelector('.xat-menu-close');
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    menu.remove();
  });
  
  // Close on outside click
  setTimeout(() => {
    const closeOnOutsideClick = (e) => {
      if (!menu.contains(e.target)) {
        menu.remove();
        document.removeEventListener('click', closeOnOutsideClick);
      }
    };
    document.addEventListener('click', closeOnOutsideClick);
  }, 100);
}

// Track interactions with posts
function observeInteractions() {
  if (!aiConfig.features.patternRecognition) return;

  document.addEventListener('click', async (e) => {
    const target = e.target.closest('[data-testid="like"], [data-testid="retweet"], [data-testid="unretweet"]');
    if (target) {
      const article = target.closest('article');
      if (article) {
        const usernameElement = article.querySelector('[data-testid="User-Name"]');
        if (usernameElement) {
          const username = extractUsername(usernameElement);
          if (username) {
            const interactionType = target.getAttribute('data-testid');
            try {
              await recordInteraction(username, interactionType);
            } catch (error) {
              console.error(`Failed to record interaction for @${username}:`, error);
              // Continue silently - don't disrupt user's interaction with X
            }
          }
        }
      }
    }
  }, true);
}

// Debounce utility function for performance optimization
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Clear expired cache entries to prevent memory leaks
function clearExpiredCache() {
  const now = Date.now();
  let clearedCount = 0;

  for (const [username, cached] of postsCache.entries()) {
    if (now - cached.timestamp >= CACHE_TTL_MS) {
      postsCache.delete(username);
      clearedCount++;
    }
  }

  if (clearedCount > 0) {
    console.log(`Cleared ${clearedCount} expired cache entries`);
  }
}

// Initialize extension
(async function init() {
  console.log('X Account Tracker v2.0: Initializing...');
  
  try {
    await initDB();
    await loadAIConfig();
    console.log('X Account Tracker v2.0: Database ready');
    console.log('AI Features:', aiConfig.enabled ? 'Enabled' : 'Disabled');
    
    if (aiConfig.enabled) {
      const connectionTest = await testOllamaConnection();
      if (connectionTest.success) {
        console.log('X Account Tracker v2.0: ✓ Connected to Ollama');
        console.log('Available models:', connectionTest.models.map(m => m.name).join(', '));
      } else {
        console.warn('X Account Tracker v2.0: ⚠ Cannot connect to Ollama:', connectionTest.error);
      }
    }
    
    await processUsernames();

    // Debounce processUsernames to avoid excessive processing on rapid DOM changes
    const debouncedProcessUsernames = debounce(processUsernames, 300);

    const observer = new MutationObserver(() => {
      debouncedProcessUsernames();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    observeInteractions();

    // Clear expired cache entries every 5 minutes to prevent memory leaks
    setInterval(clearExpiredCache, CACHE_TTL_MS);

    // Periodically flush any accumulated signals (5 min fallback)
    setInterval(() => { if (signalQueue.length > 0) flushSignalQueue(); }, BATCH_FLUSH_INTERVAL_MS);

    console.log('X Account Tracker v2.0: Active and monitoring');
  } catch (error) {
    console.error('X Account Tracker v2.0: Initialization error', error);
  }
})();

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getAllAccounts') {
    getAllAccounts()
      .then(accounts => {
        sendResponse({ accounts });
      })
      .catch(error => {
        console.error('Error in getAllAccounts message handler:', error);
        sendResponse({ accounts: [], error: error.message });
      });
    return true;
  }

  if (request.action === 'exportData') {
    getAllAccounts()
      .then(accounts => {
        sendResponse({ data: accounts });
      })
      .catch(error => {
        console.error('Error in exportData message handler:', error);
        sendResponse({ data: [], error: error.message });
      });
    return true;
  }
  
  if (request.action === 'importData') {
    try {
      const { accounts, errors } = validateImportData(request.data);

      const transaction = db.transaction(['accounts'], 'readwrite');
      const store = transaction.objectStore('accounts');

      accounts.forEach(account => {
        store.put(account);
      });

      transaction.oncomplete = () => {
        sendResponse({
          success: true,
          imported: accounts.length,
          errors: errors.length > 0 ? errors : null
        });
      };

      transaction.onerror = () => {
        sendResponse({
          success: false,
          error: 'Database error during import'
        });
      };

      return true;
    } catch (error) {
      sendResponse({
        success: false,
        error: error.message
      });
    }
  }
  
  if (request.action === 'testOllama') {
    testOllamaConnection().then(result => {
      sendResponse(result);
    });
    return true;
  }
  
  if (request.action === 'updateAIConfig') {
    aiConfig = { ...aiConfig, ...request.config };
    chrome.storage.local.set({ aiConfig }, () => {
      sendResponse({ success: true });
    });
    return true;
  }
  
  if (request.action === 'reloadAIConfig') {
    loadAIConfig().then(() => {
      sendResponse({ success: true, config: aiConfig });
    });
    return true;
  }
});
