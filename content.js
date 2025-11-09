// X Account Tracker v2.0 - AI-Enhanced Content Script (FIXED POSITIONING & CLICKS)

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
  if (!aiConfig.enabled) return null;
  
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

// Scrape recent posts from an account visible on page
async function scrapeRecentPosts(username) {
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
  
  return posts;
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
    // Use content analysis but boost confidence with pattern agreement
    const patternsAgree = contentAnalysis.overallSentiment === patternAnalysis.suggestedSentiment;
    
    return {
      suggestedSentiment: contentAnalysis.overallSentiment,
      confidence: patternsAgree ? 
        Math.min(0.95, contentAnalysis.confidence * 1.2) : // Boost if both agree
        (contentAnalysis.confidence + patternAnalysis.confidence) / 2, // Average if different
      reasoning: `Content shows: ${contentAnalysis.reasoning}. Your interactions ${patternsAgree ? 'confirm' : 'show'} ${patternAnalysis.suggestedSentiment} sentiment.`,
      topics: contentAnalysis.topics,
      expertise: contentAnalysis.expertise,
      concerns: contentAnalysis.concerns,
      sources: ['content', 'patterns']
    };
  } else if (contentAnalysis) {
    // Only content analysis available
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
    // Only pattern analysis available
    return {
      ...patternAnalysis,
      sources: ['patterns']
    };
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
  
  const interactionSummary = interactions.map(i => 
    `${i.type} on ${new Date(i.timestamp).toLocaleDateString()}`
  ).join(', ');
  
  const systemPrompt = `You are a pattern analyzer. Based on user interactions, suggest sentiment. Respond ONLY with JSON:
{
  "suggestedSentiment": "agree|disagree|mixed|expert|biased|neutral",
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation"
}`;
  
  const prompt = `User's interactions with @${username}:
${interactionSummary}

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
  
  let badgeHTML = `<span class="xat-badge-icon" style="background-color: ${color}">${icon}</span>`;
  
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

// Create tagging menu with AI suggestions - FIXED VERSION
function createTaggingMenu(username, existingData, aiSuggestion = null) {
  const menu = document.createElement('div');
  menu.className = 'xat-menu';
  
  // CRITICAL: Stop all event propagation on the menu itself
  menu.addEventListener('click', (e) => {
    e.stopPropagation();
  });
  
  let aiSuggestionHTML = '';
  if (aiSuggestion && aiConfig.features.autoSuggest) {
    const confidencePercent = Math.round(aiSuggestion.confidence * 100);
    const confidenceColor = confidencePercent >= 75 ? '#10b981' : confidencePercent >= 50 ? '#f59e0b' : '#ef4444';
    
    // Build source description
    const sources = aiSuggestion.sources || ['patterns'];
    const sourceText = sources.includes('content') && sources.includes('patterns') ? 
      'post content and your interactions' :
      sources.includes('content') ? 'post content analysis' : 'your interaction history';
    
    // Build detailed info with better formatting
    let detailedInfo = '';
    if (aiSuggestion.topics && aiSuggestion.topics.length > 0) {
      detailedInfo += `<div style="font-size: 12px; margin-top: 12px; padding: 8px; background: rgba(0,0,0,0.05); border-radius: 6px;"><strong>📋 Topics:</strong> ${aiSuggestion.topics.join(', ')}</div>`;
    }
    if (aiSuggestion.expertise) {
      detailedInfo += `<div style="font-size: 12px; margin-top: 8px; padding: 8px; background: rgba(0,0,0,0.05); border-radius: 6px;"><strong>🎓 Expertise:</strong> ${aiSuggestion.expertise}</div>`;
    }
    if (aiSuggestion.perspectives) {
      detailedInfo += `<div style="font-size: 12px; margin-top: 8px; padding: 8px; background: rgba(0,0,0,0.05); border-radius: 6px;"><strong>💭 Viewpoint:</strong> ${aiSuggestion.perspectives}</div>`;
    }
    if (aiSuggestion.keyQuotes && aiSuggestion.keyQuotes.length > 0) {
      detailedInfo += `<div style="font-size: 12px; margin-top: 8px; padding: 8px; background: rgba(0,0,0,0.05); border-radius: 6px;"><strong>💬 Key Quotes:</strong><br>${aiSuggestion.keyQuotes.map(q => `"${q}"`).join('<br>')}</div>`;
    }
    
    aiSuggestionHTML = `
      <div class="xat-ai-suggestion">
        <div class="xat-ai-suggestion-header">
          <span>🤖 AI Analysis Complete</span>
          <span class="xat-ai-confidence" style="background: ${confidenceColor}">${confidencePercent}% confident</span>
        </div>
        <div class="xat-ai-suggestion-body">
          <strong>Suggested Sentiment: ${aiSuggestion.suggestedSentiment}</strong>
          <p><em>Why:</em> ${aiSuggestion.reasoning}</p>
          ${detailedInfo}
          <div style="font-size: 11px; color: #6b7280; margin-top: 8px;">
            Based on ${sourceText}
          </div>
          <button class="xat-ai-accept">✓ Accept This Suggestion</button>
        </div>
      </div>
    `;
  } else if (aiConfig.features.autoSuggest && !aiSuggestion) {
    aiSuggestionHTML = `
      <div class="xat-ai-suggestion" style="background: #f3f4f6; border-color: #d1d5db;">
        <div class="xat-ai-suggestion-body">
          <p style="margin: 0; color: #6b7280; font-size: 13px;">
            💡 <strong>AI Analysis:</strong> Not enough interaction history yet. Tag this account and interact with their posts to enable AI suggestions in the future.
          </p>
        </div>
      </div>
    `;
  }
  
  menu.innerHTML = `
    <div class="xat-menu-header">
      <strong>@${username}</strong>
      <button class="xat-menu-close">×</button>
    </div>
    <div class="xat-menu-body">
      ${aiSuggestionHTML}
      <div class="xat-menu-section">
        <label>Overall Sentiment:</label>
        <div class="xat-sentiment-buttons">
          <button class="xat-sentiment-btn" data-sentiment="agree">✓ Agree</button>
          <button class="xat-sentiment-btn" data-sentiment="disagree">✗ Disagree</button>
          <button class="xat-sentiment-btn" data-sentiment="mixed">~ Mixed</button>
          <button class="xat-sentiment-btn" data-sentiment="expert">★ Expert</button>
          <button class="xat-sentiment-btn" data-sentiment="biased">⚠ Biased</button>
          <button class="xat-sentiment-btn" data-sentiment="neutral">• Neutral</button>
        </div>
      </div>
      <div class="xat-menu-section">
        <label>Topic-Specific Tags:</label>
        <div class="xat-topics">
          <input type="text" class="xat-topic-input" placeholder="e.g., politics, tech, crypto">
          <select class="xat-topic-sentiment">
            <option value="agree">Agree</option>
            <option value="disagree">Disagree</option>
            <option value="expert">Expert</option>
          </select>
          <button class="xat-topic-add">Add</button>
        </div>
        <div class="xat-topic-list"></div>
      </div>
      <div class="xat-menu-section">
        <label>Notes:</label>
        <textarea class="xat-notes" placeholder="Personal notes about this account...">${existingData?.notes || ''}</textarea>
      </div>
      <div class="xat-menu-actions">
        <button class="xat-save-btn">Save</button>
        ${existingData ? '<button class="xat-delete-btn">Delete</button>' : ''}
      </div>
    </div>
  `;
  
  // Highlight current sentiment
  if (existingData?.sentiment) {
    const btn = menu.querySelector(`[data-sentiment="${existingData.sentiment}"]`);
    if (btn) btn.classList.add('active');
  } else if (aiSuggestion) {
    const btn = menu.querySelector(`[data-sentiment="${aiSuggestion.suggestedSentiment}"]`);
    if (btn) btn.classList.add('active', 'ai-suggested');
  }
  
  // Render existing topics
  if (existingData?.topics) {
    renderTopics(menu, existingData.topics);
  }
  
  return menu;
}

// Render topics in menu
function renderTopics(menu, topics) {
  const topicList = menu.querySelector('.xat-topic-list');
  topicList.innerHTML = '';
  
  for (const [topic, sentiment] of Object.entries(topics)) {
    const topicTag = document.createElement('div');
    topicTag.className = 'xat-topic-tag';
    topicTag.innerHTML = `
      <span class="xat-topic-name">${topic}</span>
      <span class="xat-topic-sentiment" data-sentiment="${sentiment}">${getSentimentIcon(sentiment)}</span>
      <button class="xat-topic-remove" data-topic="${topic}">×</button>
    `;
    topicList.appendChild(topicTag);
  }
}

// Process username elements on the page with AI analysis
async function processUsernames() {
  const userElements = document.querySelectorAll('[data-testid="User-Name"]');
  
  for (const element of userElements) {
    if (element.hasAttribute('data-xat-processed')) continue;
    
    const username = extractUsername(element);
    if (!username) continue;
    
    element.setAttribute('data-xat-processed', 'true');
    
    const accountData = await getAccount(username);
    
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
    
    // Add hover listener
    element.addEventListener('mouseenter', () => {
      if (!element.querySelector('.xat-quick-tag')) {
        const quickTag = document.createElement('button');
        quickTag.className = 'xat-quick-tag';
        quickTag.textContent = '+ Tag';
        quickTag.addEventListener('click', async (e) => {
          e.preventDefault();
          e.stopPropagation();
          
          let aiSuggestion = null;
          if (aiConfig.features.autoSuggest && !accountData) {
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
              setTimeout(() => {
                quickTag.textContent = '+ Tag';
                quickTag.style.width = '';
                quickTag.style.minWidth = '';
              }, 1000);
            } else {
              quickTag.textContent = '+ Tag';
              quickTag.style.width = '';
              quickTag.style.minWidth = '';
            }
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
      // Visual feedback
      addTopicBtn.style.background = '#10b981';
      addTopicBtn.textContent = '✓';
      
      topics[topic] = sentimentSelect.value;
      renderTopics(menu, topics);
      topicInput.value = '';
      
      console.log(`✓ Topic added: ${topic} (${sentimentSelect.value})`);
      
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
  });
  
  // Delete button
  const deleteBtn = menu.querySelector('.xat-delete-btn');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (confirm(`Delete tracking data for @${username}?`)) {
        await deleteAccount(username);
        menu.remove();
        document.querySelectorAll(`[data-username="${username}"]`).forEach(badge => badge.remove());
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
            await recordInteraction(username, interactionType);
          }
        }
      }
    }
  }, true);
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
    
    const observer = new MutationObserver(() => {
      processUsernames();
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
    
    observeInteractions();
    
    console.log('X Account Tracker v2.0: Active and monitoring');
  } catch (error) {
    console.error('X Account Tracker v2.0: Initialization error', error);
  }
})();

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getAllAccounts') {
    getAllAccounts().then(accounts => {
      sendResponse({ accounts });
    });
    return true;
  }
  
  if (request.action === 'exportData') {
    getAllAccounts().then(accounts => {
      sendResponse({ data: accounts });
    });
    return true;
  }
  
  if (request.action === 'importData') {
    const transaction = db.transaction(['accounts'], 'readwrite');
    const store = transaction.objectStore('accounts');
    
    request.data.forEach(account => {
      store.put(account);
    });
    
    sendResponse({ success: true });
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
