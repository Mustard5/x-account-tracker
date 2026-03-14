// X Account Tracker - Background Service Worker
// Handles cross-origin fetch requests that content scripts cannot make directly.

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'ollamaTest') {
    console.log(`[XAT BG] ollamaTest request to ${request.ollamaUrl}/api/tags`);
    fetch(`${request.ollamaUrl}/api/tags`)
      .then(res => {
        if (!res.ok) throw new Error('Ollama not responding');
        return res.json();
      })
      .then(data => {
        console.log(`[XAT BG] ollamaTest success, ${data.models?.length || 0} models`);
        sendResponse({ success: true, models: data.models });
      })
      .catch(err => {
        console.error(`[XAT BG] ollamaTest error:`, err.message);
        sendResponse({ success: false, error: err.message });
      });
    return true; // keep message channel open for async response
  }

  if (request.action === 'ollamaAnalyze') {
    const url = `${request.ollamaUrl}/api/chat`;
    console.log(`[XAT BG] ollamaAnalyze request to ${url} with model ${request.model}`);
    fetch(url, {
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
        if (!res.ok) {
          console.error(`[XAT BG] Ollama responded ${res.status} ${res.statusText}`);
          return res.text().then(body => {
            console.error(`[XAT BG] Response body:`, body);
            throw new Error(`Ollama request failed (${res.status}): ${body.substring(0, 200)}`);
          });
        }
        return res.json();
      })
      .then(data => {
        console.log(`[XAT BG] Ollama response received, content length: ${data.message?.content?.length || 0}`);
        sendResponse({ content: data.message.content });
      })
      .catch(err => {
        console.error(`[XAT BG] ollamaAnalyze error:`, err.message);
        sendResponse({ error: err.message });
      });
    return true; // keep message channel open for async response
  }
});
