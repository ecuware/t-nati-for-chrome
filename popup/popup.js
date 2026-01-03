'use strict';

const ICONS = {
  focus: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
  </svg>`,
  delete: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
  </svg>`,
};

const STRINGS = {
  headingTitle: 'Highlights',
  actionClearAll: 'Clear all',
  exportHighlights: 'Export Markdown',
  exportPage: 'Export PDF',
  statusLoading: 'Loading…',
  statusTabReadFailed: 'Unable to read the active tab.',
  statusNoTab: 'Open a tab to manage highlights.',
  statusUnavailable: 'Extension not active on this page.',
  statusEmpty: 'No highlights yet.',
  statusExportPreparing: 'Preparing export…',
  statusExportEmpty: 'No highlights to export.',
  statusExportComplete: 'Export complete.',
  statusExportFailed: 'Export failed.',
  statusPdfOpening: 'Opening print dialog…',
  statusPdfReady: 'Choose "Save as PDF".',
  statusPdfFailed: 'PDF export failed.',
  statusFocusFailed: 'Could not focus highlight.',
  statusDeleteFailed: 'Could not delete highlight.',
  statusClearFailed: 'Could not clear highlights.',
  tooltipFocus: 'Scroll to highlight',
  tooltipDelete: 'Delete highlight',
  fallbackText: 'Unknown selection',
  markdownTitle: 'Highlights for',
  markdownUrl: 'URL',
  markdownExported: 'Exported',
  markdownHighlight: 'Highlight',
};

class PopupController {
  constructor() {
    this.elements = {
      // Tabs
      tabHighlights: document.getElementById('tabHighlights'),
      tabSettings: document.getElementById('tabSettings'),
      viewHighlights: document.getElementById('viewHighlights'),
      viewSettings: document.getElementById('viewSettings'),
      // Highlights view
      list: document.getElementById('highlightList'),
      status: document.getElementById('status'),
      clearBtn: document.getElementById('clearButton'),
      urlLabel: document.getElementById('popup-url'),
      exportMdBtn: document.getElementById('exportHighlightsButton'),
      exportPdfBtn: document.getElementById('exportPageButton'),
      // Settings view
      defaultColor: document.getElementById('defaultColor'),
      autoHighlight: document.getElementById('autoHighlight'),
      theme: document.getElementById('theme'),
      animationSpeed: document.getElementById('animationSpeed'),
      storageBar: document.getElementById('storageBar'),
      storageText: document.getElementById('storageText'),
      clearAllData: document.getElementById('clearAllData'),
      exportData: document.getElementById('exportData'),
      importData: document.getElementById('importData'),
      importFile: document.getElementById('importFile'),
      saveButton: document.getElementById('saveButton'),
      saveStatus: document.getElementById('saveStatus'),
    };

    this.tabId = null;
    this.tabUrl = '';
    this.tabTitle = '';
    this.highlights = [];
    this.statusKey = null;
    this.currentView = 'highlights';
    this.settings = {
      defaultColor: '',
      autoHighlight: false,
      theme: 'dark',
      animationSpeed: 'normal',
    };
  }

  async init() {
    try {
      this.bindEvents();
      await this.loadSettings();
      await this.loadTab();
      await this.updateStorageInfo();
    } catch (err) {
      console.warn('[tenati] Init failed:', err);
      this.setStatus('statusTabReadFailed');
    }
  }

  bindEvents() {
    // Tab switching
    this.elements.tabHighlights.addEventListener('click', () => this.switchView('highlights'));
    this.elements.tabSettings.addEventListener('click', () => this.switchView('settings'));

    // Highlights view events
    this.elements.clearBtn.addEventListener('click', () => this.clearAll());
    this.elements.exportMdBtn.addEventListener('click', () => this.exportMarkdown());
    this.elements.exportPdfBtn.addEventListener('click', () => this.exportPdf());

    // Settings view events
    this.elements.saveButton.addEventListener('click', () => this.saveSettings());
    this.elements.clearAllData.addEventListener('click', () => this.clearAllData());
    this.elements.exportData.addEventListener('click', () => this.exportData());
    this.elements.importData.addEventListener('click', () => this.elements.importFile.click());
    this.elements.importFile.addEventListener('change', (e) => this.importData(e));
    if (this.elements.theme) {
      this.elements.theme.addEventListener('change', (e) => {
        this.applyTheme(e.target.value);
      });
    }
  }

