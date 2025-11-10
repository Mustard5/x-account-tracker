// X Account Tracker v2.1 - Service Worker for Ollama API Communication
// This service worker handles all fetch requests to avoid CORS/CSP issues

console.log('X Account Tracker: Service worker loaded');

// Handle messages from content scripts and popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Service worker received message:', request.action);

  if (request.action === 'ollamaRequest') {
    handleOllamaRequest(request, sendResponse);
    return true; // Keep channel open for async response
  }

  return false;
});

// Handle all Ollama API requests
async function handleOllamaRequest(request, sendResponse) {
  const { type, data } = request;

  try {
    switch (type) {
      case 'test':
        await testConnection(data, sendResponse);
        break;
      case 'tags':
        await getTags(data, sendResponse);
        break;
      case 'chat':
        await chatRequest(data, sendResponse);
        break;
      default:
        sendResponse({ success: false, error: 'Unknown request type' });
    }
  } catch (error) {
    console.error('Service worker error:', error);
    sendResponse({ success: false, error: error.message });
  }
}

// Test Ollama connection
async function testConnection(data, sendResponse) {
  const { ollamaUrl } = data;
  
  try {
    const response = await fetch(`${ollamaUrl}/api/tags`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (response.ok) {
      const result = await response.json();
      sendResponse({ 
        success: true, 
        models: result.models 
      });
    } else {
      sendResponse({ 
        success: false, 
        error: 'Ollama not responding' 
      });
    }
  } catch (error) {
    sendResponse({ 
      success: false, 
      error: error.message 
    });
  }
}

// Get available tags/models
async function getTags(data, sendResponse) {
  const { ollamaUrl } = data;
  
  try {
    const response = await fetch(`${ollamaUrl}/api/tags`);
    
    if (response.ok) {
      const result = await response.json();
      sendResponse({ 
        success: true, 
        data: result 
      });
    } else {
      sendResponse({ 
        success: false, 
        error: 'Failed to get tags' 
      });
    }
  } catch (error) {
    sendResponse({ 
      success: false, 
      error: error.message 
    });
  }
}

// Handle chat/analysis requests
async function chatRequest(data, sendResponse) {
  const { ollamaUrl, model, messages, options } = data;
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🤖 OLLAMA REQUEST (Service Worker)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Model:', model);
  console.log('URL:', ollamaUrl);
  console.log('Messages:', messages.length);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const startTime = Date.now();

  try {
    const response = await fetch(`${ollamaUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: model,
        messages: messages,
        stream: false,
        options: options || {
          temperature: 0.3,
          num_predict: 200
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Ollama request failed: ${response.status}`);
    }

    const result = await response.json();
    const elapsed = Date.now() - startTime;

    console.log('✅ OLLAMA RESPONSE (' + (elapsed/1000).toFixed(2) + 's)');
    console.log('Raw Response:', result.message.content);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    sendResponse({ 
      success: true, 
      data: result 
    });
  } catch (error) {
    console.error('❌ Ollama request failed:', error);
    sendResponse({ 
      success: false, 
      error: error.message 
    });
  }
}
