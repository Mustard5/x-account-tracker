// X Account Tracker - Background Service Worker
// Handles cross-origin fetch requests that content scripts cannot make directly.

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'ollamaTest') {
    fetch(`${request.ollamaUrl}/api/tags`)
      .then(res => {
        if (!res.ok) throw new Error('Ollama not responding');
        return res.json();
      })
      .then(data => sendResponse({ success: true, models: data.models }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; // keep message channel open for async response
  }

  if (request.action === 'ollamaAnalyze') {
    fetch(`${request.ollamaUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: request.model,
        messages: request.messages,
        stream: false,
        options: {
          temperature: 0.3,
          num_predict: request.numPredict
        }
      })
    })
      .then(res => {
        if (!res.ok) throw new Error('Ollama request failed');
        return res.json();
      })
      .then(data => sendResponse({ content: data.message.content }))
      .catch(err => sendResponse({ error: err.message }));
    return true; // keep message channel open for async response
  }
});
