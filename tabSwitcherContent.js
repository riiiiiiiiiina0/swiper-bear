/* eslint-disable */
/**
 * @ts-nocheck
 * Tab Switcher Content Script
 * Listens for messages from the background script and renders an overlay
 * with thumbnails of the user's open tabs (supplied by background).
 */

(() => {
  /*
   * Re-initialisation strategy
   * -------------------------
   * We want the content script to execute *again* when the extension is updated so
   * that users instantly benefit from the latest code without having to reload
   * every tab. Instead of a simple boolean flag that blocks any subsequent
   * injections, we now store the *extension version* on the `window` object. If
   * the stored version differs from the currently running version we allow the
   * script to run again (and optionally perform a light clean-up of artefacts
   * from the older instance).
   */

  // Determine the version shipped with this script. Fallback to empty string if
  // something goes wrong.
  const currentVersion = (chrome?.runtime?.getManifest?.() || {}).version || '';

  // @ts-ignore - previous version marker (if any) is stored on window
  const previousVersion = window.__TAB_SWITCHER_VERSION__;

  // If we have already executed *this exact* version on the page we can bail
  // out early.
  if (previousVersion === currentVersion) return;

  // If there was a previous version running we try a minimal clean-up to avoid
  // duplicated UI. The older script might not expose a clean-up hook (it was
  // introduced in this commit) so we guard everything with feature checks.
  // @ts-ignore – cleanup hook is defined below in this version
  if (typeof window.__TAB_SWITCHER_CLEANUP__ === 'function') {
    try {
      // @ts-ignore
      window.__TAB_SWITCHER_CLEANUP__();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[Tab-Switcher] Previous instance cleanup failed:', err);
    }
  }

  // Store the version marker so further injections of the same build are
  // ignored.
  // @ts-ignore
  window.__TAB_SWITCHER_VERSION__ = currentVersion;

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
        border: 1px solid rgba(0, 0, 0, 0.15);
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
        margin-top: 6px;
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

  /*
   * ------------------------------------------------------
   * Expose a clean-up callback so future script injections
   * (e.g. after an extension update) can gracefully remove
   * artefacts from the current instance before initialising
   * the new one.
   * ------------------------------------------------------
   */
  // @ts-ignore – we deliberately attach to the window object
  window.__TAB_SWITCHER_CLEANUP__ = () => {
    try {
      destroyOverlay();
    } catch (_) {
      /** noop */
    }
  };
})();
