// X Account Tracker — Popup Script (Sprint 3)

// ── Tab switching ──────────────────────────────────────────────────────────

document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    const tabName = tab.getAttribute('data-tab');

    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');

    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.getElementById(tabName).classList.add('active');

    if (tabName === 'categories') {
      loadCategories();
    } else if (tabName === 'ai-settings') {
      loadAISettings();
    }
  });
});

// ── Helpers ────────────────────────────────────────────────────────────────

function showStatus(message, type, elementId = 'status') {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.textContent = message;
  el.className = type;
  setTimeout(() => { el.className = ''; }, 3500);
}

function relativeTime(isoString) {
  const ms = Date.now() - new Date(isoString).getTime();
  const mins  = Math.floor(ms / 60000);
  const hours = Math.floor(ms / 3600000);
  const days  = Math.floor(ms / 86400000);
  if (mins  <  1) return 'just now';
  if (hours <  1) return `${mins}m ago`;
  if (days  <  1) return `${hours}h ago`;
  return `${days}d ago`;
}

function dwellLevel(avgDwell) {
  if (avgDwell < 1000) return 'low';
  if (avgDwell < 4000) return 'med';
  return 'high';
}

function getActiveXTab(callback) {
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    if (!tabs || !tabs[0] || !tabs[0].url) {
      callback(null);
      return;
    }
    const url = tabs[0].url;
    if (url.includes('x.com') || url.includes('twitter.com')) {
      callback(tabs[0]);
    } else {
      callback(null);
    }
  });
}

// ── Categories tab ─────────────────────────────────────────────────────────

function loadCategories() {
  const listEl  = document.getElementById('categoryList');
  const totalEl = document.getElementById('catTotal');
  listEl.innerHTML = '<div class="loading">Loading...</div>';
  totalEl.textContent = '';

  getActiveXTab(tab => {
    if (!tab) {
      listEl.innerHTML = '<div class="empty-state">Open X/Twitter to view categories.</div>';
      return;
    }

    chrome.tabs.sendMessage(tab.id, { action: 'getAccountProfiles' }, response => {
      if (chrome.runtime.lastError || !response) {
        listEl.innerHTML = '<div class="empty-state">Reload X/Twitter and reopen this panel.</div>';
        return;
      }

      const profiles = response.profiles || [];

      if (profiles.length === 0) {
        totalEl.textContent = '0 accounts observed';
        listEl.innerHTML = '<div class="empty-state">No data yet.<br>Browse X normally — categories appear after the first Ollama batch runs (every 20 posts scrolled).</div>';
        return;
      }

      totalEl.textContent = `${profiles.length} account${profiles.length !== 1 ? 's' : ''} observed`;

      // Group by category
      const grouped = {};
      for (const profile of profiles) {
        const cat = profile.category || 'Other';
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push(profile);
      }

      // Sort categories by account count descending
      const sorted = Object.entries(grouped).sort((a, b) => b[1].length - a[1].length);

      listEl.innerHTML = '';
      for (const [category, accounts] of sorted) {
        listEl.appendChild(buildCategoryRow(category, accounts));
      }
    });
  });
}

function buildCategoryRow(category, accounts) {
  // Staleness: >50% of accounts have low dwell
  const lowCount = accounts.filter(a => dwellLevel(a.avgDwell) === 'low').length;
  const isStale  = lowCount > accounts.length / 2;

  const row = document.createElement('div');
  row.className = 'cat-row';

  const header = document.createElement('div');
  header.className = 'cat-row-header';
  header.innerHTML = `
    <span class="cat-arrow">&#9658;</span>
    <span class="cat-name">${category}</span>
    <span class="cat-count">${accounts.length} account${accounts.length !== 1 ? 's' : ''}</span>
    ${isStale ? '<span class="cat-stale">low engagement</span>' : ''}
  `;

  // Account list, hidden by default
  const accountList = document.createElement('div');
  accountList.className = 'cat-accounts';

  // Sort accounts by lastSeen descending (most recent first)
  const sortedAccounts = [...accounts].sort(
    (a, b) => new Date(b.lastSeen) - new Date(a.lastSeen)
  );
  for (const account of sortedAccounts) {
    accountList.appendChild(buildAccountRow(account));
  }

  header.addEventListener('click', () => {
    const isOpen = accountList.classList.contains('open');
    accountList.classList.toggle('open', !isOpen);
    header.querySelector('.cat-arrow').innerHTML = isOpen ? '&#9658;' : '&#9660;';
  });

  row.appendChild(header);
  row.appendChild(accountList);
  return row;
}

function buildAccountRow(account) {
  const { username, avgDwell, lastSeen } = account;
  const level = dwellLevel(avgDwell);
  const barChar = { low: '▂', med: '▅', high: '█' }[level];

  const row = document.createElement('div');
  row.className = 'account-row';

  // Build safely — no innerHTML with user data
  const link = document.createElement('a');
  link.className = 'account-link';
  link.href = `https://x.com/${encodeURIComponent(username)}`;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = `@${username}`;

  const meta = document.createElement('span');
  meta.className = 'account-meta';
  meta.textContent = relativeTime(lastSeen);

  const dwell = document.createElement('span');
  dwell.className = `dwell-bar dwell-${level}`;
  dwell.textContent = `${barChar} ${level}`;

  row.appendChild(link);
  row.appendChild(meta);
  row.appendChild(dwell);
  return row;
}

