import { injectTabSwitcher } from './components/content.js';
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

// Handle keyboard shortcut to toggle the tab switcher overlay.
chrome.action.onClicked.addListener((activeTab) => {
  if (typeof activeTab.id !== 'number') return;

  // Inject (or reinject) the content script and, if the overlay is already
  // open, move selection to the next tab.
  injectTabSwitcher(activeTab.id, activeTab.url);
  chrome.tabs.sendMessage(activeTab.id, { type: 'advance_selection' });
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
      // Get the actual shortcut keys for the command and include in the response
      chrome.commands.getAll((commands) => {
        const toggleCmd = commands.find(
          (cmd) => cmd.name === '_execute_action',
        );
        const shortcut =
          toggleCmd && toggleCmd.shortcut ? toggleCmd.shortcut : undefined;

        sendResponse({
          type: 'tab_data',
          tabData: tabDataList, // provide up to 10 tabs
          shortcut: shortcut,
        });
      });
    });
    return true; // Keep the message channel open for async sendResponse
  }
});
