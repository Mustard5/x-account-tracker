// X Account Tracker v2.0 - Popup Script (FIXED VERSION)

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

// Load overview stats - FIXED VERSION
async function loadStats() {
  chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
    // Check if we have a valid tab
    if (!tabs || tabs.length === 0 || !tabs[0] || !tabs[0].url) {
      document.getElementById('totalAccounts').textContent = '-';
      document.getElementById('recentlyUpdated').textContent = '-';
      return;
    }
    
    // Check if on Twitter/X
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
    
    // Test connection and show status
    testConnectionStatus();
  });
}

// Test Ollama connection - FIXED VERSION
async function testConnectionStatus() {
  const statusDiv = document.getElementById('connectionStatus');
  if (!statusDiv) return;
  
  statusDiv.innerHTML = '<div class="connection-status">Testing...</div>';
  
  // Get the configured URL
  const ollamaUrl = document.getElementById('ollamaUrl')?.value || 'http://localhost:11434';
  
  // Try direct fetch first (most reliable)
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    const response = await fetch(`${ollamaUrl}/api/tags`, {
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (response.ok) {
      const data = await response.json();
      const models = data.models && data.models.length > 0 
        ? data.models.map(m => m.name).join(', ')
        : 'None found';
      
      statusDiv.innerHTML = `
        <div class="connection-status connected">
          ✓ Connected
        </div>
        <div style="font-size: 11px; color: #6b7280; margin-top: 8px;">
          Available models: ${models}
        </div>
      `;
      
      if (data.models && data.models.length === 0) {
        statusDiv.innerHTML += `
          <div style="font-size: 11px; color: #f59e0b; margin-top: 4px;">
            ⚠ No models found. Run: ollama pull llama3.2:3b
          </div>
        `;
      }
      return;
    }
  } catch (error) {
    console.error('Direct fetch failed:', error);
    
    // If direct fetch fails, show helpful error
    statusDiv.innerHTML = `
      <div class="connection-status disconnected">
        ✗ Not Connected
      </div>
      <div style="font-size: 11px; color: #991b1b; margin-top: 8px;">
        Cannot reach Ollama at ${ollamaUrl}
      </div>
      <div style="font-size: 11px; color: #6b7280; margin-top: 4px;">
        Check: Is Ollama running? Try: systemctl status ollama
      </div>
    `;
    return;
  }
  
  // Fallback: try through content script if on X/Twitter
  chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
    if (!tabs || tabs.length === 0 || !tabs[0] || !tabs[0].url) {
      // Already showed error above, no need to update again
      return;
    }
    
    if (tabs[0].url.includes('twitter.com') || tabs[0].url.includes('x.com')) {
      chrome.tabs.sendMessage(tabs[0].id, {action: 'testOllama'}, (response) => {
        if (chrome.runtime.lastError) {
          // Already showed error via direct fetch
          return;
        }
        
        if (response && response.success) {
          const models = response.models.map(m => m.name).join(', ');
          statusDiv.innerHTML = `
            <div class="connection-status connected">
              ✓ Connected
            </div>
            <div style="font-size: 11px; color: #6b7280; margin-top: 8px;">
              Available models: ${models}
            </div>
          `;
        }
      });
    }
  });
}

// Test connection button
const testButton = document.getElementById('testConnection');
if (testButton) {
  testButton.addEventListener('click', testConnectionStatus);
}

// Save AI settings
const saveButton = document.getElementById('saveAISettings');
if (saveButton) {
  saveButton.addEventListener('click', () => {
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
      // Notify content script to reload config
      chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        if (tabs && tabs[0] && tabs[0].url && 
            (tabs[0].url.includes('twitter.com') || tabs[0].url.includes('x.com'))) {
          chrome.tabs.sendMessage(tabs[0].id, {action: 'updateAIConfig', config: config}, (response) => {
            if (chrome.runtime.lastError) {
              showStatus('Settings saved! Reload X/Twitter to activate.', 'success', 'aiStatus');
            } else {
              showStatus('AI settings saved successfully!', 'success', 'aiStatus');
            }
            testConnectionStatus();
          });
        } else {
          showStatus('Settings saved! Visit X/Twitter to activate.', 'success', 'aiStatus');
        }
      });
    });
  });
}

