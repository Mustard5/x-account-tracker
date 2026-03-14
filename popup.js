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
  if (avgDwell < 2000) return 'low';
  if (avgDwell < 8000) return 'med';
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

// ── Engagement score helpers ────────────────────────────────────────────────

function scoreIndicator(score) {
  if (score === null || score === undefined) {
    return { emoji: '', label: 'Not enough data', cls: 'score-none' };
  }
  const formatted = (score >= 0 ? '+' : '') + score.toFixed(1);
  if (score < -0.5) return { emoji: '🔴', label: formatted, cls: 'score-low' };
  if (score <= 0.5)  return { emoji: '🟡', label: formatted, cls: 'score-med' };
  return { emoji: '🟢', label: formatted, cls: 'score-high' };
}

function categoryAvgScore(accounts) {
  const scored = accounts.filter(a => a.engagementScore !== null && a.engagementScore !== undefined);
  if (scored.length === 0) return null;
  const avg = scored.reduce((sum, a) => sum + a.engagementScore, 0) / scored.length;
  return parseFloat(avg.toFixed(2));
}

// ── Sort / filter state ─────────────────────────────────────────────────────

let currentSort   = 'lastSeen';  // 'lastSeen' | 'engagementScore' | 'likeCount'
let currentFilter = 'all';       // 'all' | 'staleOnly' | 'hideStale'

// ── Categories tab ─────────────────────────────────────────────────────────

function renderProfiles(profiles) {
  const listEl  = document.getElementById('categoryList');
  const totalEl = document.getElementById('catTotal');

  // Apply filter
  let filtered = profiles;
  if (currentFilter === 'staleOnly') {
    filtered = profiles.filter(p => p.isStale);
  } else if (currentFilter === 'hideStale') {
    filtered = profiles.filter(p => !p.isStale);
  }

  totalEl.textContent = `${filtered.length} account${filtered.length !== 1 ? 's' : ''} observed`;

  if (filtered.length === 0) {
    listEl.innerHTML = '<div class="empty-state">No accounts match the current filter.</div>';
    return;
  }

  // Group by category
  const grouped = {};
  for (const profile of filtered) {
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
}

function loadCategories() {
  const listEl  = document.getElementById('categoryList');
  listEl.innerHTML = '<div class="loading">Loading...</div>';
  document.getElementById('catTotal').textContent = '';

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
        document.getElementById('catTotal').textContent = '0 accounts observed';
        listEl.innerHTML = '<div class="empty-state">No data yet.<br>Browse X normally — categories appear after the first Ollama batch runs (every 20 posts scrolled).</div>';
        return;
      }

      renderProfiles(profiles);
    });
  });
}

function buildCategoryRow(category, accounts) {
  const avgScore = categoryAvgScore(accounts);

  // Category badge: prefer stored scores, fall back to legacy dwell check
  let badgeHtml = '';
  if (avgScore !== null) {
    const formatted = (avgScore >= 0 ? '+' : '') + avgScore.toFixed(1);
    if (avgScore < -0.3) {
      badgeHtml = `<span class="cat-stale">⚠️ low engagement (avg: ${formatted})</span>`;
    } else if (avgScore > 0.5) {
      badgeHtml = `<span class="cat-engaged">🟢 high engagement (avg: ${formatted})</span>`;
    }
  } else {
    // Fallback: legacy dwell-based check until scores are computed
    const lowCount = accounts.filter(a => dwellLevel(a.avgDwell) === 'low').length;
    if (lowCount > accounts.length / 2) {
      badgeHtml = '<span class="cat-stale">low engagement</span>';
    }
  }

  const row = document.createElement('div');
  row.className = 'cat-row';

  const header = document.createElement('div');
  header.className = 'cat-row-header';
  header.innerHTML = `
    <span class="cat-arrow">&#9658;</span>
    <span class="cat-name">${category}</span>
    <span class="cat-count">${accounts.length} account${accounts.length !== 1 ? 's' : ''}</span>
    ${badgeHtml}
  `;

  // Account list, hidden by default
  const accountList = document.createElement('div');
  accountList.className = 'cat-accounts';

  // Sort accounts per current sort selection
  const sortedAccounts = [...accounts].sort((a, b) => {
    if (currentSort === 'engagementScore') {
      // null scores go to the bottom
      if (a.engagementScore === null && b.engagementScore === null) return 0;
      if (a.engagementScore === null) return 1;
      if (b.engagementScore === null) return -1;
      return b.engagementScore - a.engagementScore;
    }
    if (currentSort === 'likeCount') {
      return (b.likeCount || 0) - (a.likeCount || 0);
    }
    // Default: lastSeen descending
    return new Date(b.lastSeen) - new Date(a.lastSeen);
  });
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
  const { username, lastSeen, engagementScore, likeCount, isStale, staleReason } = account;
  const ind = scoreIndicator(engagementScore);

  const row = document.createElement('div');
  row.className = 'account-row';

  // @username link — built safely without innerHTML
  const link = document.createElement('a');
  link.className = 'account-link';
  link.href = `https://x.com/${encodeURIComponent(username)}`;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = `@${username}`;

  const meta = document.createElement('span');
  meta.className = 'account-meta';
  meta.textContent = relativeTime(lastSeen);

  const score = document.createElement('span');
  score.className = `account-score ${ind.cls}`;
  score.textContent = ind.emoji ? `${ind.emoji} ${ind.label}` : ind.label;

  const likes = document.createElement('span');
  likes.className = 'account-likes';
  likes.textContent = likeCount ? `${likeCount} ♥` : '';

  row.appendChild(link);
  row.appendChild(meta);
  row.appendChild(score);
  row.appendChild(likes);

  if (isStale) {
    const stale = document.createElement('span');
    stale.className = 'account-stale';
    stale.textContent = staleReason === 'not_seen' ? '👻 ghost' : '⚠️ stale';
    row.appendChild(stale);
  }

  return row;
}