// ── AI Settings tab ────────────────────────────────────────────────────────

async function loadAISettings() {
  chrome.storage.local.get(['aiConfig'], result => {
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

    document.getElementById('aiEnabled').checked          = config.enabled;
    document.getElementById('ollamaUrl').value            = config.ollamaUrl;
    document.getElementById('ollamaModel').value          = config.model;
    document.getElementById('contentAnalysis').checked    = config.features.contentAnalysis;
    document.getElementById('patternRecognition').checked = config.features.patternRecognition;
    document.getElementById('topicExtraction').checked    = config.features.topicExtraction;
    document.getElementById('autoSuggest').checked        = config.features.autoSuggest;

    testConnectionStatus();
  });
}

async function testConnectionStatus() {
  const statusDiv = document.getElementById('connectionStatus');
  if (!statusDiv) return;

  statusDiv.innerHTML = '<div class="connection-status">Testing...</div>';

  const ollamaUrl = document.getElementById('ollamaUrl')?.value || 'http://localhost:11434';

  try {
    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), 5000);
    const response   = await fetch(`${ollamaUrl}/api/tags`, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (response.ok) {
      const data   = await response.json();
      const models = data.models?.length > 0
        ? data.models.map(m => m.name).join(', ')
        : 'None found';
      statusDiv.innerHTML = `
        <div class="connection-status connected">&#10003; Connected</div>
        <div style="font-size:11px;color:#6b7280;margin-top:6px;">Models: ${models}</div>
      `;
      return;
    }
  } catch {
    // fall through to disconnected state
  }

  statusDiv.innerHTML = `
    <div class="connection-status disconnected">&#10007; Not Connected</div>
    <div style="font-size:11px;color:#991b1b;margin-top:6px;">
      Cannot reach Ollama at ${document.getElementById('ollamaUrl')?.value}
    </div>
  `;
}

document.getElementById('testConnection')?.addEventListener('click', testConnectionStatus);

document.getElementById('saveAISettings')?.addEventListener('click', () => {
  const config = {
    enabled:  document.getElementById('aiEnabled').checked,
    ollamaUrl: document.getElementById('ollamaUrl').value,
    model:    document.getElementById('ollamaModel').value,
    features: {
      contentAnalysis:    document.getElementById('contentAnalysis').checked,
      patternRecognition: document.getElementById('patternRecognition').checked,
      topicExtraction:    document.getElementById('topicExtraction').checked,
      autoSuggest:        document.getElementById('autoSuggest').checked
    }
  };

  chrome.storage.local.set({ aiConfig: config }, () => {
    getActiveXTab(tab => {
      if (tab) {
        chrome.tabs.sendMessage(tab.id, { action: 'updateAIConfig', config }, response => {
          if (chrome.runtime.lastError) {
            showStatus('Settings saved. Reload X to activate.', 'success', 'aiStatus');
          } else {
            showStatus('AI settings saved.', 'success', 'aiStatus');
          }
          testConnectionStatus();
        });
      } else {
        showStatus('Settings saved. Visit X/Twitter to activate.', 'success', 'aiStatus');
      }
    });
  });
});

// ── Export / Import ────────────────────────────────────────────────────────

document.getElementById('exportData')?.addEventListener('click', () => {
  getActiveXTab(tab => {
    if (!tab) { showStatus('Open X/Twitter first', 'error'); return; }

    chrome.tabs.sendMessage(tab.id, { action: 'exportData' }, response => {
      if (chrome.runtime.lastError || !response?.data) {
        showStatus('Export failed. Reload X and try again.', 'error');
        return;
      }

      const blob = new Blob([JSON.stringify(response.data, null, 2)], { type: 'application/json' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `xat-export-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showStatus('Data exported.', 'success');
    });
  });
});

document.getElementById('importData')?.addEventListener('click', () => {
  document.getElementById('fileInput').click();
});

document.getElementById('fileInput')?.addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = event => {
    let data;
    try {
      data = JSON.parse(event.target.result);
    } catch {
      showStatus('Invalid JSON file.', 'error');
      return;
    }

    getActiveXTab(tab => {
      if (!tab) { showStatus('Open X/Twitter first', 'error'); return; }

      chrome.tabs.sendMessage(tab.id, { action: 'importData', data }, response => {
        if (chrome.runtime.lastError || !response) {
          showStatus('Import failed. Reload X and try again.', 'error');
          return;
        }
        if (response.success) {
          showStatus(`Imported ${response.imported} accounts.`, 'success');
        } else {
          showStatus(`Import failed: ${response.error}`, 'error');
        }
      });
    });
  };
  reader.readAsText(file);
});

// ── Initial load ───────────────────────────────────────────────────────────

loadCategories();
