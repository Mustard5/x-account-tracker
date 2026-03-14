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

// Test Ollama connection (delegated to background.js to avoid CORS)
async function testOllamaConnection() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { action: 'ollamaTest', ollamaUrl: aiConfig.ollamaUrl },
      (response) => {
        if (chrome.runtime.lastError) {
          resolve({ success: false, error: chrome.runtime.lastError.message });
        } else {
          resolve(response);
        }
      }
    );
  });
}

// Call Ollama API for text analysis (delegated to background.js to avoid CORS)
async function analyzeWithOllama(prompt, systemPrompt = '', numPredict = 200) {
  if (!aiConfig.enabled) {
    console.log('❌ AI disabled in settings');
    return null;
  }

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

  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      {
        action: 'ollamaAnalyze',
        ollamaUrl: aiConfig.ollamaUrl,
        model: aiConfig.model,
        messages,
        numPredict
      },
      (response) => {
        if (chrome.runtime.lastError) {
          console.error('❌ Ollama analysis failed (runtime error):', chrome.runtime.lastError.message);
          resolve(null);
          return;
        }
        if (response && response.error) {
          console.error('❌ Ollama analysis failed:', response.error);
          resolve(null);
          return;
        }
        const elapsed = Date.now() - startTime;
        console.log('✅ OLLAMA RESPONSE (' + (elapsed / 1000).toFixed(2) + 's)');
        console.log('Raw Response:', response.content);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        resolve(response.content);
      }
    );
  });
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

function getAllStoreRecords(storeName) {
  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction([storeName], 'readonly');
      const request = transaction.objectStore(storeName).getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    } catch (error) {
      reject(error);
    }
  });
}

async function exportAllData() {
  const [accounts, interactions, feedObservations, accountProfiles] = await Promise.all([
    getAllStoreRecords('accounts'),
    getAllStoreRecords('interactions'),
    getAllStoreRecords('feedObservations'),
    getAllStoreRecords('accountProfiles'),
  ]);
  return {
    version: 2,
    exportDate: new Date().toISOString(),
    accounts,
    interactions,
    feedObservations,
    accountProfiles,
  };
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

    // Read-then-write inside the SAME transaction to avoid race conditions
    const req = store.get(sample.username);
    req.onsuccess = () => {
      const existing = req.result;
      store.put({
        username: sample.username,
        category,
        avgDwell: sample.avgDwell,
        signalCount: sample.signalCount,
        lastSeen: now,
        categorizedAt: now,
        // Preserve existing interaction counts and computed scores
        likeCount: existing?.likeCount || 0,
        retweetCount: existing?.retweetCount || 0,
        engagementScore: existing?.engagementScore ?? null,
        isStale: existing?.isStale || false,
        staleReason: existing?.staleReason || null,
      });
    };
  }

  await new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

// Increment like or retweet count on an accountProfiles record
async function incrementProfileInteraction(username, interactionType) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['accountProfiles'], 'readwrite');
    const store = tx.objectStore('accountProfiles');
    const req = store.get(username);
    req.onsuccess = () => {
      const profile = req.result;
      if (!profile) { resolve(false); return; } // no profile yet — will be set on next categorization
      if (interactionType === 'like') {
        profile.likeCount = (profile.likeCount || 0) + 1;
      } else if (interactionType === 'retweet') {
        profile.retweetCount = (profile.retweetCount || 0) + 1;
      }
      store.put(profile);
    };
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

// Compute combined engagement score for a single username
// Returns { score, obsCount } or null
async function computeEngagementScore(username) {
  try {
    // Single transaction across both stores for a consistent snapshot
    const tx = db.transaction(['feedObservations', 'interactions'], 'readonly');

    const [observations, interactions] = await Promise.all([
      new Promise((resolve, reject) => {
        const req = tx.objectStore('feedObservations').index('username').getAll(username);
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      }),
      new Promise((resolve, reject) => {
        const req = tx.objectStore('interactions').index('username').getAll(username);
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      }),
    ]);

    const obsCount = observations.length;
    const likeCount  = interactions.filter(i => i.type === 'like').length;
    const rtCount    = interactions.filter(i => i.type === 'retweet').length;
    const interactionSum = likeCount * 2 + rtCount * 3;

    // Interaction-only (no feed observations): unambiguous high engagement
    if (obsCount === 0) {
      return interactionSum > 0 ? { score: 1.5, obsCount: 0 } : null;
    }

    // Not enough data yet
    if (obsCount < 3) return null;

    let dwellSum = 0;
    for (const obs of observations) {
      if (obs.dwellTime < 2000) dwellSum -= 1;
      else if (obs.dwellTime > 8000) dwellSum += 1;
    }
    const score = parseFloat(((dwellSum + interactionSum) / obsCount).toFixed(2));
    return { score, obsCount };
  } catch (error) {
    console.error(`[XAT Score] computeEngagementScore failed for @${username}:`, error);
    return null;
  }
}

