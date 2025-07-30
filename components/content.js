/**
 * Injects the tab switcher content script into the given tab.
 * Skips chrome:// and other unsupported URLs.
 * @param {number} tabId - ID of the tab to inject into.
 * @param {string | undefined} url - URL of the tab (used for scheme check).
 */
export function injectTabSwitcher(tabId, url) {
  // Ensure we have a valid numeric tabId
  if (typeof tabId !== 'number') return;

  if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) {
    return;
  }

  chrome.scripting.executeScript(
    {
      target: { tabId },
      files: ['tabSwitcherContent.js'],
      injectImmediately: true
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
