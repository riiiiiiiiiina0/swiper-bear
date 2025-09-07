/** @type {Array<any>} */
let currentTabData = [];
let selectedIndex = 0;
let closeHotkey = '';

/** @type {boolean} */
let ignoreNextCloseHotkeyOnWindows = false;

/**
 * @returns {boolean}
 */
function isWindows() {
  try {
    const platform = navigator.platform || '';
    const ua = navigator.userAgent || '';
    return /win/i.test(platform) || /windows/i.test(ua);
  } catch (_) {
    return false;
  }
}

/**
 * @param {string | undefined} shortcut
 * @returns {string}
 */
function parseHotkey(shortcut) {
  if (!shortcut) return '';
  const parts = shortcut.includes('+')
    ? shortcut.split('+')
    : shortcut.split('');
  const lastPart = parts[parts.length - 1];
  // The key is the last part of the shortcut. It's usually a single character.
  if (lastPart && lastPart.length === 1) {
    return lastPart.toLowerCase();
  }
  return '';
}

// Connect to background so it knows popup is open and can send messages
try {
  const port = chrome.runtime.connect({ name: 'popup' });
  window.addEventListener('unload', () => {
    try {
      port.disconnect();
    } catch (_) {}
  });
} catch (_) {
  // ignore
}

const root = /** @type {HTMLDivElement} */ (document.getElementById('root'));

/** @type {number | undefined} */
let activationHintTimer;

function createFaviconPlaceholder() {
  const placeholder = document.createElement('div');
  placeholder.className =
    'favicon-placeholder w-4 h-4 rounded-full bg-[#ccc] shrink-0';
  return placeholder;
}

function renderTabs(tabs) {
  currentTabData = tabs;
  selectedIndex = currentTabData.length > 1 ? 1 : 0;

  const container = document.createElement('div');
  container.className =
    'tab-switcher flex flex-row gap-3 bg-white/95 dark:bg-[rgba(40,40,40,0.95)] px-5 py-4 overflow-x-auto';

  currentTabData.forEach((tab, idx) => {
    const item = document.createElement('div');
    item.className =
      'tab-switcher-item flex flex-col gap-2 items-center cursor-pointer w-[180px] min-w-[180px]' +
      (idx === selectedIndex ? ' selected' : '');
    item.dataset.tabId = String(tab.id);

    const thumbWrapper = document.createElement('div');
    thumbWrapper.className = 'thumb-wrapper relative w-full';

    if (tab.screenshot) {
      const img = document.createElement('img');
      img.className = 'thumbnail w-full h-[110px] object-cover rounded-[6px]';
      img.src = tab.screenshot;
      img.alt = tab.title || 'Tab thumbnail';
      thumbWrapper.appendChild(img);
      item.appendChild(thumbWrapper);
    } else {
      const placeholder = document.createElement('div');
      placeholder.className =
        'thumbnail w-full h-[110px] rounded-[6px] bg-[#f0f0f0] dark:bg-[#222]';
      thumbWrapper.appendChild(placeholder);
      item.appendChild(thumbWrapper);
    }

    const titleContainer = document.createElement('div');
    titleContainer.className =
      'title-container flex flex-row items-center justify-center gap-2 w-full';

    if (tab.favIconUrl) {
      const faviconImg = document.createElement('img');
      faviconImg.className = 'favicon w-4 h-4 shrink-0';
      faviconImg.src = tab.favIconUrl;
      faviconImg.alt = 'favicon';
      faviconImg.onerror = () => {
        faviconImg.replaceWith(createFaviconPlaceholder());
      };
      titleContainer.appendChild(faviconImg);
    } else {
      titleContainer.appendChild(createFaviconPlaceholder());
    }

    const title = document.createElement('span');
    title.textContent = tab.title || tab.url;
    title.className =
      'text-[13px] text-[#222] dark:text-[#eee] whitespace-nowrap overflow-hidden text-ellipsis max-w-full';
    titleContainer.appendChild(title);
    item.appendChild(titleContainer);

    item.addEventListener('click', () => {
      selectedIndex = idx;
      commitSelection();
    });

    container.appendChild(item);
  });

  root.innerHTML = '';
  root.appendChild(container);

  applySelectionStyles();

  scheduleActivationHint();
}