  switchView(view) {
    this.currentView = view;

    // Update tabs
    this.elements.tabHighlights.classList.toggle('popup-tab--active', view === 'highlights');
    this.elements.tabSettings.classList.toggle('popup-tab--active', view === 'settings');

    // Update views
    this.elements.viewHighlights.classList.toggle('popup-view--active', view === 'highlights');
    this.elements.viewSettings.classList.toggle('popup-view--active', view === 'settings');

    // Update storage info when switching to settings
    if (view === 'settings') {
      this.updateStorageInfo();
    }
  }

  async loadSettings() {
    try {
      const result = await chrome.storage.sync.get(['tenatiSettings']);
      if (result.tenatiSettings) {
        this.settings = { ...this.settings, ...result.tenatiSettings };
      }
      this.renderSettings();
    } catch (err) {
      console.warn('[tenati] Failed to load settings:', err);
    }
  }

  renderSettings() {
    if (this.elements.defaultColor) this.elements.defaultColor.value = this.settings.defaultColor || '';
    if (this.elements.autoHighlight) this.elements.autoHighlight.checked = this.settings.autoHighlight || false;
    if (this.elements.theme) this.elements.theme.value = this.settings.theme || 'dark';
    if (this.elements.animationSpeed) this.elements.animationSpeed.value = this.settings.animationSpeed || 'normal';
    this.applyTheme(this.settings.theme || 'dark');
  }