// Export data
const exportButton = document.getElementById('exportData');
if (exportButton) {
  exportButton.addEventListener('click', () => {
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      if (!tabs || tabs.length === 0 || !tabs[0] || !tabs[0].url) {
        showStatus('Please open X/Twitter first', 'error');
        return;
      }
      
      if (tabs[0].url.includes('twitter.com') || tabs[0].url.includes('x.com')) {
        chrome.tabs.sendMessage(tabs[0].id, {action: 'exportData'}, (response) => {
          if (chrome.runtime.lastError) {
            showStatus('Could not export data. Reload the page and try again.', 'error');
            return;
          }
          
          if (response && response.data) {
            const dataStr = JSON.stringify(response.data, null, 2);
            const blob = new Blob([dataStr], {type: 'application/json'});
            const url = URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = url;
            a.download = `x-account-tracker-v2-${new Date().toISOString().split('T')[0]}.json`;
            a.click();
            
            showStatus('Data exported successfully!', 'success');
          }
        });
      } else {
        showStatus('Please visit X/Twitter to export data', 'error');
      }
    });
  });
}

// Import data
const importButton = document.getElementById('importData');
if (importButton) {
  importButton.addEventListener('click', () => {
    document.getElementById('fileInput').click();
  });
}

const fileInput = document.getElementById('fileInput');
if (fileInput) {
  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const data = JSON.parse(event.target.result);
          
          chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
            if (!tabs || tabs.length === 0 || !tabs[0] || !tabs[0].url) {
              showStatus('Please open X/Twitter first', 'error');
              return;
            }
            
            if (tabs[0].url.includes('twitter.com') || tabs[0].url.includes('x.com')) {
              chrome.tabs.sendMessage(tabs[0].id, {action: 'importData', data: data}, (response) => {
                if (chrome.runtime.lastError) {
                  showStatus('Could not import data. Reload the page and try again.', 'error');
                  return;
                }
                
                showStatus('Data imported successfully!', 'success');
                loadStats();
              });
            } else {
              showStatus('Please visit X/Twitter to import data', 'error');
            }
          });
        } catch (error) {
          showStatus('Error importing data: Invalid JSON file', 'error');
        }
      };
      reader.readAsText(file);
    }
  });
}

// View accounts button
const viewAccountsButton = document.getElementById('viewAccounts');
if (viewAccountsButton) {
  viewAccountsButton.addEventListener('click', () => {
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      if (!tabs || tabs.length === 0 || !tabs[0] || !tabs[0].url) {
        showStatus('Please open X/Twitter first', 'error');
        return;
      }
      
      if (tabs[0].url.includes('twitter.com') || tabs[0].url.includes('x.com')) {
        chrome.tabs.sendMessage(tabs[0].id, {action: 'getAllAccounts'}, (response) => {
          if (chrome.runtime.lastError) {
            showStatus('Could not load accounts. Reload the page and try again.', 'error');
            return;
          }
          
          if (response && response.accounts) {
            // Create a simple modal or new tab showing accounts
            const accounts = response.accounts;
            let accountsHTML = '<h3>Tracked Accounts</h3>';
            
            accounts.forEach(acc => {
              accountsHTML += `<div>@${acc.username} - ${acc.sentiment}</div>`;
            });
            
            // For now, just log to console
            console.log('Tracked accounts:', accounts);
            showStatus(`Found ${accounts.length} tracked accounts (see console)`, 'success');
          }
        });
      } else {
        showStatus('Please visit X/Twitter to view accounts', 'error');
      }
    });
  });
}

// Load overview stats - IMPROVED ERROR MESSAGES
async function loadStats() {
  chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
    // Check if we have a valid tab
    if (!tabs || tabs.length === 0 || !tabs[0] || !tabs[0].url) {
      document.getElementById('totalAccounts').textContent = '-';
      document.getElementById('recentlyUpdated').textContent = '-';
      return;
    }
    
    // Check if on Twitter/X
    if (tabs[0].url.includes('twitter.com') || tabs[0].url.includes('x.com')) {
      chrome.tabs.sendMessage(tabs[0].id, {action: 'getAllAccounts'}, (response) => {
        if (chrome.runtime.lastError) {
          console.warn('Could not connect to content script:', chrome.runtime.lastError);
          
          // Show helpful message instead of just '-'
          document.getElementById('totalAccounts').textContent = '⟳';
          document.getElementById('recentlyUpdated').textContent = '⟳';
          
          // Add a help message
          const statusEl = document.getElementById('status');
          if (statusEl) {
            statusEl.textContent = 'Refresh X/Twitter page (F5) to activate extension';
            statusEl.className = 'error';
            statusEl.style.display = 'block';
          }
          
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

