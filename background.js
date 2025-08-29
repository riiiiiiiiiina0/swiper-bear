import { takeScreenshot } from './components/screenshot.js';
import { getTabDataList } from './components/storage.js';

// Clear any previously saved tab data when the extension is installed or updated
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.clear();
});

/**
 * Takes a screenshot of the newly activated tab
 */
chrome.tabs.onActivated.addListener((activeInfo) => {
  chrome.tabs.get(activeInfo.tabId, (tab) => {
    takeScreenshot(tab);
  });
});

/**
 * Takes a screenshot when an active tab finishes loading
 */
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.active) {
    takeScreenshot(tab);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Activate a specific tab
  if (
    message &&
    message.type === 'activate_tab' &&
    typeof message.id === 'number'
  ) {
    chrome.tabs.update(message.id, { active: true });
  }

  // Content script requests recent tab data – gather and reply asynchronously
  else if (message && message.type === 'request_tab_data') {
    // Get the recent tab data
    getTabDataList(sender?.tab?.id || 0, (tabDataList) => {
      sendResponse({
        type: 'tab_data',
        tabData: tabDataList, // provide up to 10 tabs
      });
    });
    return true; // Keep the message channel open for async sendResponse
  }
});
