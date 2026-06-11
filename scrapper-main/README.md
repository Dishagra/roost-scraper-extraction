# Web Artifact Collector

A browser extension that collects webpage artifacts while browsing and exports them as a structured ZIP archive.

## What it does

`Web Artifact Collector` captures:
- page URL and title
- capture timestamp
- visible page text
- full HTML snapshot
- image metadata and source URLs
- visible viewport screenshot
- page meta tags and viewport info

It can run continuously while browsing or capture a single page on demand.

## Installation

1. Open your browser's extensions page:
   - Chrome: `chrome://extensions`
   - Edge: `edge://extensions`
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select the `web-artifact-collector-extension` folder.

## Usage

1. Click the extension icon to open the popup.
2. Use the buttons:
   - **Start Capture**: begin automatic capture for pages in the active window.
   - **Pause Capture**: stop automatic capture.
   - **Capture Current Page**: manually capture the current tab.
   - **Export ZIP**: create and download a ZIP archive of all captured artifacts.
   - **Clear Data**: delete all captured records and reset state.
3. The popup shows current status, session ID, capture count, and mode.

## Export format

The ZIP export includes:
- `captures.csv` — index of captured pages.
- `metadata.json` — session metadata and record summary.
- `visible_text/` — extracted visible text files.
- `html_snapshots/` — HTML snapshot files.
- `screenshots/` — visible viewport screenshots.
- `image_urls/` — JSON files with image sources.
- `README.txt` — brief export overview.

> Note: OCR is intentionally not performed in the extension. Run OCR later on downloaded screenshots if needed.

## Files and architecture

- `manifest.json` — extension metadata and permissions.
- `background.js` — service worker logic, capture control, state management, export builder.
- `content.js` — in-page collector for text, HTML, images, and metadata.
- `popup.html`, `popup.js`, `popup.css` — user interface for control and status.
- `icons/` — extension icons.

## Permissions

The extension requests:
- `activeTab`
- `tabs`
- `scripting`
- `storage`
- `downloads`
- `unlimitedStorage`
- `host_permissions`: `<all_urls>`

## Notes

- Only `http://` and `https://` pages are captured.
- The screenshot is of the visible tab viewport and may not capture full page content.
- Captured data is stored locally in extension storage until cleared.

## Development

To modify the extension, edit `background.js`, `content.js`, or the popup files and reload the extension from the extensions page.