function applySelectionStyles() {
  const items = document.querySelectorAll('.tab-switcher .tab-switcher-item');
  items.forEach((el, idx) => {
    const thumb = el.querySelector('.thumbnail');
    if (!thumb) return;
    thumb.classList.remove(
      'outline',
      'outline-[6px]',
      'outline-[#1573ff]',
      'outline-offset-[-3px]',
    );
    if (idx === selectedIndex) {
      thumb.classList.add(
        'outline',
        'outline-[6px]',
        'outline-[#1573ff]',
        'outline-offset-[-3px]',
      );
    }
  });
}

function updateSelection() {
  const items = document.querySelectorAll('.tab-switcher .tab-switcher-item');
  items.forEach((el) => el.classList.remove('selected'));
  const current = items[selectedIndex];
  if (current) {
    current.classList.add('selected');
    current.scrollIntoView({
      behavior: 'smooth',
      inline: 'center',
      block: 'center',
    });
  }
  applySelectionStyles();

  removeActivationHints();
  scheduleActivationHint();
}

function selectNext() {
  if (!currentTabData.length) return;
  selectedIndex = (selectedIndex + 1) % currentTabData.length;
  updateSelection();
}

function selectPrev() {
  if (!currentTabData.length) return;
  selectedIndex =
    (selectedIndex - 1 + currentTabData.length) % currentTabData.length;
  updateSelection();
}

function commitSelection() {
  const tab = currentTabData[selectedIndex];
  if (tab) {
    if (activationHintTimer) clearTimeout(activationHintTimer);
    chrome.runtime.sendMessage({ type: 'activate_tab', id: tab.id });
    window.close();
  }
}

// Keyboard handling inside popup
window.addEventListener(
  'keydown',
  (e) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      selectNext();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      selectPrev();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      commitSelection();
    }
  },
  { capture: true },
);

window.addEventListener('keyup', (e) => {
  console.log('keyup:', e.key, closeHotkey);
  if (closeHotkey && e.key.toLowerCase() === closeHotkey) {
    if (ignoreNextCloseHotkeyOnWindows) {
      ignoreNextCloseHotkeyOnWindows = false;
      return;
    }
    e.preventDefault();
    commitSelection();
  }
});

// Receive control messages from background (for command presses)
chrome.runtime.onMessage.addListener((message) => {
  if (!message) return;
  if (message.type === 'popup_select_next') selectNext();
  if (message.type === 'popup_select_prev') selectPrev();
  if (message.type === 'popup_commit') commitSelection();
});

// Also handle the command directly when popup is focused
try {
  chrome.commands.onCommand.addListener((command) => {
    if (command === 'open_switcher') {
      selectNext();
    }
  });
} catch (_) {
  // ignore if commands API not available
}

// Request initial tab data
chrome.runtime.sendMessage({ type: 'request_tab_data' }, (response) => {
  if (response && response.type === 'tab_data') {
    const { tabData, shortcut } = response;
    if (shortcut) {
      closeHotkey = parseHotkey(shortcut);
      console.log('closeHotkey:', closeHotkey, shortcut);
      if (closeHotkey && isWindows()) {
        ignoreNextCloseHotkeyOnWindows = true;
      }
    }
    if (Array.isArray(tabData) && tabData.length) {
      renderTabs(tabData);
    } else {
      root.textContent = 'No tabs to show';
    }
  }
});

function removeActivationHints() {
  document.querySelectorAll('.activation-hint').forEach((el) => el.remove());
}

function scheduleActivationHint() {
  if (activationHintTimer) clearTimeout(activationHintTimer);
  activationHintTimer = setTimeout(showActivationHint, 2000);
}

function showActivationHint() {
  removeActivationHints();
  const items = document.querySelectorAll('.tab-switcher .tab-switcher-item');
  const current = items[selectedIndex];
  if (!current) return;
  const wrapper = current.querySelector('.thumb-wrapper');
  if (!wrapper) return;
  const badge = document.createElement('div');
  badge.className =
    'activation-hint absolute -top-1 -right-2 px-2 py-1 rounded text-[11px] font-medium bg-yellow-400 text-black shadow animate-bounce opacity-0 transition-opacity duration-300';
  if (closeHotkey) {
    badge.textContent = `Enter or ${closeHotkey.toUpperCase()} to select`;
  } else {
    badge.textContent = 'Enter to activate';
  }
  wrapper.appendChild(badge);

  setTimeout(() => {
    badge.classList.remove('opacity-0');
  }, 100);
}