// ── AI Settings tab ────────────────────────────────────────────────────────

async function fetchAndPopulateModels(currentModel) {
  const select   = document.getElementById('ollamaModel');
  const ollamaUrl = document.getElementById('ollamaUrl')?.value || 'http://localhost:11434';

  select.innerHTML = '<option value="" disabled selected>Loading…</option>';

  try {
    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), 5000);
    const response   = await fetch(`${ollamaUrl}/api/tags`, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) throw new Error('Bad response');

    const data   = await response.json();
    const models = data.models || [];

    if (models.length === 0) {
      select.innerHTML = '<option value="" disabled selected>No models found</option>';
      return;
    }

    select.innerHTML = '';
    for (const m of models) {
      const opt   = document.createElement('option');
      opt.value   = m.name;
      opt.textContent = m.name;
      if (m.name === currentModel) opt.selected = true;
      select.appendChild(opt);
    }

    // If saved model isn't in list, prepend it as a fallback option
    if (currentModel && !models.some(m => m.name === currentModel)) {
      const opt   = document.createElement('option');
      opt.value   = currentModel;
      opt.textContent = `${currentModel} (not installed)`;
      opt.selected = true;
      select.insertBefore(opt, select.firstChild);
    }
  } catch {
    select.innerHTML = '<option value="" disabled selected>Couldn\'t connect to Ollama</option>';
  }
}

async function loadAISettings() {
  chrome.storage.local.get(['aiConfig'], result => {
    const config = result.aiConfig || {
      enabled: false,
      ollamaUrl: 'http://localhost:11434',
      model: 'llama3.2:3b',
      features: {
        patternRecognition: false
      }
    };

    document.getElementById('aiEnabled').checked          = config.enabled;
    document.getElementById('ollamaUrl').value            = config.ollamaUrl;
    document.getElementById('patternRecognition').checked = config.features.patternRecognition;

    fetchAndPopulateModels(config.model);
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

document.getElementById('refreshModels')?.addEventListener('click', () => {
  const currentModel = document.getElementById('ollamaModel')?.value;
  fetchAndPopulateModels(currentModel);
});

document.getElementById('saveAISettings')?.addEventListener('click', () => {
  const config = {
    enabled:  document.getElementById('aiEnabled').checked,
    ollamaUrl: document.getElementById('ollamaUrl').value,
    model:    document.getElementById('ollamaModel').value,
    features: {
      patternRecognition: document.getElementById('patternRecognition').checked
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

document.getElementById('clearAllData')?.addEventListener('click', () => {
  if (!confirm('This will delete all collected data. Continue?')) return;

  getActiveXTab(tab => {
    if (!tab) { showStatus('Open X/Twitter first', 'error', 'aiStatus'); return; }

    chrome.tabs.sendMessage(tab.id, { action: 'clearAllData' }, response => {
      if (chrome.runtime.lastError || !response) {
        showStatus('Clear failed. Reload X and try again.', 'error', 'aiStatus');
        return;
      }
      if (response.success) {
        const { accounts = 0, interactions = 0, feedObservations = 0, accountProfiles = 0 } = response.deleted;
        showStatus(
          `Cleared ${accounts} accounts, ${interactions} interactions, ${feedObservations} observations, ${accountProfiles} profiles.`,
          'success',
          'aiStatus'
        );
      } else {
        showStatus(`Clear failed: ${response.error}`, 'error', 'aiStatus');
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

      const timestamp = new Date().toISOString().replace('T', '_').slice(0, 16).replace(':', '-');
      const blob = new Blob([JSON.stringify(response.data, null, 2)], { type: 'application/json' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `xat-export-${timestamp}.json`;
      a.click();
      URL.revokeObjectURL(url);

      const { accounts = [], interactions = [], feedObservations = [], accountProfiles = [] } = response.data;
      showStatus(
        `Exported ${accounts.length} accounts, ${interactions.length} interactions, ${feedObservations.length} observations, ${accountProfiles.length} profiles.`,
        'success'
      );
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

    if (!confirm('This will overwrite existing data in all stores. Continue?')) return;

    getActiveXTab(tab => {
      if (!tab) { showStatus('Open X/Twitter first', 'error'); return; }

      chrome.tabs.sendMessage(tab.id, { action: 'importData', data }, response => {
        if (chrome.runtime.lastError || !response) {
          showStatus('Import failed. Reload X and try again.', 'error');
          return;
        }
        if (response.success) {
          if (response.version === 2) {
            const { accounts = 0, interactions = 0, feedObservations = 0, accountProfiles = 0 } = response.imported;
            showStatus(
              `Imported ${accounts} accounts, ${interactions} interactions, ${feedObservations} observations, ${accountProfiles} profiles.`,
              'success'
            );
          } else {
            showStatus(`Imported ${response.imported.accounts} accounts.`, 'success');
          }
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

document.getElementById('catSort')?.addEventListener('change', e => {
  currentSort = e.target.value;
  loadCategories();
});

document.getElementById('catFilter')?.addEventListener('change', e => {
  currentFilter = e.target.value;
  loadCategories();
});
