/**
 * @typedef {Object} TabData
 * @property {number} id - The ID of the tab.
 * @property {number} lastActive - The timestamp when the tab was last active.
 * @property {string} [title] - The title of the tab.
 * @property {string} [favIconUrl] - The favicon URL of the tab (optional).
 * @property {string} [screenshot] - The screenshot of the tab (optional).
 */

/**
 * Event listener that triggers when a tab becomes active
 * Takes a screenshot of the newly activated tab once it's fully loaded
 */
chrome.tabs.onActivated.addListener((activeInfo) => {
  chrome.tabs.get(activeInfo.tabId, (tab) => {
    if (tab.status === 'complete') {
      takeScreenshot(tab);
    }
  });
});

/**
 * Event listener that triggers when a tab's status changes
 * Takes a screenshot when an active tab finishes loading
 */
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.active) {
    takeScreenshot(tab);
  }
});

// Add retry configuration constants after the event listeners
const MAX_SCREENSHOT_RETRIES = 3;
const SCREENSHOT_RETRY_DELAY_MS = 200;

/**
 * Takes a screenshot of the specified tab and saves it to local storage
 * @param {chrome.tabs.Tab} tab - The tab object to capture
 * The function captures the visible area, resizes it, and stores it along with tab metadata
 */
function takeScreenshot(tab, retryCount = 0) {
  const id = tab.id;
  if (!id) return;

  // if page url not start with http:// or https://, return
  if (
    !tab.url ||
    (!tab.url.startsWith('http://') && !tab.url.startsWith('https://'))
  )
    return;

  const tabData = {
    id: tab.id,
    lastActive: new Date().getTime(),
    title: tab.title,
    favIconUrl: tab.favIconUrl,
  };
  // console.log('Take screenshot for tab', tabData);

  chrome.tabs.captureVisibleTab(
    tab.windowId,
    { format: 'jpeg', quality: 80 },
    (dataUrl) => {
      if (chrome.runtime.lastError) {
        const errMsg = chrome.runtime.lastError?.message || '';
        // Retry if the tab is currently not editable (e.g., being dragged)
        if (
          errMsg.includes('Tabs cannot be edited right now') &&
          retryCount < MAX_SCREENSHOT_RETRIES
        ) {
          setTimeout(
            () => takeScreenshot(tab, retryCount + 1),
            SCREENSHOT_RETRY_DELAY_MS,
          );
          return; // Exit early to avoid processing failure further
        }
        console.error(errMsg);
        return;
      }
      resizeImage(dataUrl, 300, (resizedDataUrl) => {
        tabData.screenshot = resizedDataUrl;
        chrome.storage.local.set({ [`tab-${id}`]: tabData }, () => {
          // console.log(`Screenshot saved for tab ${id}`);
          // console.log(
          //   '%c ',
          //   `font-size:300px; background:url(${resizedDataUrl}) no-repeat; background-size: contain;`,
          // );
        });
      });
    },
  );
}

/**
 * Resizes an image to a specified width while maintaining aspect ratio
 * @param {string} dataUrl - The base64 data URL of the image to resize
 * @param {number} width - The target width in pixels
 * @param {function(string): void} callback - Callback function that receives the resized image as a data URL
 */
function resizeImage(dataUrl, width, callback) {
  // Use OffscreenCanvas & createImageBitmap as the background script has no DOM APIs like Image()
  fetch(dataUrl)
    .then((res) => res.blob())
    .then((blob) => createImageBitmap(blob))
    .then((imageBitmap) => {
      const aspectRatio = imageBitmap.height / imageBitmap.width;
      const canvasWidth = width;
      const canvasHeight = Math.round(width * aspectRatio);

      const offscreen = new OffscreenCanvas(canvasWidth, canvasHeight);
      const ctx = offscreen.getContext('2d');
      ctx?.drawImage(imageBitmap, 0, 0, canvasWidth, canvasHeight);

      return offscreen.convertToBlob({ type: 'image/png' });
    })
    .then((resizedBlob) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        // Ensure the result is a string (base64 data URL) before invoking callback
        if (typeof reader.result === 'string') {
          callback(reader.result);
        } else {
          console.error(
            'Unexpected FileReader result type',
            typeof reader.result,
          );
        }
      };
      reader.readAsDataURL(resizedBlob);
    })
    .catch((err) => {
      console.error('Failed to resize image:', err);
    });
}

