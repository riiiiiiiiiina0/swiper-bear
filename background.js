chrome.tabs.onActivated.addListener(activeInfo => {
  chrome.tabs.get(activeInfo.tabId, (tab) => {
    if (tab.status === 'complete') {
      takeScreenshot(tab);
    }
  });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.active) {
    takeScreenshot(tab);
  }
});

function takeScreenshot(tab) {
  chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' }, (dataUrl) => {
    if (chrome.runtime.lastError) {
      console.error(chrome.runtime.lastError.message);
      return;
    }
    resizeImage(dataUrl, 300, (resizedDataUrl) => {
      const tabData = {
        id: tab.id,
        title: tab.title,
        favIconUrl: tab.favIconUrl,
        lastActive: new Date().toISOString(),
        screenshot: resizedDataUrl
      };
      chrome.storage.local.set({ [tab.id]: tabData }, () => {
        console.log(`Screenshot saved for tab ${tab.id}`);
      });
    });
  });
}

function resizeImage(dataUrl, width, callback) {
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const aspectRatio = img.height / img.width;
    canvas.width = width;
    canvas.height = width * aspectRatio;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    callback(canvas.toDataURL('image/png'));
  };
  img.src = dataUrl;
}
