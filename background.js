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
    title: tab.title,
    favIconUrl: tab.favIconUrl,
    lastActive: new Date().getTime(),
  };
  console.log('Take screenshot for tab', tabData);

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
          console.log(`Screenshot saved for tab ${id}`);
          console.log(
            '%c ',
            `font-size:300px; background:url(${resizedDataUrl}) no-repeat; background-size: contain;`,
          );
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
