// X Account Tracker v2.0 - AI-Enhanced Content Script (FIXED - AI ALWAYS RUNS)

const DB_NAME = 'XAccountTrackerDB';
const DB_VERSION = 9;
let db = null;

// Sprint 1: Passive feed observation
const signalQueue = [];
const BATCH_THRESHOLD = 20;
const BATCH_FLUSH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_DWELL_MS = 30000; // cap dwell at 30s to avoid AFK skew
const dwellTracker = new WeakMap(); // article element -> entry timestamp

// Sprint 2: Batch categorization
const CAT_MIN_ACCOUNTS = 5;
const VALID_CATEGORIES = ['Technology', 'AI/ML', 'Politics', 'Faith/Spirituality',
  'Finance/Crypto', 'Sports', 'Entertainment', 'Science', 'News/Media',
  'Personal/Lifestyle', 'Other'];
const pendingCategorization = new Set(); // usernames seen since last categorization run

// AI Configuration (loaded from storage)
let aiConfig = {
  enabled: false,
  ollamaUrl: 'http://localhost:11434',
  model: 'llama3.2:3b',
  features: {
    patternRecognition: false
  }
};


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

      // Sprint 2: Account category profiles
      if (!db.objectStoreNames.contains('accountProfiles')) {
        const profileStore = db.createObjectStore('accountProfiles', { keyPath: 'username' });
        profileStore.createIndex('category', 'category', { unique: false });
        profileStore.createIndex('lastSeen', 'lastSeen', { unique: false });
        profileStore.createIndex('categorizedAt', 'categorizedAt', { unique: false });
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
async function analyzeWithOllama(prompt, systemPrompt = '', numPredict = 200) {
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
          num_predict: numPredict
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
  pendingCategorization.add(username);
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
    scheduleCategorizationIfNeeded();
  } catch (error) {
    console.error('[XAT Feed] Flush failed:', error);
    signalQueue.unshift(...batch); // put them back
  }
}

