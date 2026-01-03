# Ténati highlighter (Chrome)

A lightweight Chrome extension that surfaces a floating highlighter whenever you select text. Hover or click the capsule to open a modern panel with pastel tones, then apply the color to the selection.

> **Note:** This is a Chrome Manifest v3 compatible port of the original [Firefox extension](https://github.com/bombardeenlima/t-nati) by [bombardeenlima](https://github.com/bombardeenlima).

## Installation

### From Source

1. Clone this repository:
   ```bash
   git clone https://github.com/ecuware/t-nati-for-chrome.git
   cd t-nati-for-chrome
   ```

2. Open Chrome and navigate to `chrome://extensions/`

3. Enable "Developer mode" (toggle in the top right)

4. Click "Load unpacked" and select the project directory

### From Chrome Web Store

_Coming soon - pending publication_

## Features

- Detects text selections on any page and positions an inline floating action button nearby
- Panel reveals on hover/click with six curated pastel swatches (Apricot, Coral, Pistachio, Mint, Periwinkle, and Lavender)
- Highlights persist per page via `chrome.storage.local`, so they reappear the next time you open the document
- Saved highlights live inside the extension popup (click the ténati icon) where you can manage, focus, or delete them
- Export highlights as Markdown files or export the entire page as PDF directly from the popup
- Highlights are injected as `<mark>` elements with rounded edges so copied text stays intact
- Optimized text readability with enhanced contrast and text shadows for all highlight colors

## Technical Details

### Chrome Manifest v3 Compatibility

This version has been fully migrated from Firefox WebExtensions to Chrome Manifest v3:

- **Manifest Version**: 3
- **API Usage**: Uses `chrome.*` APIs exclusively (Firefox `browser.*` APIs removed)
- **Permissions**: 
  - `tabs` - For accessing active tab information
  - `storage` - For persisting highlights per page
  - `scripting` - For content script injection when needed
- **Host Permissions**: `http://*/*`, `https://*/*` for content script access
- **Content Scripts**: Auto-injected on document idle for all HTTP/HTTPS pages

### Key Differences from Firefox Version

- Removed all Firefox-specific `browser.*` API fallbacks
- Content script readiness checking with retry mechanism
- Enhanced error handling for Chrome-specific messaging
- Improved text readability with stronger contrast for all highlight colors

## Usage

1. **Highlight Text**: Select any text on a webpage. A floating action button will appear near your selection.

2. **Choose Color**: Hover over or click the button to reveal the color panel. Select one of six pastel colors.

3. **Manage Highlights**: Click the extension icon in the toolbar to:
   - View all highlights for the current page
   - Scroll to a specific highlight
   - Delete individual highlights
   - Clear all highlights
   - Export highlights as Markdown
   - Export the page as PDF

4. **Edit Highlights**: Click on an existing highlight to reveal action buttons for restyling or deletion.

## Notes

- Highlights are scoped per page URL; clearing site data or using incognito mode will bypass storage
- Clicking an existing highlight surfaces a bubble with Highlight + Delete controls side-by-side, so you can restyle or remove inline
- Both the highlight trigger and inline delete bubble share the same blurred capsule so interactions feel consistent
- The UI intentionally detaches when you scroll or click elsewhere to stay unobtrusive
- Highlights persist across page reloads but are cleared when browser data is cleared

## Development

### Project Structure

```
t-nati-for-chrome/
├── manifest.json          # Chrome Manifest v3 configuration
├── popup/                 # Extension popup UI
│   ├── popup.html
│   ├── popup.js
│   └── popup.css
├── scripts/               # Content scripts
│   └── highlighter.js    # Main highlighting logic
├── styles/               # Content script styles
│   └── panel.css         # Highlight and UI styles
├── assets/               # Icons and assets
└── README.md
```

### Building

No build process required. The extension works directly from source.

### Testing

1. Load the extension in Chrome as described in Installation
2. Navigate to any webpage
3. Select text and verify highlighting works
4. Test popup functionality by clicking the extension icon
5. Verify highlights persist after page reload

## Credits

Original Firefox extension by [bombardeenlima](https://github.com/bombardeenlima/t-nati)

## License

_Check original repository for license information_
