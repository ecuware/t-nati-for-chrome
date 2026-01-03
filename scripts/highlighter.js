'use strict';

(() => {
  if (window.__tenatiInjected) return;
  window.__tenatiInjected = true;

  const ICONS = {
    highlighter: `<svg class="tenati-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <path d="m9 11-6 6v3h9l3-3"/><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"/>
    </svg>`,
    trash: `<svg class="tenati-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
    </svg>`,
  };

  const COLORS = [
    { name: 'Apricot', value: '#FFD3B6' },
    { name: 'Coral', value: '#FFAAA5' },
    { name: 'Pistachio', value: '#C5E1A5' },
    { name: 'Mint', value: '#B2DFDB' },
    { name: 'Periwinkle', value: '#C7CEEA' },
    { name: 'Lavender', value: '#D7C0F7' },
  ];

  const PAGE_KEY = `tenati::${location.href.split('#')[0]}`;

  class Highlighter {
    constructor() {
      this.highlights = [];
      this.savedRange = null;
      this.editingId = null;
      this.anchorRect = null;
      this.hoverTimer = null;
      this.saveTimer = null;
      this.pendingSave = false;
      this.markCache = new Map();
      this.storage = this.createStorage();
      this.elements = {};
      this.eventHandlers = [];
      this.isDestroyed = false;
      this.loadingState = false;
      this.settings = {
        defaultColor: '',
        autoHighlight: false,
        animationSpeed: 'normal',
      };
    }

    async init() {
      this.createUI();
      this.bindEvents();
      this.setupCleanup();
      await this.loadSettings();
      await this.loadHighlights();
      this.setupBridge();
    }

    async loadSettings() {
      try {
        const result = await chrome.storage.sync.get(['tenatiSettings']);
        if (result.tenatiSettings) {
          this.settings = result.tenatiSettings;
        }
      } catch (err) {
        console.warn('[tenati] Failed to load settings:', err);
      }
    }

    setupCleanup() {
      // Cleanup on page unload
      window.addEventListener('beforeunload', () => {
        this.destroy();
      });

      // Cleanup on visibility change
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          this.cleanupTimers();
        }
      });
    }

    cleanupTimers() {
      if (this.hoverTimer) {
        clearTimeout(this.hoverTimer);
        this.hoverTimer = null;
      }
      if (this.saveTimer) {
        clearTimeout(this.saveTimer);
        this.saveTimer = null;
      }
    }

    destroy() {
      if (this.isDestroyed) return;
      this.isDestroyed = true;

      // Cleanup timers
      this.cleanupTimers();

      // Clear cache
      this.markCache.clear();

      // Remove event listeners
      this.eventHandlers.forEach(({ element, event, handler }) => {
        element.removeEventListener(event, handler);
      });
      this.eventHandlers = [];

      // Clear highlights from DOM
      this.highlights.forEach((h) => this.removeMarks(h.id));

      // Save pending changes
      if (this.pendingSave) {
        this.storage.set(PAGE_KEY, this.highlights).catch(() => {});
      }
    }

    createUI() {
      this.elements.root = this.createElement('div', 'tenati-root');
      this.elements.root.innerHTML = `
        <button type="button" class="tenati-fab" aria-label="Highlight">
          <span class="tenati-fab-icon">${ICONS.highlighter}</span>
          <span class="tenati-fab-label">Highlight</span>
        </button>
      `;

      this.elements.panel = this.createElement('div', 'tenati-panel-flyout');
      this.elements.panel.innerHTML = `
        <div class="tenati-panel">
          <div class="tenati-panel-header">
            <span class="tenati-panel-title">Highlight</span>
            <span class="tenati-panel-subtitle">Pick a color</span>
          </div>
          <div class="tenati-panel-hint" hidden>Editing highlight</div>
          <div class="tenati-color-grid"></div>
        </div>
      `;

      const grid = this.elements.panel.querySelector('.tenati-color-grid');
      for (const { name, value } of COLORS) {
        const btn = this.createElement('button', 'tenati-color-chip');
        btn.dataset.color = value;
        btn.innerHTML = `
          <span class="tenati-color-dot" style="background:${value}"></span>
          <span class="tenati-color-label">${name}</span>
        `;
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.handleColorClick(value);
        });
        grid.appendChild(btn);
      }

      this.elements.bubble = this.createElement('div', 'tenati-action-bubble');
      this.elements.bubble.innerHTML = `
        <button type="button" class="tenati-action-button tenati-action-highlight">${ICONS.highlighter}<span>Highlight</span></button>
        <button type="button" class="tenati-action-button tenati-action-delete">${ICONS.trash}<span>Delete</span></button>
      `;

      document.documentElement.append(this.elements.root, this.elements.panel, this.elements.bubble);

      this.elements.fab = this.elements.root.querySelector('.tenati-fab');
      this.elements.hint = this.elements.panel.querySelector('.tenati-panel-hint');
      this.elements.highlightBtn = this.elements.bubble.querySelector('.tenati-action-highlight');
      this.elements.deleteBtn = this.elements.bubble.querySelector('.tenati-action-delete');
    }

    bindEvents() {
      const { root, panel, fab, highlightBtn, deleteBtn } = this.elements;

      fab.addEventListener('pointerenter', () => this.openPanel());
      fab.addEventListener('click', (e) => {
        e.preventDefault();
        this.togglePanel();
      });

      highlightBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (this.editingId) this.focusHighlight(this.editingId, true);
      });

      deleteBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (this.editingId) this.eraseHighlight(this.editingId);
      });

      [root, panel].forEach((el) => {
        el.addEventListener('pointerenter', () => {
          clearTimeout(this.hoverTimer);
          this.openPanel();
        });
        el.addEventListener('pointerleave', () => {
          clearTimeout(this.hoverTimer);
          this.hoverTimer = setTimeout(() => panel.classList.remove('tenati-panel-open'), 120);
        });
        el.addEventListener('mousedown', (e) => e.preventDefault());
      });

      document.addEventListener('click', (e) => {
        const hl = e.target.closest?.('.tenati-highlight');
        if (hl) {
          e.preventDefault();
          this.focusHighlight(hl.dataset.tenatiId);
        }
      });

      document.addEventListener('pointerdown', (e) => {
        if (!root.contains(e.target) && !panel.contains(e.target) &&
            !e.target.closest?.('.tenati-highlight') && !this.elements.bubble.contains(e.target)) {
          this.hideUI();
          this.clearEditing();
        }
      });

      const handleScroll = this.throttle(() => {
        this.hideUI();
        this.hideBubble();
      }, 100);

      const scrollHandler = (e) => handleScroll(e);
      document.addEventListener('scroll', scrollHandler, { passive: true });
      this.eventHandlers.push({ element: document, event: 'scroll', handler: scrollHandler });

      const handleResize = this.throttle(() => {
        this.hideBubble();
        if (panel.classList.contains('tenati-panel-open')) this.positionPanel();
      }, 150);

      const resizeHandler = () => handleResize();
      window.addEventListener('resize', resizeHandler);
      this.eventHandlers.push({ element: window, event: 'resize', handler: resizeHandler });

      const handleSelection = this.debounce(() => {
        const sel = window.getSelection();
        const isPanelOpen = panel.classList.contains('tenati-panel-open');
        const isVisible = root.classList.contains('tenati-visible');

        if (!sel || !sel.rangeCount || sel.isCollapsed) {
          if ((isPanelOpen || isVisible) && this.savedRange) return;
          this.hideUI();
          return;
        }

        if (root.contains(sel.anchorNode) || panel.contains(sel.anchorNode)) return;

        const range = sel.getRangeAt(0);
        const rect = this.getVisibleRect(range);
        if (!rect) {
          if ((isPanelOpen || isVisible) && this.savedRange) return;
          this.hideUI();
          return;
        }

        this.savedRange = range.cloneRange();
        this.clearEditing();
        this.positionUI(rect);
        this.showUI();
      }, 60);

      document.addEventListener('selectionchange', handleSelection);
      document.addEventListener('keyup', handleSelection);
      document.addEventListener('pointerup', handleSelection);
    }

    async handleColorClick(color) {
      if (this.editingId) {
        await this.restyleHighlight(this.editingId, color);
      } else {
        await this.applyHighlight(color);
      }
    }

    async loadHighlights() {
      this.setLoadingState(true);
      try {
        const stored = await this.storage.get(PAGE_KEY);
        if (Array.isArray(stored)) {
          // Sanitize stored data
          this.highlights = stored.map((entry) => ({
            ...entry,
            textSnippet: this.sanitizeHTML(entry.textSnippet || ''),
          }));
        }
      } catch (err) {
        console.warn('[tenati] Load failed:', err);
      } finally {
        this.setLoadingState(false);
      }

      if (!this.highlights.length) return;

      // Restore visible highlights first
      const viewport = {
        top: window.scrollY,
        bottom: window.scrollY + window.innerHeight,
      };

      const failed = [];
      let restoredCount = 0;
      const maxInitialRestore = 50; // İlk yüklemede maksimum restore sayısı

      this.setLoadingState(true);
      for (const entry of this.highlights) {
        // İlk 50 highlight'ı hemen restore et, sonrasını lazy load
        if (restoredCount < maxInitialRestore) {
          if (!this.restoreHighlight(entry)) {
            failed.push(entry.id);
          }
          restoredCount++;
        } else {
          // Kalan highlight'ları lazy load et
          break;
        }
      }
      this.setLoadingState(false);

      // Lazy load remaining highlights
      if (this.highlights.length > maxInitialRestore) {
        const remainingHighlights = this.highlights.slice(maxInitialRestore);
        if ('requestIdleCallback' in window) {
          requestIdleCallback(() => {
            this.restoreRemainingHighlights(remainingHighlights, failed);
          }, { timeout: 2000 });
        } else {
          setTimeout(() => {
            this.restoreRemainingHighlights(remainingHighlights, failed);
          }, 1000);
        }
      } else {
        if (failed.length) {
          this.highlights = this.highlights.filter((h) => !failed.includes(h.id));
          await this.saveHighlights();
        }
      }
    }

    restoreRemainingHighlights(remainingHighlights, failed) {
      for (const entry of remainingHighlights) {
        if (!this.restoreHighlight(entry)) {
          failed.push(entry.id);
        }
      }

      if (failed.length) {
        this.highlights = this.highlights.filter((h) => !failed.includes(h.id));
        this.saveHighlights();
      }
    }

    async applyHighlight(color) {
      if (!this.savedRange || this.savedRange.collapsed) return;

      const range = this.savedRange.cloneRange();
      const id = this.createId();
      const entry = this.serializeRange(range, color, id);

      window.getSelection().removeAllRanges();
      const mark = this.wrapRange(range, color, id);
      this.hideUI();

      if (!mark) return;

      this.highlights.push(entry);
      this.invalidateCache(id);
      await this.saveHighlights();
    }

    wrapRange(range, color, id) {
      const text = range.toString();
      if (!text.trim()) return null;

      const getBlock = (node) => {
        const blocks = ['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'BLOCKQUOTE', 'PRE', 'SECTION', 'ARTICLE', 'TD', 'TH'];
        let curr = node.nodeType === Node.TEXT_NODE ? node.parentNode : node;
        while (curr && curr !== document.body) {
          if (curr.nodeType === Node.ELEMENT_NODE && blocks.includes(curr.tagName)) return curr;
          curr = curr.parentNode;
        }
        return document.body;
      };

      const startBlock = getBlock(range.startContainer);
      const endBlock = getBlock(range.endContainer);

      if (startBlock === endBlock) {
        try {
          const frag = range.extractContents();
          const mark = this.createMark(id, color);
          mark.appendChild(frag);
          range.insertNode(mark);
          return mark;
        } catch {}
      }

      const marks = [];
      const iter = document.createNodeIterator(range.commonAncestorContainer, NodeFilter.SHOW_TEXT, {
        acceptNode: (node) => {
          if (!node.textContent.trim()) return NodeFilter.FILTER_REJECT;
          const nr = document.createRange();
          nr.selectNodeContents(node);
          if (range.compareBoundaryPoints(Range.END_TO_START, nr) >= 0) return NodeFilter.FILTER_REJECT;
          if (range.compareBoundaryPoints(Range.START_TO_END, nr) <= 0) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        },
      });

      const nodes = [];
      let n;
      while ((n = iter.nextNode())) nodes.push(n);

      for (const node of nodes) {
        let start = 0;
        let end = node.textContent.length;

        if (node === range.startContainer) start = range.startOffset;
        if (node === range.endContainer) end = range.endOffset;
        if (start >= end) continue;

        let target = node;
        if (start > 0) {
          target = node.splitText(start);
          end -= start;
        }
        if (end < target.textContent.length) target.splitText(end);

        const mark = this.createMark(id, color);
        if (target.parentNode) {
          target.parentNode.insertBefore(mark, target);
          mark.appendChild(target);
          marks.push(mark);
        }
      }

      return marks[0] || null;
    }

    createMark(id, color) {
      const mark = document.createElement('mark');
      mark.className = 'tenati-highlight';
      mark.dataset.tenatiId = id;
      mark.style.backgroundColor = color;
      mark.dataset.tenatiColor = color;
      return mark;
    }

    getMarks(id) {
      if (!this.markCache.has(id)) {
        const marks = document.querySelectorAll(`[data-tenati-id="${CSS.escape(id)}"]`);
        this.markCache.set(id, marks);
      }
      return this.markCache.get(id);
    }

    invalidateCache(id) {
      this.markCache.delete(id);
    }

    focusHighlight(id, showPanel = false) {
      if (!id) return;

      this.setEditing(id);

      let marks = this.getMarks(id);
      if (!marks.length) {
        const entry = this.highlights.find((h) => h.id === id);
        if (entry && this.restoreHighlight(entry)) {
          this.invalidateCache(id);
          marks = this.getMarks(id);
        }
      }

      if (marks.length) {
        marks.forEach((m) => {
          m.classList.add('tenati-highlight-flash');
          setTimeout(() => m.classList.remove('tenati-highlight-flash'), 800);
        });

        const rect = marks[0].getBoundingClientRect();
        if (!showPanel) this.hideUI();

        if (rect) {
          if (showPanel) {
            this.positionUI(rect);
            this.showUI();
            this.openPanel();
          }
          this.positionBubble(rect);
          this.showBubble();
        } else if (!showPanel) {
          this.hideBubble();
        }
      }
    }

    async restyleHighlight(id, color) {
      const entry = this.highlights.find((h) => h.id === id);
      if (!entry) {
        this.clearEditing();
        return;
      }

      let marks = this.getMarks(id);
      if (!marks.length && this.restoreHighlight(entry)) {
        this.invalidateCache(id);
        marks = this.getMarks(id);
      }

      if (!marks.length) {
        await this.eraseHighlight(id);
        return;
      }

      marks.forEach((m) => {
        m.style.backgroundColor = color;
        m.dataset.tenatiColor = color;
      });

      entry.color = color;
      await this.saveHighlights();
    }

    async eraseHighlight(id) {
      const idx = this.highlights.findIndex((h) => h.id === id);
      if (idx === -1) return;

      this.removeMarks(id);
      this.invalidateCache(id);
      this.highlights.splice(idx, 1);
      if (this.editingId === id) this.clearEditing();
      await this.saveHighlights();
    }

    async clearAllHighlights() {
      if (!this.highlights.length) return;
      this.highlights.forEach((h) => {
        this.removeMarks(h.id);
        this.invalidateCache(h.id);
      });
      this.highlights = [];
      this.clearEditing();
      await this.saveHighlights();
    }

    restoreHighlight(entry) {
      if (!entry) return null;
      const existing = this.getMarks(entry.id);
      if (existing.length) return null;
      const range = this.deserializeRange(entry);
      if (range) {
        const mark = this.wrapRange(range, entry.color, entry.id);
        if (mark) {
          this.invalidateCache(entry.id);
        }
        return mark;
      }
      return null;
    }

    removeMarks(id) {
      const marks = Array.from(document.querySelectorAll(`[data-tenati-id="${CSS.escape(id)}"]`));
      if (!marks.length) return;

      const parents = new Set();
      
      marks.forEach((mark) => {
        if (!mark.parentNode) return;
        parents.add(mark.parentNode);
        while (mark.firstChild) {
          mark.parentNode.insertBefore(mark.firstChild, mark);
        }
        mark.parentNode.removeChild(mark);
      });

      // Batch normalize - sadece bir kez her parent için
      parents.forEach((parent) => {
        parent.normalize();
      });
    }

    serializeRange(range, color, id) {
      return {
        id,
        color,
        startPath: this.getNodePath(range.startContainer),
        startOffset: range.startOffset,
        endPath: this.getNodePath(range.endContainer),
        endOffset: range.endOffset,
        textSnippet: this.getSnippet(range.toString()),
        createdAt: Date.now(),
      };
    }

    deserializeRange(entry) {
      const start = this.resolveNodePath(entry.startPath);
      const end = this.resolveNodePath(entry.endPath);
      if (!start || !end) return null;

      const range = document.createRange();
      try {
        range.setStart(start, this.clampOffset(start, entry.startOffset));
        range.setEnd(end, this.clampOffset(end, entry.endOffset));
      } catch {
        return null;
      }
      return range;
    }

    async saveHighlights() {
      this.pendingSave = true;
      clearTimeout(this.saveTimer);
      this.saveTimer = setTimeout(async () => {
        if (this.pendingSave) {
          try {
            // Check storage quota before saving
            const quotaInfo = await this.checkStorageQuota();
            if (!quotaInfo.hasSpace) {
              await this.handleStorageQuotaExceeded();
              return;
            }

            await this.storage.set(PAGE_KEY, this.highlights);
            this.pendingSave = false;
          } catch (err) {
            if (err.message && err.message.includes('QUOTA_BYTES')) {
              await this.handleStorageQuotaExceeded();
            } else {
              console.warn('[tenati] Save failed:', err);
            }
            this.pendingSave = false;
          }
        }
      }, 300);
    }

    async checkStorageQuota() {
      if (typeof chrome === 'undefined' || !chrome.storage?.local) {
        return { hasSpace: true, used: 0, quota: 0 };
      }

      try {
        const usage = await new Promise((resolve) => {
          chrome.storage.local.getBytesInUse(null, (bytes) => {
            if (chrome.runtime.lastError) {
              resolve({ used: 0, quota: 0 });
            } else {
              resolve({ used: bytes, quota: chrome.storage.local.QUOTA_BYTES || 5242880 });
            }
          });
        });

        const quota = chrome.storage.local.QUOTA_BYTES || 5242880; // 5MB default
        const hasSpace = usage.used < quota * 0.9; // Use 90% threshold

        return { hasSpace, used: usage.used, quota };
      } catch (err) {
        return { hasSpace: true, used: 0, quota: 0 };
      }
    }

    async handleStorageQuotaExceeded() {
      // Remove oldest highlights (keep last 1000)
      if (this.highlights.length > 1000) {
        const sorted = [...this.highlights].sort((a, b) => a.createdAt - b.createdAt);
        const toRemove = sorted.slice(0, this.highlights.length - 1000);
        
        toRemove.forEach((entry) => {
          this.removeMarks(entry.id);
          this.invalidateCache(entry.id);
        });

        this.highlights = sorted.slice(this.highlights.length - 1000);
        
        try {
          await this.storage.set(PAGE_KEY, this.highlights);
          this.pendingSave = false;
        } catch (err) {
          console.warn('[tenati] Cleanup save failed:', err);
        }
      }
    }

    sanitizeHTML(html) {
      if (!html) return '';
      
      const div = document.createElement('div');
      div.textContent = html;
      return div.innerHTML;
    }

    setLoadingState(loading) {
      this.loadingState = loading;
      if (this.elements.root) {
        this.elements.root.classList.toggle('tenati-loading', loading);
      }
    }

    setEditing(id) {
      this.editingId = id;
      this.elements.panel.classList.toggle('tenati-editing', !!id);
      this.elements.hint.hidden = !id;
    }

    clearEditing() {
      this.editingId = null;
      this.elements.panel.classList.remove('tenati-editing');
      this.elements.hint.hidden = true;
      this.hideBubble();
    }

    positionUI(rect) {
      const { root, panel } = this.elements;
      const scroll = { x: window.scrollX, y: window.scrollY };
      const vw = document.documentElement.clientWidth;
      const vh = document.documentElement.clientHeight;
      const w = root.offsetWidth || 260;
      const h = root.offsetHeight || 140;
      const gap = 12;

      let left = scroll.x + rect.right + gap;
      if (left + w > scroll.x + vw - gap) left = scroll.x + rect.left - w - gap;
      left = this.clamp(left, scroll.x + gap, scroll.x + vw - w - gap);

      let top = scroll.y + rect.top - gap;
      if (top < scroll.y + gap) top = scroll.y + rect.bottom + gap;
      top = this.clamp(top, scroll.y + gap, scroll.y + vh - h - gap);

      root.style.top = `${top}px`;
      root.style.left = `${left}px`;
      this.anchorRect = { ...rect };
      this.positionPanel();
    }

    positionPanel() {
      const { root, panel } = this.elements;
      if (!this.anchorRect) return;

      const rootRect = root.getBoundingClientRect();
      const rootTop = parseInt(root.style.top) || (window.scrollY + rootRect.top);
      const rootLeft = parseInt(root.style.left) || (window.scrollX + rootRect.left);
      const rootH = root.offsetHeight || 42;

      const scroll = { x: window.scrollX, y: window.scrollY };
      const vw = document.documentElement.clientWidth;
      const vh = document.documentElement.clientHeight;
      const w = panel.offsetWidth || 260;
      const h = panel.offsetHeight || 180;
      const gap = 12;

      let left = rootLeft;
      if (left + w > scroll.x + vw - gap) left = scroll.x + vw - w - gap;
      left = this.clamp(left, scroll.x + gap, scroll.x + vw - w - gap);

      let top = rootTop + rootH + 8;
      if (top + h > scroll.y + vh - gap) top = rootTop - h - 8;
      top = this.clamp(top, scroll.y + gap, scroll.y + vh - h - gap);

      panel.style.top = `${top}px`;
      panel.style.left = `${left}px`;
    }

    positionBubble(rect) {
      const bubble = this.elements.bubble;
      const scroll = { x: window.scrollX, y: window.scrollY };
      const vw = document.documentElement.clientWidth;
      const vh = document.documentElement.clientHeight;
      const w = bubble.offsetWidth || 200;
      const h = bubble.offsetHeight || 48;
      const gap = 10;

      let top = scroll.y + rect.top - h - gap;
      if (top < scroll.y + gap) top = scroll.y + rect.bottom + gap;
      top = this.clamp(top, scroll.y + gap, scroll.y + vh - h - gap);

      let left = scroll.x + rect.left + rect.width / 2 - w / 2;
      left = this.clamp(left, scroll.x + gap, scroll.x + vw - w - gap);

      bubble.style.top = `${top}px`;
      bubble.style.left = `${left}px`;
    }

    showUI() {
      this.elements.root.classList.add('tenati-visible');
      this.elements.panel.classList.remove('tenati-panel-open');
    }

    hideUI() {
      this.elements.root.classList.remove('tenati-visible');
      this.elements.panel.classList.remove('tenati-panel-open');
      this.savedRange = null;
      this.anchorRect = null;
    }

    showBubble() {
      this.elements.bubble.classList.add('tenati-action-bubble-visible');
    }

    hideBubble() {
      this.elements.bubble.classList.remove('tenati-action-bubble-visible');
    }

    openPanel() {
      if (!this.anchorRect) return;
      this.elements.panel.classList.add('tenati-panel-open');
      this.positionPanel();
    }

    togglePanel() {
      if (!this.anchorRect) return;
      this.elements.panel.classList.toggle('tenati-panel-open');
      if (this.elements.panel.classList.contains('tenati-panel-open')) this.positionPanel();
    }

    setupBridge() {
      if (typeof chrome === 'undefined' || !chrome.runtime?.onMessage?.addListener) return;

      chrome.runtime.onMessage.addListener((msg, sender, respond) => {
        // Handle ping messages to check if content script is ready
        if (msg?.type === 'tenati:ping') {
          respond({ ready: true });
          return false;
        }

        // Handle settings updates
        if (msg?.type === 'tenati:settingsUpdated') {
          this.loadSettings();
          return false;
        }

        // Handle clear all
        if (msg?.type === 'tenati:clearAll') {
          this.clearAllHighlights();
          return false;
        }

        // Handle reload
        if (msg?.type === 'tenati:reload') {
          this.loadHighlights();
          return false;
        }

        if (msg?.type !== 'tenati:popup') return false;

        const handle = async () => {
          const { command, payload = {} } = msg;
          switch (command) {
            case 'getHighlights':
              return { highlights: this.highlights };
            case 'focusHighlight':
              this.focusHighlight(payload.id, false);
              return { ok: true };
            case 'deleteHighlight':
              await this.eraseHighlight(payload.id);
              return { ok: true };
            case 'clearHighlights':
              await this.clearAllHighlights();
              return { ok: true };
            case 'collectHighlights':
              return { highlights: this.collectPayload() };
            case 'exportPagePdf':
              this.exportPdf();
              return { ok: true };
            default:
              return { ok: false };
          }
        };

        handle().then(respond).catch((err) => {
          console.warn('[tenati] Bridge error:', err);
          respond({ ok: false, error: err?.message });
        });
        // Chrome Manifest v3 requires returning true for async responses
        return true;
      });
    }

    collectPayload() {
      return this.highlights.map((entry) => {
        let marks = this.getMarks(entry.id);
        if (!marks.length && this.restoreHighlight(entry)) {
          this.invalidateCache(entry.id);
          marks = this.getMarks(entry.id);
        }
        const htmlContent = Array.from(marks).map((m) => m.innerHTML).join(' ') || entry.textSnippet || '';
        return {
          id: entry.id,
          color: entry.color,
          textSnippet: this.sanitizeHTML(entry.textSnippet),
          createdAt: entry.createdAt,
          htmlContent: this.sanitizeHTML(htmlContent),
        };
      });
    }

    exportPdf() {
      this.hideUI();
      this.hideBubble();
      requestAnimationFrame(() => setTimeout(() => window.print(), 60));
    }

    createElement(tag, className) {
      const el = document.createElement(tag);
      el.className = className;
      return el;
    }

    getVisibleRect(range) {
      for (const rect of range.getClientRects()) {
        if (rect.width > 0 || rect.height > 0) return rect;
      }
      const rect = range.getBoundingClientRect();
      return (rect.width > 0 || rect.height > 0) ? rect : null;
    }

    getNodePath(node) {
      const path = [];
      let curr = node;
      while (curr && curr !== document) {
        const parent = curr.parentNode;
        if (!parent) break;
        path.unshift(Array.prototype.indexOf.call(parent.childNodes, curr));
        curr = parent;
      }
      return path;
    }

    resolveNodePath(path) {
      if (!Array.isArray(path)) return null;
      let curr = document;
      for (const idx of path) {
        if (!curr.childNodes?.[idx]) return null;
        curr = curr.childNodes[idx];
      }
      return curr;
    }

    clampOffset(node, offset) {
      const max = node.nodeType === Node.TEXT_NODE ? node.textContent.length : node.childNodes.length;
      return Math.min(Math.max(offset, 0), max);
    }

    getSnippet(text) {
      const norm = (text || '').replace(/\s+/g, ' ').trim();
      return norm.length > 80 ? `${norm.slice(0, 77)}…` : norm;
    }

    clamp(val, min, max) {
      return Math.min(Math.max(val, min), max);
    }

    debounce(fn, wait) {
      let timer;
      return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), wait);
      };
    }

    throttle(fn, wait) {
      let lastTime = 0;
      return (...args) => {
        const now = Date.now();
        if (now - lastTime >= wait) {
          lastTime = now;
          fn(...args);
        }
      };
    }

    createId() {
      return crypto?.randomUUID ? `tenati-${crypto.randomUUID()}` : `tenati-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }

    createStorage() {
      if (typeof chrome === 'undefined' || !chrome.storage?.local) {
        // Fallback to memory storage if Chrome API is not available
        const mem = {};
        return {
          get: (key) => Promise.resolve(mem[key]),
          set: (key, val) => Promise.resolve((mem[key] = val)),
        };
      }
      return {
        get: (key) => new Promise((r) => chrome.storage.local.get(key, (res) => r(res[key]))),
        set: (key, val) => new Promise((r) => chrome.storage.local.set({ [key]: val }, r)),
      };
    }
  }

  new Highlighter().init();
})();