// Read recent feedObservations for a set of usernames to build categorization input
async function gatherAccountSamples(usernames) {
  const samples = [];
  for (const username of usernames) {
    try {
      const records = await new Promise((resolve, reject) => {
        const tx = db.transaction(['feedObservations'], 'readonly');
        const index = tx.objectStore('feedObservations').index('username');
        const req = index.getAll(username);
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
      if (records.length === 0) continue;
      const posts = records.map(r => r.postText).filter(t => t && t.length > 10);
      const avgDwell = Math.round(records.reduce((sum, r) => sum + r.dwellTime, 0) / records.length);
      samples.push({ username, posts, avgDwell, signalCount: records.length });
    } catch (error) {
      console.error(`[XAT Cat] Failed to gather samples for @${username}:`, error);
    }
  }
  return samples;
}

// Write categorization results to accountProfiles store
async function saveAccountProfiles(samples, categories) {
  const tx = db.transaction(['accountProfiles'], 'readwrite');
  const store = tx.objectStore('accountProfiles');
  const now = new Date().toISOString();
  for (const sample of samples) {
    const raw = categories[sample.username];
    const category = VALID_CATEGORIES.includes(raw) ? raw : 'Other';
    store.put({
      username: sample.username,
      category,
      avgDwell: sample.avgDwell,
      signalCount: sample.signalCount,
      lastSeen: now,
      categorizedAt: now
    });
  }
  await new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

// Send a batch of accounts to Ollama for topic categorization
async function categorizeAccountBatch() {
  if (!aiConfig.enabled || pendingCategorization.size === 0) return;

  const usernames = [...pendingCategorization];
  pendingCategorization.clear();
  console.log(`[XAT Cat] Categorizing ${usernames.length} accounts...`);

  const samples = await gatherAccountSamples(usernames);
  if (samples.length === 0) return;

  const accountsText = samples.map(({ username, posts }) => {
    const excerpts = posts.slice(0, 2).map(p => p.substring(0, 200)).join('\n');
    return `@${username}:\n${excerpts || '(no post text)'}`;
  }).join('\n\n');

  const systemPrompt = `You are categorizing X/Twitter accounts by their primary topic. Assign each account exactly ONE category from this list: Technology, AI/ML, Politics, Faith/Spirituality, Finance/Crypto, Sports, Entertainment, Science, News/Media, Personal/Lifestyle, Other. Respond ONLY with a single JSON object mapping each handle to its category. Example format: {"pmarca": "Technology", "FoxNews": "News/Media", "SenWarren": "Politics"}. No explanation. No markdown. No arrays.`;
  const prompt = `Categorize these accounts based on their posts:\n\n${accountsText}\n\nRespond with a single JSON object only. Example: {"handle1": "Category1", "handle2": "Category2"}`;

  const result = await analyzeWithOllama(prompt, systemPrompt, 600);
  if (!result) {
    usernames.forEach(u => pendingCategorization.add(u)); // restore for retry
    return;
  }

  let categories = {};
  try {
    // Primary: match a JSON object {"handle": "Category", ...}
    const objMatch = result.match(/\{[\s\S]*\}/);
    if (objMatch) {
      const parsed = JSON.parse(objMatch[0]);
      // Verify values are strings (not nested objects from wrong format)
      if (Object.values(parsed).every(v => typeof v === 'string')) {
        categories = parsed;
      }
    }
    // Fallback: model returned array format [{"username": "x", "category": "y"}]
    if (Object.keys(categories).length === 0) {
      const arrMatch = result.match(/\[[\s\S]*\]/);
      if (arrMatch) {
        const arr = JSON.parse(arrMatch[0]);
        if (Array.isArray(arr)) {
          for (const item of arr) {
            if (item.username && item.category) categories[item.username] = item.category;
          }
        }
      }
    }
  } catch (error) {
    console.error('[XAT Cat] Failed to parse categorization response:', error);
    usernames.forEach(u => pendingCategorization.add(u));
    return;
  }

  if (Object.keys(categories).length === 0) {
    console.warn('[XAT Cat] No categories parsed from response, will retry next flush');
    usernames.forEach(u => pendingCategorization.add(u));
    return;
  }

  await saveAccountProfiles(samples, categories);
  const summary = Object.entries(categories).map(([u, c]) => `@${u}→${c}`).join(', ');
  console.log(`[XAT Cat] Done: ${summary}`);
}

// Schedule categorization during browser idle time if enough accounts are pending
function scheduleCategorizationIfNeeded() {
  if (!aiConfig.enabled || pendingCategorization.size < CAT_MIN_ACCOUNTS) return;
  console.log(`[XAT Cat] Scheduling categorization for ${pendingCategorization.size} accounts`);
  if (typeof requestIdleCallback !== 'undefined') {
    requestIdleCallback(() => categorizeAccountBatch(), { timeout: 30000 });
  } else {
    setTimeout(() => categorizeAccountBatch(), 5000);
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
        const dwellTime = Math.min(Date.now() - entryTime, MAX_DWELL_MS);
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
function createTaggingMenu(username, existingData = null) {
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
    
    if (existingData?.sentiment === sentiment) {
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
    
    // Add hover listener for manual tagging
    element.addEventListener('mouseenter', () => {
      if (!element.querySelector('.xat-quick-tag')) {
        const quickTag = document.createElement('button');
        quickTag.className = 'xat-quick-tag';
        quickTag.textContent = '+ Tag';
        quickTag.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          showTaggingMenu(username, accountData, quickTag);
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
  
  if (request.action === 'getAccountProfiles') {
    const tx = db.transaction(['accountProfiles'], 'readonly');
    const req = tx.objectStore('accountProfiles').getAll();
    req.onsuccess = () => sendResponse({ profiles: req.result || [] });
    req.onerror = () => sendResponse({ profiles: [] });
    return true;
  }

  if (request.action === 'reloadAIConfig') {
    loadAIConfig().then(() => {
      sendResponse({ success: true, config: aiConfig });
    });
    return true;
  }
});
