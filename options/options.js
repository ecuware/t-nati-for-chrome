'use strict';

class OptionsController {
  constructor() {
    this.elements = {
      defaultColor: document.getElementById('defaultColor'),
      autoHighlight: document.getElementById('autoHighlight'),
      darkMode: document.getElementById('darkMode'),
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

    this.settings = {
      defaultColor: '',
      autoHighlight: false,
      darkMode: false,
      animationSpeed: 'normal',
    };
  }

  async init() {
    await this.loadSettings();
    await this.updateStorageInfo();
    this.bindEvents();
    this.renderSettings();
  }

  bindEvents() {
    this.elements.saveButton.addEventListener('click', () => this.saveSettings());
    this.elements.clearAllData.addEventListener('click', () => this.clearAllData());
    this.elements.exportData.addEventListener('click', () => this.exportData());
    this.elements.importData.addEventListener('click', () => this.elements.importFile.click());
    this.elements.importFile.addEventListener('change', (e) => this.importData(e));
  }

  async loadSettings() {
    try {
      const result = await chrome.storage.sync.get(['tenatiSettings']);
      if (result.tenatiSettings) {
        this.settings = { ...this.settings, ...result.tenatiSettings };
      }
    } catch (err) {
      console.warn('[tenati] Failed to load settings:', err);
    }
  }

  renderSettings() {
    this.elements.defaultColor.value = this.settings.defaultColor || '';
    this.elements.autoHighlight.checked = this.settings.autoHighlight || false;
    this.elements.darkMode.checked = this.settings.darkMode || false;
    this.elements.animationSpeed.value = this.settings.animationSpeed || 'normal';
  }

  async saveSettings() {
    this.settings = {
      defaultColor: this.elements.defaultColor.value,
      autoHighlight: this.elements.autoHighlight.checked,
      darkMode: this.elements.darkMode.checked,
      animationSpeed: this.elements.animationSpeed.value,
    };

    try {
      await chrome.storage.sync.set({ tenatiSettings: this.settings });
      this.showStatus('Settings saved!', true);
      
      // Notify content scripts to reload settings
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach((tab) => {
          chrome.tabs.sendMessage(tab.id, { type: 'tenati:settingsUpdated' }).catch(() => {});
        });
      });
    } catch (err) {
      console.error('[tenati] Failed to save settings:', err);
      this.showStatus('Failed to save settings', false);
    }
  }

  showStatus(message, success = true) {
    this.elements.saveStatus.textContent = message;
    this.elements.saveStatus.className = `options-status ${success ? 'show' : 'show error'}`;
    
    setTimeout(() => {
      this.elements.saveStatus.classList.remove('show');
    }, 3000);
  }

  async updateStorageInfo() {
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
      }
    } catch (err) {
      console.warn('[tenati] Failed to get storage info:', err);
      this.elements.storageText.textContent = 'Unable to calculate storage usage';
    }
  }

  async clearAllData() {
    if (!confirm('Are you sure you want to delete ALL highlights from ALL pages? This action cannot be undone.')) {
      return;
    }

    try {
      // Get all storage keys
      const allData = await chrome.storage.local.get(null);
      const tenatiKeys = Object.keys(allData).filter(key => key.startsWith('tenati::'));
      
      // Remove all highlight data
      await chrome.storage.local.remove(tenatiKeys);
      
      this.showStatus('All highlights cleared!', true);
      await this.updateStorageInfo();
      
      // Notify content scripts
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach((tab) => {
          chrome.tabs.sendMessage(tab.id, { type: 'tenati:clearAll' }).catch(() => {});
        });
      });
    } catch (err) {
      console.error('[tenati] Failed to clear data:', err);
      this.showStatus('Failed to clear data', false);
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

      this.showStatus('Data exported!', true);
    } catch (err) {
      console.error('[tenati] Failed to export data:', err);
      this.showStatus('Failed to export data', false);
    }
  }

  async importData(event) {
    const file = event.target.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      // Validate data structure
      const isValid = Object.keys(data).every(key => key.startsWith('tenati::'));
      if (!isValid) {
        throw new Error('Invalid data format');
      }

      if (!confirm(`This will import ${Object.keys(data).length} highlight entries. Continue?`)) {
        return;
      }

      await chrome.storage.local.set(data);
      this.showStatus('Data imported!', true);
      await this.updateStorageInfo();

      // Notify content scripts to reload
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach((tab) => {
          chrome.tabs.sendMessage(tab.id, { type: 'tenati:reload' }).catch(() => {});
        });
      });
    } catch (err) {
      console.error('[tenati] Failed to import data:', err);
      this.showStatus('Failed to import data. Please check the file format.', false);
    } finally {
      event.target.value = '';
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new OptionsController().init();
});

