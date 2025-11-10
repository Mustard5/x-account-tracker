// X Account Tracker v2.0 - AI-Enhanced Content Script

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

// --- UTIL FUNCTION: OLLAMA BACKGROUND FETCH ---
function ollamaApiRequest(path, payload = {}, method = 'POST') {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      {
        type: 'OLLAMA_FETCH',
        url: aiConfig.ollamaUrl + path,
        payload,
        method
      },
      (response) => {
        if (!response || !response.success) {
          resolve(null);
        } else {
          resolve(response.data);
        }
      }
    );
  });
}

// Initialize IndexedDB with AI interaction tracking
async function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => { db = request.result; resolve(db); };
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
        const interactionStore = db.createObjectStore('interactions', { keyPath: 'id', autoIncrement: true });
        interactionStore.createIndex('username', 'username', { unique: false });
        interactionStore.createIndex('type', 'type', { unique: false });
        interactionStore.createIndex('timestamp', 'timestamp', { unique: false });
      }
      // AI analysis cache
      if (!db.objectStoreNames.contains('aiAnalysis')) {
        const aiStore = db.createObjectStore('aiAnalysis', { keyPath: 'id', autoIncrement: true });
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

// --- OLLAMA API WRAPPERS ---

// Test Ollama connection
async function testOllamaConnection() {
  const data = await ollamaApiRequest('/api/tags', {}, 'GET');
  if (data && data.models) return { success: true, models: data.models };
  return { success: false, error: 'Ollama not responding' };
}

// Call Ollama API for text analysis
async function analyzeWithOllama(prompt, systemPrompt = '') {
  if (!aiConfig.enabled) return null;
  try {
    const messages = [];
    if (systemPrompt) { messages.push({ role: 'system', content: systemPrompt }); }
    messages.push({ role: 'user', content: prompt });
    const data = await ollamaApiRequest('/api/chat', {
      model: aiConfig.model,
      messages: messages,
      stream: false,
      options: { temperature: 0.3, num_predict: 200 }
    });
    if (!data) throw new Error('Ollama request failed');
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
  const systemPrompt = `You are analyzing social media posts to help a user track whether they agree or disagree with accounts. Focus on SPECIFIC VIEWPOINTS and POSITIONS with concrete examples. Respond ONLY with JSON: { "overallSentiment": "agree|disagree|mixed|expert|neutral", "topics": ["topic1", "topic2", "topic3"], "confidence": 0.0-1.0, "reasoning": "DETAILED: specific positions they take with examples from posts", "expertise": "specific subjects they show knowledge about", "perspectives": "ideological stance with specific examples (e.g., 'pro-market, skeptical of regulation - argues for free trade', 'progressive environmental views - advocates carbon tax')", "keyQuotes": ["memorable/representative quote 1", "quote 2"] }`;
  const prompt = `Analyze these recent posts from @${username}: ${recentPosts} Provide SPECIFIC analysis: - What exact viewpoints/positions do they express? Give examples. - What topics do they discuss? List specific subjects. - What ideological leanings are evident? Be concrete. - Are they presenting facts, opinions, or advocacy? How? - What memorable quotes capture their stance? Be detailed and specific. Use examples from the posts. Don't be vague. Respond with JSON only.`;
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

// Combine interaction patterns and content analysis
async function getCombinedAISuggestion(username) {
  let patternAnalysis = null;
  let contentAnalysis = null;
  if (aiConfig.features.patternRecognition) {
    patternAnalysis = await analyzeInteractionPatterns(username);
  }
  if (aiConfig.features.contentAnalysis) {
    const posts = await scrapeRecentPosts(username);
    if (posts.length > 0) {
      contentAnalysis = await analyzePostContent(username, posts);
    }
  }
  if (contentAnalysis && patternAnalysis) {
    const patternsAgree = contentAnalysis.overallSentiment === patternAnalysis.suggestedSentiment;
    return {
      suggestedSentiment: contentAnalysis.overallSentiment,
      confidence: patternsAgree ? Math.min(0.95, contentAnalysis.confidence * 1.2) : (contentAnalysis.confidence + patternAnalysis.confidence) / 2,
      reasoning: `Content shows: ${contentAnalysis.reasoning}. Your interactions ${patternsAgree ? 'confirm' : 'show'} ${patternAnalysis.suggestedSentiment} sentiment.`,
      topics: contentAnalysis.topics,
      expertise: contentAnalysis.expertise,
      concerns: contentAnalysis.concerns,
      sources: ['content', 'patterns']
    };
  } else if (contentAnalysis) {
    return {
      suggestedSentiment: contentAnalysis.overallSentiment,
      confidence: contentAnalysis.confidence,
      reasoning: contentAnalysis.reasoning,
      topics: contentAnalysis.topics,
      expertise: contentAnalysis.expertise,
      concerns: contentAnalysis.concerns,
      sources: ['content']
    };
  } else if (patternAnalysis) {
    return { ...patternAnalysis, sources: ['patterns'] };
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
  const interactionSummary = interactions.map(i => `${i.type} on ${new Date(i.timestamp).toLocaleDateString()}`).join(', ');
  const systemPrompt = `You are a pattern analyzer. Based on user interactions, suggest sentiment. Respond ONLY with JSON: { "suggestedSentiment": "agree|disagree|mixed|expert|biased|neutral", "confidence": 0.0-1.0, "reasoning": "brief explanation" }`;
  const prompt = `User's interactions with @${username}: ${interactionSummary} What sentiment does this suggest? Respond with JSON only.`;
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

// All other functions below are unchanged but ensure any async logic is in async functions.

// ... [other project logic, badges, menus, UI code, etc., as before; omitted for brevity]

