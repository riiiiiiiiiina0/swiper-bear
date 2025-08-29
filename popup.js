/** @type {Array<any>} */
let currentTabData = [];
let selectedIndex = 0;

const onKeyDown = (e) => {
  if (e.key === 'ArrowRight') {
    selectNextTab();
  } else if (e.key === 'ArrowLeft') {
    selectPreviousTab();
  } else if (e.key === 'Enter') {
    activateTab(selectedIndex);
  } else if (e.key === 'Escape') {
    window.close();
  }
};

window.addEventListener('keydown', onKeyDown, { capture: true });

// Request the latest tab data from the background script as soon as the
// popup is opened.
chrome.runtime.sendMessage({ type: 'request_tab_data' }, (response) => {
  if (response && response.type === 'tab_data') {
    const { tabData } = response;
    if (Array.isArray(tabData) && tabData.length) {
      renderTabs(tabData);
    }
  }
});

function renderTabs(tabs) {
  currentTabData = tabs;

  // Start with the last tab selected
  selectedIndex = currentTabData.length > 1 ? 1 : 0;

  const overlay = document.getElementById('tab-switcher-overlay');
  if (!overlay) return;

  overlay.innerHTML = '';

  currentTabData.forEach((tab, idx) => {
    const item = document.createElement('div');
    item.className =
      'tab-switcher-item' + (idx === selectedIndex ? ' selected' : '');
    item.dataset.tabId = String(tab.id);
    item.addEventListener('click', () => activateTab(idx));

    if (tab.screenshot) {
      const img = document.createElement('img');
      img.className = 'thumbnail';
      img.src = tab.screenshot;
      img.alt = tab.title || 'Tab thumbnail';
      item.appendChild(img);
    } else {
      const placeholder = document.createElement('div');
      placeholder.className = 'thumbnail';
      placeholder.style.backgroundColor = '#f0f0f0';
      item.appendChild(placeholder);
    }

    const titleContainer = document.createElement('div');
    titleContainer.className = 'title-container';

    const createFaviconPlaceholder = () => {
      const placeholder = document.createElement('div');
      placeholder.className = 'favicon-placeholder';
      return placeholder;
    };

    // Favicon (small icon next to title)
    if (tab.favIconUrl) {
      const faviconImg = document.createElement('img');
      faviconImg.className = 'favicon';
      faviconImg.src = tab.favIconUrl;
      faviconImg.alt = 'favicon';

      // If the image fails to load, replace it with a placeholder
      faviconImg.onerror = () => {
        faviconImg.replaceWith(createFaviconPlaceholder());
      };
      titleContainer.appendChild(faviconImg);
    } else {
      // If there's no favicon URL, show the placeholder directly
      titleContainer.appendChild(createFaviconPlaceholder());
    }

    const title = document.createElement('span');
    title.textContent = tab.title || tab.url;
    titleContainer.appendChild(title);

    item.appendChild(titleContainer);

    overlay.appendChild(item);
  });

  updateSelection();
}

function updateSelection() {
  if (!currentTabData.length) return;
  const overlay = document.getElementById('tab-switcher-overlay');
  if (!overlay) return;

  const items = overlay.querySelectorAll('.tab-switcher-item');
  if (!items.length) return;
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
}

function selectNextTab() {
  selectedIndex = (selectedIndex + 1) % currentTabData.length;
  updateSelection();
}

function selectPreviousTab() {
  selectedIndex =
    (selectedIndex - 1 + currentTabData.length) % currentTabData.length;
  updateSelection();
}

function activateTab(index) {
  const tab = currentTabData[index];
  if (tab) {
    chrome.runtime.sendMessage({ type: 'activate_tab', id: tab.id }, () => {
      window.close();
    });
  }
}
