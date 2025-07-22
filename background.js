import { injectTabSwitcher } from './components/content.js';
import { takeScreenshot } from './components/screenshot.js';
import { getTabDataList } from './components/storage.js';

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

// Handle keyboard shortcut defined in manifest to toggle the tab switcher overlay.
chrome.commands.onCommand.addListener((command) => {
  if (command !== 'toggle_tab_switcher') return;

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs.length) return;
    const activeTab = tabs[0];

    if (typeof activeTab.id !== 'number') return;

    // Inject (or reinject) the content script and, if the overlay is already
    // open, move selection to the next tab.
    injectTabSwitcher(activeTab.id, activeTab.url);
    chrome.tabs.sendMessage(activeTab.id, { type: 'advance_selection' });
  });
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
          (cmd) => cmd.name === 'toggle_tab_switcher',
        );
        const shortcut =
          toggleCmd && toggleCmd.shortcut ? toggleCmd.shortcut : undefined;

        sendResponse({
          type: 'tab_data',
          tabData: tabDataList.slice(0, 5),
          shortcut: shortcut,
        });
      });
    });
    return true; // Keep the message channel open for async sendResponse
  }
});