/**
 * Retrieves a list of tab data objects for all tabs in the current window,
 * sorted by their lastActive timestamp in descending order (most recent first).
 * Only tab data with an id matching a tab in the current window are included.
 *
 * @param {function(Array<TabData>): void} callback - Function to call with the resulting array of tab data objects.
 */
function getTabDataList(callback) {
  // 1. Get all tabs in the current window
  chrome.tabs.query({ currentWindow: true }, (tabs) => {
    // Build a quick lookup so we can patch stored data with the latest info.
    /** @type {Map<number, chrome.tabs.Tab>} */
    const liveTabMap = new Map(
      tabs
        .filter((t) => typeof t.id === 'number')
        .map((t) => [/** @type {number} */ (t.id), t]),
    );

    const currentTabIds = new Set(liveTabMap.keys());

    // 2. Retrieve everything stored in chrome.storage.local
    chrome.storage.local.get(null, (items) => {
      const tabDataList = Object.values(items)
        // 3. Keep only objects that have an id matching a tab in the window
        .filter((item) => item && currentTabIds.has(item.id))
        // 4. Merge in the latest title & favicon from the live tab info so we
        //    always show up-to-date data in the switcher.
        .map((item) => {
          const live = liveTabMap.get(item.id);
          return live
            ? {
                ...item,
                title: live.title,
                favIconUrl: live.favIconUrl,
              }
            : item;
        })
        // 5. Sort by lastActive in descending order (most recent first)
        .sort((a, b) => b.lastActive - a.lastActive);

      callback(tabDataList);
    });
  });
}

/**
 * Injects the tab switcher content script into the given tab.
 * Skips chrome:// and other unsupported URLs.
 * @param {number} tabId - ID of the tab to inject into.
 * @param {string | undefined} url - URL of the tab (used for scheme check).
 */
function injectTabSwitcher(tabId, url) {
  // Ensure we have a valid numeric tabId
  if (typeof tabId !== 'number') return;

  if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) {
    return;
  }

  chrome.scripting.executeScript(
    {
      target: { tabId },
      files: ['tabSwitcherContent.js'],
    },
    () => {
      if (chrome.runtime.lastError) {
        console.warn(
          'Failed to inject TabSwitcher:',
          chrome.runtime.lastError.message,
        );
      }
    },
  );
}

// Handle keyboard shortcut defined in manifest to toggle the tab switcher overlay.
chrome.commands.onCommand.addListener((command) => {
  if (command !== 'toggle_tab_switcher') return;

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs.length) return;
    const activeTab = tabs[0];

    // Ensure content script is present before sending data.
    if (typeof activeTab.id === 'number') {
      injectTabSwitcher(activeTab.id, activeTab.url);
    }

    // Gather tab data (screenshots, metadata) and send to the content script.
    getTabDataList((tabDataList) => {
      if (typeof activeTab.id === 'number') {
        // Always sort the active tab to the first item in tabDataList
        const sortedTabDataList = [
          ...tabDataList.filter((tab) => tab.id === activeTab.id),
          ...tabDataList.filter((tab) => tab.id !== activeTab.id),
        ];
        chrome.tabs.sendMessage(activeTab.id, {
          type: 'show_tab_switcher',
          tabData: sortedTabDataList.slice(0, 5),
        });
      }
    });
  });
});

// Listen for requests from the content script to activate a given tab.
chrome.runtime.onMessage.addListener((message, sender) => {
  if (
    message &&
    message.type === 'activate_tab' &&
    typeof message.id === 'number'
  ) {
    chrome.tabs.update(message.id, { active: true });
  }
});
