// X Account Tracker v2.1 - Popup Script (Service Worker Integration)

// Tab switching
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    const tabName = tab.getAttribute('data-tab');
    
    // Update tab buttons
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    
    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => {
      content.classList.remove('active');
    });
    document.getElementById(tabName).classList.add('active');
    
    // Load appropriate data
    if (tabName === 'overview') {
      loadStats();
    } else if (tabName === 'ai-settings') {
      loadAISettings();
    }
  });
});

function showStatus(message, type, elementId = 'status') {
  const status = document.getElementById(elementId);
  if (!status) return;
  
  status.textContent = message;
  status.className = type;
  status.style.display = 'block';
  
  setTimeout(() => {
    status.style.display = 'none';
  }, 3000);
}

// Load overview stats
async function loadStats() {
  chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
    if (!tabs || tabs.length === 0 || !tabs[0] || !tabs[0].url) {
      document.getElementById('totalAccounts').textContent = '-';
      document.getElementById('recentlyUpdated').textContent = '-';
      return;
    }
    
    if (tabs[0].url.includes('twitter.com') || tabs[0].url.includes('x.com')) {
      chrome.tabs.sendMessage(tabs[0].id, {action: 'getAllAccounts'}, (response) => {
        if (chrome.runtime.lastError) {
          console.warn('Could not connect to content script:', chrome.runtime.lastError);
          document.getElementById('totalAccounts').textContent = '-';
          document.getElementById('recentlyUpdated').textContent = '-';
          return;
        }
        
        if (response && response.accounts) {
          const accounts = response.accounts;
          document.getElementById('totalAccounts').textContent = accounts.length;
          
          const today = new Date().toDateString();
          const recentCount = accounts.filter(acc => 
            new Date(acc.lastUpdated).toDateString() === today
          ).length;
          
          document.getElementById('recentlyUpdated').textContent = recentCount;
        }
      });
    } else {
      document.getElementById('totalAccounts').textContent = '-';
      document.getElementById('recentlyUpdated').textContent = '-';
    }
  });
}

// Load AI settings from storage
async function loadAISettings() {
  chrome.storage.local.get(['aiConfig'], (result) => {
    const config = result.aiConfig || {
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
    
    document.getElementById('aiEnabled').checked = config.enabled;
    document.getElementById('ollamaUrl').value = config.ollamaUrl;
    document.getElementById('ollamaModel').value = config.model;
    document.getElementById('contentAnalysis').checked = config.features.contentAnalysis;
    document.getElementById('patternRecognition').checked = config.features.patternRecognition;
    document.getElementById('topicExtraction').checked = config.features.topicExtraction;
    document.getElementById('autoSuggest').checked = config.features.autoSuggest;
    
    testConnectionStatus();
  });
}

// UPDATED: Test Ollama connection via service worker
async function testConnectionStatus() {
  const statusDiv = document.getElementById('connectionStatus');
  if (!statusDiv) return;
  
  statusDiv.innerHTML = '<span class="xat-status-checking">⏳ Checking connection...</span>';
  
  chrome.storage.local.get(['aiConfig'], (result) => {
    const config = result.aiConfig || { ollamaUrl: 'http://localhost:11434' };
    
    chrome.runtime.sendMessage({
      action: 'ollamaRequest',
      type: 'tags',
      data: { ollamaUrl: config.ollamaUrl }
    }, (response) => {
      if (chrome.runtime.lastError || !response.success) {
        statusDiv.innerHTML = `
          <span class="xat-status-error">
            ✗ Not Connected
            <span class="xat-status-hint">Make sure Ollama is running on ${config.ollamaUrl}</span>
          </span>
        `;
      } else {
        const modelCount = response.models?.length || 0;
        statusDiv.innerHTML = `
          <span class="xat-status-success">
            ✓ Connected (${modelCount} models available)
          </span>
        `;
      }
    });
  });
}

// Test connection button
document.getElementById('testConnection')?.addEventListener('click', () => {
  testConnectionStatus();
});

// Save AI settings
document.getElementById('saveSettings')?.addEventListener('click', () => {
  const config = {
    enabled: document.getElementById('aiEnabled').checked,
    ollamaUrl: document.getElementById('ollamaUrl').value,
    model: document.getElementById('ollamaModel').value,
    features: {
      contentAnalysis: document.getElementById('contentAnalysis').checked,
      patternRecognition: document.getElementById('patternRecognition').checked,
      topicExtraction: document.getElementById('topicExtraction').checked,
      autoSuggest: document.getElementById('autoSuggest').checked
    }
  };
  
  chrome.storage.local.set({ aiConfig: config }, () => {
    showStatus('Settings saved!', 'success', 'ai-status');
    
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      if (tabs[0] && (tabs[0].url.includes('twitter.com') || tabs[0].url.includes('x.com'))) {
        chrome.tabs.sendMessage(tabs[0].id, {action: 'updateBadges'});
      }
    });
  });
});

// View all accounts
document.getElementById('viewAccounts')?.addEventListener('click', () => {
  chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
    if (tabs[0] && (tabs[0].url.includes('twitter.com') || tabs[0].url.includes('x.com'))) {
      chrome.tabs.sendMessage(tabs[0].id, {action: 'getAllAccounts'}, (response) => {
        if (response && response.accounts) {
          console.log('All tracked accounts:', response.accounts);
          alert(`You have ${response.accounts.length} tracked accounts. Check console for details.`);
        }
      });
    } else {
      alert('Please navigate to X/Twitter to view accounts.');
    }
  });
});

// Export data
document.getElementById('exportData')?.addEventListener('click', () => {
  chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
    if (tabs[0] && (tabs[0].url.includes('twitter.com') || tabs[0].url.includes('x.com'))) {
      chrome.tabs.sendMessage(tabs[0].id, {action: 'getAllAccounts'}, (response) => {
        if (response && response.accounts) {
          const dataStr = JSON.stringify(response.accounts, null, 2);
          const blob = new Blob([dataStr], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `x-account-tracker-${new Date().toISOString().split('T')[0]}.json`;
          a.click();
          URL.revokeObjectURL(url);
        }
      });
    }
  });
});

// Import data
document.getElementById('importData')?.addEventListener('click', () => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json';
  
  input.onchange = (e) => {
    const file = e.target.files[0];
    const reader = new FileReader();
    
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target.result);
        console.log('Importing data:', data);
        alert('Data imported! Refresh the page to see changes.');
      } catch (error) {
        alert('Error importing data: ' + error.message);
      }
    };
    
    reader.readAsText(file);
  };
  
  input.click();
});

// Initialize
loadStats();