// Write engagementScore + staleness fields back to an accountProfiles record
async function updateEngagementScore(username) {
  try {
    const result = await computeEngagementScore(username);
    const score = result ? result.score : null;
    const liveObsCount = result ? result.obsCount : 0;

    await new Promise((resolve, reject) => {
      const tx = db.transaction(['accountProfiles'], 'readwrite');
      const store = tx.objectStore('accountProfiles');
      const req = store.get(username);
      req.onsuccess = () => {
        const profile = req.result;
        if (!profile) { resolve(false); return; }
        profile.engagementScore = score;
        // Update signalCount to live observation count so staleness uses current data
        if (liveObsCount > 0) {
          profile.signalCount = liveObsCount;
        }
        const daysSinceLastSeen = (Date.now() - new Date(profile.lastSeen).getTime()) / 86400000;
        const lowEngagement = score !== null && score < -0.5 && liveObsCount >= 10;
        const notSeen = daysSinceLastSeen > 30;
        profile.isStale = lowEngagement || notSeen;
        profile.staleReason = notSeen ? 'not_seen' : (lowEngagement ? 'low_engagement' : null);
        store.put(profile);
      };
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
    console.log(`[XAT Score] @${username} → ${score}`);
  } catch (error) {
    console.error(`[XAT Score] updateEngagementScore failed for @${username}:`, error);
  }
}

// Schedule a score recomputation during browser idle time
function scheduleScoreRecomputation(username) {
  if (typeof requestIdleCallback !== 'undefined') {
    requestIdleCallback(() => updateEngagementScore(username), { timeout: 30000 });
  } else {
    setTimeout(() => updateEngagementScore(username), 5000);
  }
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

  // Schedule engagement score recomputation for each newly categorized account
  for (const sample of samples) {
    scheduleScoreRecomputation(sample.username);
  }
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

  }
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
              // Only positive signals increment profile counts
              if (interactionType === 'like' || interactionType === 'retweet') {
                await incrementProfileInteraction(username, interactionType);
                scheduleScoreRecomputation(username);
              }
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
    exportAllData()
      .then(data => sendResponse({ data }))
      .catch(error => {
        console.error('Error in exportData message handler:', error);
        sendResponse({ data: null, error: error.message });
      });
    return true;
  }
  
  if (request.action === 'importData') {
    try {
      const file = request.data;
      const isV2 = file && typeof file === 'object' && file.version === 2;

      if (isV2) {
        // v2: restore all four stores in one transaction
        const stores = ['accounts', 'interactions', 'feedObservations', 'accountProfiles'];
        const transaction = db.transaction(stores, 'readwrite');
        const counts = { accounts: 0, interactions: 0, feedObservations: 0, accountProfiles: 0 };

        for (const storeName of stores) {
          const records = file[storeName];
          if (!Array.isArray(records)) continue;
          const store = transaction.objectStore(storeName);
          for (const record of records) {
            store.put(record);
            counts[storeName]++;
          }
        }

        transaction.oncomplete = () => sendResponse({ success: true, version: 2, imported: counts });
        transaction.onerror   = () => sendResponse({ success: false, error: 'Database error during import' });
      } else {
        // v1 legacy: raw accounts array
        const { accounts, errors } = validateImportData(Array.isArray(file) ? file : []);

        const transaction = db.transaction(['accounts'], 'readwrite');
        const store = transaction.objectStore('accounts');
        accounts.forEach(account => store.put(account));

        transaction.oncomplete = () => sendResponse({
          success: true,
          version: 1,
          imported: { accounts: accounts.length },
          errors: errors.length > 0 ? errors : null,
        });
        transaction.onerror = () => sendResponse({ success: false, error: 'Database error during import' });
      }

      return true;
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
  }
  
  if (request.action === 'clearAllData') {
    const stores = ['accounts', 'interactions', 'feedObservations', 'accountProfiles'];
    try {
      const transaction = db.transaction(stores, 'readwrite');
      const countMap = {};
      let pending = stores.length;

      stores.forEach(storeName => {
        const objectStore = transaction.objectStore(storeName);
        const countReq = objectStore.count();
        countReq.onsuccess = () => {
          countMap[storeName] = countReq.result;
          objectStore.clear();
          pending--;
        };
      });

      transaction.oncomplete = () => sendResponse({ success: true, deleted: countMap });
      transaction.onerror   = () => sendResponse({ success: false, error: 'Database error during clear' });
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
    return true;
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
