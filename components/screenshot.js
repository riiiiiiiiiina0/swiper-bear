import { resizeImage } from './image.js';
import { saveTabData } from './storage.js';

const MAX_SCREENSHOT_RETRIES = 3;
const SCREENSHOT_RETRY_DELAY_MS = 200;

/**
 * Takes a screenshot of the specified tab and saves it to local storage
 * @param {chrome.tabs.Tab} tab - The tab object to capture
 * The function captures the visible area, resizes it, and stores it along with tab metadata
 */
export function takeScreenshot(tab, retryCount = 0) {
  const id = tab.id;
  if (!id) return;

  // if page url not start with http:// or https://, return
  if (
    !tab.url ||
    (!tab.url.startsWith('http://') && !tab.url.startsWith('https://'))
  )
    return;

  /** @type {import('./storage').TabData} */
  const tabData = {
    id,
    lastActive: new Date().getTime(),
    title: tab.title,
    favIconUrl: tab.favIconUrl,
  };

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
        saveTabData(id, tabData);
      });
    },
  );
}
