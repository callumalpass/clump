/**
 * File download utilities for triggering browser downloads
 */

/**
 * Triggers a file download in the browser.
 * Creates a temporary blob URL, triggers a download via a hidden anchor element,
 * and cleans up resources afterwards.
 *
 * @param content - The file content to download
 * @param filename - The name for the downloaded file
 * @param mimeType - The MIME type of the content (e.g., 'text/plain', 'application/json')
 */
export function downloadFile(
  content: string,
  filename: string,
  mimeType: string
): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

/**
 * Sanitizes a string for use as a filename by replacing non-alphanumeric
 * characters with hyphens and converting to lowercase.
 *
 * @param title - The title to sanitize
 * @returns A filename-safe string
 */
export function sanitizeFilename(title: string): string {
  return title.replace(/[^a-z0-9]/gi, '-').toLowerCase();
}
