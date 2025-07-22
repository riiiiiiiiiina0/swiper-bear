(() => {
  // stop if the overlay already exists
  const existingOverlay = document.getElementById('tab-switcher-overlay');
  if (existingOverlay) return;

  /** @type {HTMLDivElement | null} */
  let overlay = null;

  /** @type {Array<any>} */
  let currentTabData = [];
  let selectedIndex = 0;

  // Track currently pressed keys so we know when all keys have been released
  let triggerHotkey = new Set();

  const onKeyDown = (e) => {
    if (e.key === 'ArrowRight') {
      selectNextTab();
    } else if (e.key === 'ArrowLeft') {
      selectPreviousTab();
    } else if (e.key === 'Enter') {
      activateTab(selectedIndex);
    } else if (e.key === 'Escape') {
      destroyOverlay();
    }
  };

  const onKeyUp = (e) => {
    triggerHotkey.delete(e.key.toLowerCase());
    if (overlay && triggerHotkey.size === 0) {
      activateTab(selectedIndex);
    }
  };

  window.addEventListener('keydown', onKeyDown, { capture: true });
  window.addEventListener('keyup', onKeyUp, { capture: true });

  // Dismiss overlay when the tab/page becomes hidden (e.g., user switches tabs or minimizes window)
  const onVisibilityChange = () => {
    if (document.visibilityState === 'hidden') {
      destroyOverlay();
    }
  };
  document.addEventListener('visibilitychange', onVisibilityChange, {
    capture: true,
  });

  // Request the latest tab data from the background script as soon as the
  // content script is executed.
  chrome.runtime.sendMessage({ type: 'request_tab_data' }, (response) => {
    if (response && response.type === 'tab_data') {
      const { tabData, shortcut } = response;
      if (Array.isArray(tabData) && tabData.length) {
        renderTabs(tabData);
      }
      if (shortcut) {
        const isWindows = navigator.userAgent.includes('Windows');
        const shortcutKeys = isWindows
          ? shortcut.split('+') // Windows uses + to separate keys
          : shortcut.split('').slice(0, -1); // on Mac, the last key in the shortcut is not captured by the keyup event, so we remove it
        const keys = shortcutKeys.map((key) => {
          switch (key) {
            // handle mac modifier key symbols
            case '⌘':
              return 'meta';
            case '⌥':
              return 'alt';
            case '⇧':
              return 'shift';
            case '⌃':
              return 'control';
            default:
              return key.toLowerCase();
          }
        });
        triggerHotkey = new Set(keys);
      }
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
        border: 1px solid rgba(0, 0, 0, 0.15);
        box-shadow: 0 4px 24px rgba(0, 0, 0, 0.25);
        backdrop-filter: blur(10px);
        transition: opacity 150ms ease;
      }
      .tab-switcher-item {
        display: flex;
        flex-direction: column;
        gap: 8px;
        align-items: center;
        cursor: pointer;
        width: 180px;
      }
      .tab-switcher-item .thumbnail {
        width: 100%;
        height: 110px;
        object-fit: cover;
        border-radius: 6px;
      }
      .tab-switcher-item span {
        font-size: 13px;
        color: #222;
        font-family: "Arial Rounded MT", "Arial Rounded MT Bold", Arial, sans-serif;
        text-overflow: ellipsis;
        overflow: hidden;
        white-space: nowrap;
        max-width: 100%;
      }
      /* New: title container with favicon */
      .tab-switcher-item .title-container {
        display: flex;
        flex-direction: row;
        align-items: center;
        justify-content: center;
        gap: 8px;
        width: 100%;
      }
      .tab-switcher-item .favicon {
        width: 16px;
        height: 16px;
        margin: 0;
        flex-shrink: 0;
      }
      .tab-switcher-item.selected .thumbnail {
        outline: 6px solid #1573ff;
        outline-offset: -3px;
      }
      /* Dark mode overrides */
      @media (prefers-color-scheme: dark) {
        #tab-switcher-overlay {
          background: rgba(40, 40, 40, 0.95);
          box-shadow: 0 4px 24px rgba(0, 0, 0, 0.75);
          border: 1px solid rgba(255, 255, 255, 0.15);
        }
        .tab-switcher-item span {
          color: #eee;
        }
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
  }

  function destroyOverlay() {
    if (overlay) {
      window.removeEventListener('keydown', onKeyDown, { capture: true });
      window.removeEventListener('keyup', onKeyUp, { capture: true });
      chrome.runtime.onMessage.removeListener(onMessage);
      // Remove visibilitychange listener
      document.removeEventListener('visibilitychange', onVisibilityChange, {
        capture: true,
      });

      overlay.remove();
      overlay = null;
    }
  }

  function renderTabs(tabs) {
    const n = Math.floor(window.innerWidth / 200);
    currentTabData = tabs.slice(0, n);

    // Start with the last tab selected
    selectedIndex = currentTabData.length > 1 ? 1 : 0;

    if (!overlay) createOverlay();

    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    if (!overlay) return; // safety
    overlay.innerHTML = '';

    currentTabData.forEach((tab, idx) => {
      const item = document.createElement('div');
      item.className =
        'tab-switcher-item' + (idx === selectedIndex ? ' selected' : '');
      item.dataset.tabId = String(tab.id);

      const img = document.createElement('img');
      img.className = 'thumbnail';
      img.src = tab.screenshot || tab.favIconUrl || '';
      img.alt = tab.title || 'Tab thumbnail';

      const titleContainer = document.createElement('div');
      titleContainer.className = 'title-container';

      // Favicon (small icon next to title)
      if (tab.favIconUrl) {
        const faviconImg = document.createElement('img');
        faviconImg.className = 'favicon';
        faviconImg.src = tab.favIconUrl;
        faviconImg.width = 16;
        faviconImg.height = 16;
        faviconImg.alt = 'favicon';
        titleContainer.appendChild(faviconImg);
      }

      const title = document.createElement('span');
      title.textContent = tab.title || 'Untitled tab';
      titleContainer.appendChild(title);

      item.appendChild(img);
      item.appendChild(titleContainer);

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

  function selectNextTab() {
    if (!overlay) return;
    selectedIndex = (selectedIndex + 1) % currentTabData.length;
    updateSelection();
  }

  function selectPreviousTab() {
    if (!overlay) return;
    selectedIndex =
      (selectedIndex - 1 + currentTabData.length) % currentTabData.length;
    updateSelection();
  }

  function onMessage(message) {
    if (!message) return;
    if (message.type === 'advance_selection') {
      selectNextTab();
    }
  }

  chrome.runtime.onMessage.addListener(onMessage);

  function activateTab(index) {
    // cleanup
    destroyOverlay();

    const tab = currentTabData[index];
    if (tab) {
      chrome.runtime.sendMessage({ type: 'activate_tab', id: tab.id });
    }
  }
})();