  async saveSettings() {
    this.settings = {
      defaultColor: this.elements.defaultColor.value,
      autoHighlight: this.elements.autoHighlight.checked,
      theme: this.elements.theme.value,
      animationSpeed: this.elements.animationSpeed.value,
    };

    this.applyTheme(this.settings.theme);

    try {
      await chrome.storage.sync.set({ tenatiSettings: this.settings });
      this.showSettingsStatus('Settings saved!', true);
      
      // Notify content scripts to reload settings
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach((tab) => {
          chrome.tabs.sendMessage(tab.id, { type: 'tenati:settingsUpdated' }).catch(() => {});
        });
      });
    } catch (err) {
      console.error('[tenati] Failed to save settings:', err);
      this.showSettingsStatus('Failed to save settings', false);
    }
  }

  showSettingsStatus(message, success = true) {
    if (!this.elements.saveStatus) return;
    this.elements.saveStatus.textContent = message;
    this.elements.saveStatus.className = `popup-settings-status ${success ? 'show' : 'show error'}`;
    
    setTimeout(() => {
      this.elements.saveStatus.classList.remove('show');
    }, 3000);
  }

  async updateStorageInfo() {
    if (!this.elements.storageBar || !this.elements.storageText) return;

    try {
      const usage = await new Promise((resolve) => {
        chrome.storage.local.getBytesInUse(null, (bytes) => {
          if (chrome.runtime.lastError) {
            resolve({ used: 0, quota: 0 });
          } else {
            const quota = chrome.storage.local.QUOTA_BYTES || 5242880;
            resolve({ used: bytes, quota });
          }
        });
      });

      const percentage = usage.quota > 0 ? (usage.used / usage.quota) * 100 : 0;
      const usedMB = (usage.used / 1024 / 1024).toFixed(2);
      const quotaMB = (usage.quota / 1024 / 1024).toFixed(2);

      this.elements.storageBar.style.width = `${Math.min(percentage, 100)}%`;
      this.elements.storageText.textContent = `${usedMB} MB / ${quotaMB} MB (${percentage.toFixed(1)}%)`;

      if (percentage > 90) {
        this.elements.storageBar.style.background = 'linear-gradient(90deg, #ff6b6b 0%, #ff8585 100%)';
      } else if (percentage > 70) {
        this.elements.storageBar.style.background = 'linear-gradient(90deg, #ffa94d 0%, #ffb84d 100%)';
      } else {
        this.elements.storageBar.style.background = 'linear-gradient(90deg, var(--accent) 0%, var(--accent-hover) 100%)';
      }
    } catch (err) {
      console.warn('[tenati] Failed to get storage info:', err);
      if (this.elements.storageText) {
        this.elements.storageText.textContent = 'Unable to calculate storage usage';
      }
    }
  }

  async clearAllData() {
    if (!confirm('Are you sure you want to delete ALL highlights from ALL pages? This action cannot be undone.')) {
      return;
    }

    try {
      const allData = await chrome.storage.local.get(null);
      const tenatiKeys = Object.keys(allData).filter(key => key.startsWith('tenati::'));
      
      await chrome.storage.local.remove(tenatiKeys);
      
      this.showSettingsStatus('All highlights cleared!', true);
      await this.updateStorageInfo();
      
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach((tab) => {
          chrome.tabs.sendMessage(tab.id, { type: 'tenati:clearAll' }).catch(() => {});
        });
      });
    } catch (err) {
      console.error('[tenati] Failed to clear data:', err);
      this.showSettingsStatus('Failed to clear data', false);
    }
  }

  async exportData() {
    try {
      const allData = await chrome.storage.local.get(null);
      const tenatiData = {};
      
      Object.keys(allData).forEach(key => {
        if (key.startsWith('tenati::')) {
          tenatiData[key] = allData[key];
        }
      });

      const blob = new Blob([JSON.stringify(tenatiData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `tenati-backup-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      this.showSettingsStatus('Data exported!', true);
    } catch (err) {
      console.error('[tenati] Failed to export data:', err);
      this.showSettingsStatus('Failed to export data', false);
    }
  }

  async importData(event) {
    const file = event.target.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      const isValid = Object.keys(data).every(key => key.startsWith('tenati::'));
      if (!isValid) {
        throw new Error('Invalid data format');
      }

      if (!confirm(`This will import ${Object.keys(data).length} highlight entries. Continue?`)) {
        return;
      }

      await chrome.storage.local.set(data);
      this.showSettingsStatus('Data imported!', true);
      await this.updateStorageInfo();

      chrome.tabs.query({}, (tabs) => {
        tabs.forEach((tab) => {
          chrome.tabs.sendMessage(tab.id, { type: 'tenati:reload' }).catch(() => {});
        });
      });
    } catch (err) {
      console.error('[tenati] Failed to import data:', err);
      this.showSettingsStatus('Failed to import data. Please check the file format.', false);
    } finally {
      event.target.value = '';
    }
  }

  applyTheme(theme) {
    const root = document.documentElement;
    if (theme === 'light') {
      root.style.setProperty('--bg-primary', '#ffffff');
      root.style.setProperty('--bg-secondary', '#f5f5f5');
      root.style.setProperty('--bg-tertiary', '#e8e8e8');
      root.style.setProperty('--bg-hover', '#e0e0e0');
      root.style.setProperty('--text-primary', '#1a1a1a');
      root.style.setProperty('--text-secondary', '#666666');
      root.style.setProperty('--text-muted', '#999999');
      root.style.setProperty('--border-subtle', 'rgba(0, 0, 0, 0.1)');
      root.style.setProperty('--border-hover', 'rgba(0, 0, 0, 0.2)');
    } else {
      root.style.setProperty('--bg-primary', '#0f0f12');
      root.style.setProperty('--bg-secondary', '#18181d');
      root.style.setProperty('--bg-tertiary', '#222228');
      root.style.setProperty('--bg-hover', '#2a2a32');
      root.style.setProperty('--text-primary', '#f4f4f7');
      root.style.setProperty('--text-secondary', '#a0a0b0');
      root.style.setProperty('--text-muted', '#6b6b7a');
      root.style.setProperty('--border-subtle', 'rgba(255, 255, 255, 0.08)');
      root.style.setProperty('--border-hover', 'rgba(255, 255, 255, 0.15)');
    }
  }

  async loadTab() {
    const tab = await this.getActiveTab();
    if (!tab?.id) {
      this.setStatus('statusNoTab');
      this.disableAll();
      return;
    }

    this.tabId = tab.id;
    this.tabUrl = tab.url || '';
    this.tabTitle = tab.title || '';
    if (this.elements.urlLabel) {
      this.elements.urlLabel.textContent = this.formatUrl(this.tabUrl);
    }
    if (this.elements.exportPdfBtn) {
      this.elements.exportPdfBtn.disabled = false;
    }

    await this.refreshHighlights();
  }

  async refreshHighlights() {
    if (!this.tabId) return;

    this.setStatus('statusLoading');
    if (this.elements.list) {
      this.elements.list.hidden = true;
    }

    try {
      // Check if content script is ready
      const isReady = await this.checkContentScriptReady();
      if (!isReady) {
        this.setStatus('statusUnavailable');
        this.disableAll();
        return;
      }

      const res = await this.sendCommand('getHighlights');
      if (!res) {
        throw new Error('No response from content script');
      }
      this.highlights = Array.isArray(res?.highlights) ? res.highlights : [];
      this.renderList();
    } catch (err) {
      console.warn('[tenati] Fetch failed:', err);
      this.setStatus('statusUnavailable');
      this.disableAll();
    }
  }

  renderList() {
    const { list, clearBtn, exportMdBtn } = this.elements;
    if (!list) return;

    list.innerHTML = '';

    if (!this.highlights.length) {
      this.setStatus('statusEmpty');
      if (clearBtn) clearBtn.disabled = true;
      if (exportMdBtn) exportMdBtn.disabled = true;
      list.hidden = true;
      return;
    }

    this.clearStatus();
    list.hidden = false;
    if (clearBtn) clearBtn.disabled = false;
    if (exportMdBtn) exportMdBtn.disabled = false;

    const sorted = [...this.highlights].sort((a, b) => b.createdAt - a.createdAt);

    for (const entry of sorted) {
      const li = document.createElement('li');
      li.className = 'popup-item';

      const mainBtn = document.createElement('button');
      mainBtn.type = 'button';
      mainBtn.className = 'popup-item-main';
      mainBtn.addEventListener('click', () => this.focusHighlight(entry.id));

      const dot = document.createElement('span');
      dot.className = 'popup-item-dot';
      dot.style.background = entry.color || '#888';

      const text = document.createElement('span');
      text.className = 'popup-item-text';
      text.textContent = entry.textSnippet || STRINGS.fallbackText;

      mainBtn.append(dot, text);

      const actions = document.createElement('div');
      actions.className = 'popup-item-actions';

      const focusBtn = this.createIconBtn(ICONS.focus, STRINGS.tooltipFocus, () => {
        this.focusHighlight(entry.id);
      });

      const delBtn = this.createIconBtn(ICONS.delete, STRINGS.tooltipDelete, () => {
        this.deleteHighlight(entry.id);
      }, 'popup-item-btn--delete');

      actions.append(focusBtn, delBtn);
      li.append(mainBtn, actions);
      list.appendChild(li);
    }
  }

  createIconBtn(icon, title, onClick, extraClass = '') {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `popup-item-btn ${extraClass}`.trim();
    btn.innerHTML = icon;
    btn.title = title;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      onClick();
    });
    return btn;
  }

  async focusHighlight(id) {
    if (!id) return;
    try {
      await this.sendCommand('focusHighlight', { id });
    } catch (err) {
      console.warn('[tenati] Focus failed:', err);
      this.setStatus('statusFocusFailed');
    }
  }

  async deleteHighlight(id) {
    if (!id) return;
    this.elements.clearBtn.disabled = true;
    try {
      await this.sendCommand('deleteHighlight', { id });
      await this.refreshHighlights();
    } catch (err) {
      console.warn('[tenati] Delete failed:', err);
      this.setStatus('statusDeleteFailed');
    }
  }

  async clearAll() {
    if (!this.tabId || this.elements.clearBtn.disabled) return;
    this.elements.clearBtn.disabled = true;
    try {
      await this.sendCommand('clearHighlights');
      await this.refreshHighlights();
    } catch (err) {
      console.warn('[tenati] Clear failed:', err);
      this.setStatus('statusClearFailed');
    }
  }

  async exportMarkdown() {
    if (!this.tabId || this.elements.exportMdBtn.disabled) return;
    this.elements.exportMdBtn.disabled = true;
    this.setStatus('statusExportPreparing');

    try {
      const res = await this.sendCommand('collectHighlights');
      const items = Array.isArray(res?.highlights) ? res.highlights : [];

      if (!items.length) {
        this.setStatus('statusExportEmpty');
        return;
      }

      const md = this.buildMarkdown(items);
      this.downloadFile(md, `${this.slugify(this.tabTitle || 'page')}-highlights.md`, 'text/markdown');
      this.setStatus('statusExportComplete');
    } catch (err) {
      console.warn('[tenati] Export failed:', err);
      this.setStatus('statusExportFailed');
    } finally {
      this.elements.exportMdBtn.disabled = false;
    }
  }

  async exportPdf() {
    if (!this.tabId || this.elements.exportPdfBtn.disabled) return;
    this.elements.exportPdfBtn.disabled = true;
    this.setStatus('statusPdfOpening');

    try {
      await this.sendCommand('exportPagePdf');
      this.setStatus('statusPdfReady');
    } catch (err) {
      console.warn('[tenati] PDF export failed:', err);
      this.setStatus('statusPdfFailed');
    } finally {
      this.elements.exportPdfBtn.disabled = false;
    }
  }

  buildMarkdown(items) {
    const lines = [
      `# ${STRINGS.markdownTitle} ${this.tabTitle || 'Untitled'}`,
      '',
      `- ${STRINGS.markdownUrl}: ${this.tabUrl || 'Unknown'}`,
      `- ${STRINGS.markdownExported}: ${new Date().toISOString()}`,
      '',
    ];

    items.sort((a, b) => a.createdAt - b.createdAt).forEach((item, i) => {
      const color = item.color ? ` \`${item.color}\`` : '';
      const body = item.htmlContent ? this.htmlToMd(item.htmlContent) : item.textSnippet || '';
      lines.push(`## ${STRINGS.markdownHighlight} ${i + 1}${color}`, '', body || '_No text_', '');
    });

    return lines.join('\n').trim() + '\n';
  }

  htmlToMd(html) {
    const div = document.createElement('div');
    div.innerHTML = html;

    const convert = (node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        return (node.textContent || '').replace(/([_*`[\]])/g, '\\$1');
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return '';

      const children = Array.from(node.childNodes).map(convert).join('');
      const tag = node.tagName;

      if (tag === 'STRONG' || tag === 'B') return children ? `**${children}**` : '';
      if (tag === 'EM' || tag === 'I') return children ? `_${children}_` : '';
      if (tag === 'CODE') return children ? `\`${children}\`` : '';
      if (tag === 'BR') return '\n';
      if (tag === 'A' && node.href) return `[${children || node.href}](${node.href})`;
      if (tag === 'UL') return '\n' + Array.from(node.children).map((li) => `- ${convert(li).trim()}`).join('\n') + '\n';
      if (tag === 'OL') return '\n' + Array.from(node.children).map((li, i) => `${i + 1}. ${convert(li).trim()}`).join('\n') + '\n';
      if (['P', 'DIV', 'SECTION', 'ARTICLE', 'LI'].includes(tag)) return `\n${children}\n`;

      return children;
    };

    return Array.from(div.childNodes).map(convert).join('').replace(/\n{3,}/g, '\n\n').trim();
  }

  downloadFile(content, filename, mime) {
    const blob = new Blob([content], { type: `${mime};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  slugify(text) {
    return (text || 'page').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'page';
  }

  formatUrl(url) {
    try {
      return new URL(url).hostname;
    } catch {
      return url || '';
    }
  }

  disableAll() {
    if (this.elements.clearBtn) this.elements.clearBtn.disabled = true;
    if (this.elements.exportMdBtn) this.elements.exportMdBtn.disabled = true;
    if (this.elements.exportPdfBtn) this.elements.exportPdfBtn.disabled = true;
  }

  setStatus(key) {
    this.statusKey = key;
    if (this.elements.status) {
      this.elements.status.hidden = false;
      this.elements.status.textContent = STRINGS[key] || key;
    }
  }

  clearStatus() {
    this.statusKey = null;
    if (this.elements.status) {
      this.elements.status.hidden = true;
      this.elements.status.textContent = '';
    }
  }

  getActiveTab() {
    if (typeof chrome === 'undefined' || !chrome.tabs?.query) {
      return Promise.resolve(null);
    }
    return new Promise((resolve, reject) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (chrome.runtime?.lastError) reject(chrome.runtime.lastError);
        else resolve(tabs[0]);
      });
    });
  }

  async checkContentScriptReady() {
    if (!this.tabId || typeof chrome === 'undefined' || !chrome.tabs?.sendMessage) {
      return false;
    }

    // Try to ping content script, retry up to 3 times
    for (let i = 0; i < 3; i++) {
      try {
        const msg = { type: 'tenati:ping' };
        await new Promise((resolve, reject) => {
          chrome.tabs.sendMessage(this.tabId, msg, (res) => {
            if (chrome.runtime?.lastError) {
              reject(chrome.runtime.lastError);
            } else {
              resolve(res);
            }
          });
        });
        return true;
      } catch (err) {
        if (i < 2) {
          // Wait a bit before retrying
          await new Promise(resolve => setTimeout(resolve, 100));
        } else {
          console.warn('[tenati] Content script not ready after retries:', err);
        }
      }
    }
    return false;
  }

  sendCommand(command, payload = {}) {
    if (!this.tabId) return Promise.reject(new Error('No tab'));
    if (typeof chrome === 'undefined' || !chrome.tabs?.sendMessage) {
      return Promise.reject(new Error('Chrome API not available'));
    }

    const msg = { type: 'tenati:popup', command, payload };
    return new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(this.tabId, msg, (res) => {
        if (chrome.runtime?.lastError) {
          const error = chrome.runtime.lastError.message || chrome.runtime.lastError;
          reject(new Error(`Message failed: ${error}`));
        } else {
          resolve(res);
        }
      });
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new PopupController().init();
});
