/* eslint-disable */
/**
 * @ts-nocheck
 * Tab Switcher Content Script
 * Listens for messages from the background script and renders an overlay
 * with thumbnails of the user's open tabs (supplied by background).
 */

(() => {
  // @ts-ignore - Declare global flag dynamically on window
  if (window.__TAB_SWITCHER_INIT__) return; // Prevent double-injection
  // @ts-ignore
  window.__TAB_SWITCHER_INIT__ = true;

  /** @type {HTMLDivElement | null} */
  let overlay = null;
  /** @type {Array<any>} */
  let currentTabData = [];
  let selectedIndex = 0;

  const KEY_CODES_NEXT = ['ArrowRight', 'ArrowDown'];
  const KEY_CODES_PREV = ['ArrowLeft', 'ArrowUp'];

  // Track currently pressed keys so we know when all keys have been released
  /** @type {Set<string>} */
  const pressedKeys = new Set();

  window.addEventListener('keydown', (e) => {
    pressedKeys.add(e.key);
  });
  window.addEventListener('keyup', (e) => {
    pressedKeys.delete(e.key);

    // If no keys are currently pressed and the overlay is visible, activate the tab
    if (overlay && pressedKeys.size === 0) {
      activateTab(selectedIndex);
    }
  });

  // Inject base styles for the overlay
  function injectStyles() {
    if (document.getElementById('tab-switcher-styles')) return;
    const style = document.createElement('style');
    style.id = 'tab-switcher-styles';
    style.textContent = `
      #tab-switcher-overlay {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        z-index: 2147483647; /* Max z-index */
        display: flex;
        gap: 12px;
        background: rgba(255, 255, 255, 0.95);
        padding: 16px 20px;
        border-radius: 12px;
        box-shadow: 0 4px 24px rgba(0, 0, 0, 0.25);
        backdrop-filter: blur(10px);
        transition: opacity 150ms ease;
      }
      .tab-switcher-item {
        display: flex;
        flex-direction: column;
        align-items: center;
        cursor: pointer;
        width: 180px;
      }
      .tab-switcher-item img {
        width: 100%;
        height: 110px;
        object-fit: cover;
        border-radius: 6px;
      }
      .tab-switcher-item span {
        margin-top: 6px;
        font-size: 13px;
        color: #222;
        text-overflow: ellipsis;
        overflow: hidden;
        white-space: nowrap;
        max-width: 100%;
      }
      .tab-switcher-item.selected img {
        outline: 4px solid #1573ff;
        outline-offset: -2px;
      }
    `;
    document.head.appendChild(style);
  }

  function createOverlay() {
    injectStyles();
    overlay = document.createElement('div');
    overlay.id = 'tab-switcher-overlay';
    overlay.addEventListener('click', (e) => {
      // Stop click from propagating to the page beneath
      e.stopPropagation();
    });
    document.body.appendChild(overlay);
    document.addEventListener('keydown', handleKeyDown, true);
  }

  function destroyOverlay() {
    if (overlay) {
      overlay.remove();
      overlay = null;
    }
    document.removeEventListener('keydown', handleKeyDown, true);
  }

  function renderTabs(tabs) {
    currentTabData = tabs;

    // Start with the last tab selected
    selectedIndex = tabs.length > 1 ? 1 : 0;

    if (!overlay) createOverlay();

    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    if (!overlay) return; // safety
    overlay.innerHTML = '';

    tabs.forEach((tab, idx) => {
      const item = document.createElement('div');
      item.className =
        'tab-switcher-item' + (idx === selectedIndex ? ' selected' : '');
      item.dataset.tabId = String(tab.id);

      const img = document.createElement('img');
      img.src = tab.screenshot || tab.favIconUrl || '';
      img.alt = tab.title || 'Tab thumbnail';

      const title = document.createElement('span');
      title.textContent = tab.title || 'Untitled tab';

      item.appendChild(img);
      item.appendChild(title);

      item.addEventListener('click', () => {
        activateTab(idx);
      });

      overlay?.appendChild(item);
    });
  }

  function updateSelection() {
    if (!currentTabData.length) return;
    const items = document.querySelectorAll(
      '#tab-switcher-overlay .tab-switcher-item',
    );
    if (!items.length) return;
    items.forEach((el) => el.classList.remove('selected'));
    const current = items[selectedIndex];
    if (current) current.classList.add('selected');
  }

  function handleKeyDown(e) {
    if (!overlay) return;

    if (KEY_CODES_NEXT.includes(e.key)) {
      selectedIndex = (selectedIndex + 1) % currentTabData.length;
      updateSelection();
      e.preventDefault();
    } else if (KEY_CODES_PREV.includes(e.key)) {
      selectedIndex =
        (selectedIndex - 1 + currentTabData.length) % currentTabData.length;
      updateSelection();
      e.preventDefault();
    } else if (e.key === 'Enter') {
      activateTab(selectedIndex);
      e.preventDefault();
    } else if (e.key === 'Escape') {
      destroyOverlay();
      e.preventDefault();
    }
  }

  function activateTab(index) {
    const tab = currentTabData[index];
    if (!tab) return;
    chrome.runtime.sendMessage({ type: 'activate_tab', id: tab.id });
    destroyOverlay();
  }

  // Listen for messages from background to display / advance the switcher
  chrome.runtime.onMessage.addListener((message) => {
    if (message && message.type === 'show_tab_switcher') {
      const { tabData } = message;
      if (!Array.isArray(tabData) || !tabData.length) return;

      const wasOpen = !!overlay; // Detect if the overlay is already visible

      if (!wasOpen) {
        // Render the tab list
        renderTabs(tabData);
      } else {
        // If the switcher was already open, move selection to the next tab
        selectedIndex = (selectedIndex + 1) % currentTabData.length;
        updateSelection();
      }
    }
  });
})();
