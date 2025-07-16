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

/**
 * Takes a screenshot of the specified tab and saves it to local storage
 * @param {chrome.tabs.Tab} tab - The tab object to capture
 * The function captures the visible area, resizes it, and stores it along with tab metadata
 */
function takeScreenshot(tab) {
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
        console.error(chrome.runtime.lastError.message);
        return;
      }
      resizeImage(dataUrl, 300, (resizedDataUrl) => {
        tabData.screenshot = resizedDataUrl;
        chrome.storage.local.set({ [`tab-${id}`]: tabData }, () => {
          console.log(`Screenshot saved for tab ${id}`);
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
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const aspectRatio = img.height / img.width;
    canvas.width = width;
    canvas.height = width * aspectRatio;
    ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
    callback(canvas.toDataURL('image/png'));
  };
  img.src = dataUrl;
}
