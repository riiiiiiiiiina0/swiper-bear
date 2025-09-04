/**
 * Resizes an image to a specified width while maintaining aspect ratio
 * @param {string} dataUrl - The base64 data URL of the image to resize
 * @param {number} width - The target width in pixels
 * @param {function(string): void} callback - Callback function that receives the resized image as a data URL
 */
export function resizeImage(dataUrl, width, callback) {
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

      return offscreen.convertToBlob({ type: 'image/jpeg', quality: 0.7 });
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
