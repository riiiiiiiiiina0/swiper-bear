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

// Track popup connection to know if popup is open
/** @type {chrome.runtime.Port | null} */
let popupPort = null;

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'popup') {
    popupPort = port;
    port.onDisconnect.addListener(() => {
      popupPort = null;
    });
  }
});

// Command handler for opening popup and advancing selection when already open
chrome.commands.onCommand.addListener((command) => {
  if (command === 'open_switcher') {
    if (popupPort) {
      try {
        popupPort.postMessage({ type: 'popup_select_next' });
      } catch (e) {
        // If posting failed, clear the port and try opening popup
        popupPort = null;
        chrome.action.openPopup(() => void chrome.runtime.lastError);
      }
    } else {
      chrome.action.openPopup(() => void chrome.runtime.lastError);
    }
  } else if (
    command === 'switch-to-left-tab' ||
    command === 'switch-to-right-tab'
  ) {
    // a more robust way to switch tabs without race conditions
    chrome.tabs.query({ currentWindow: true }, (tabs) => {
      const activeTab = tabs.find((tab) => tab.active);
      if (!activeTab) return; // Should not happen
      const activeIndex = tabs.findIndex((tab) => tab.id === activeTab.id);

      let newIndex;
      if (command === 'switch-to-left-tab') {
        newIndex = (activeIndex - 1 + tabs.length) % tabs.length;
      } else {
        newIndex = (activeIndex + 1) % tabs.length;
      }
      chrome.tabs.update(tabs[newIndex].id, { active: true });
    });
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
    getTabDataList((tabDataList) => {
      // Find the open_switcher command to get its shortcut
      // Get the actual shortcut keys for the command and include in the response
      chrome.commands.getAll((commands) => {
        const toggleCmd = commands.find((cmd) => cmd.name === 'open_switcher');
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
