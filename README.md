# Screenshot MCP Tool

An MCP server that allows Claude Code to take screenshots of your screen.

## Installation

1. Clone the repository:
```bash
git clone https://github.com/awlego/screenshot-mcp.git
cd screenshot-mcp
```

2. Install dependencies:
```bash
npm install
```

3. Build the project:
```bash
npm run build
```

4. Install the MCP server in Claude Code:
```bash
# Using the claude command (replace with your actual path)
claude mcp add screenshot "node" "$(pwd)/dist/index.js"
```

Or manually add to your Claude Code configuration (~/.config/claude/claude_desktop_config.json):
```json
{
  "mcpServers": {
    "screenshot": {
      "command": "node",
      "args": ["<path-to-screenshot-mcp>/dist/index.js"]
    }
  }
}
```

Replace `<path-to-screenshot-mcp>` with the full path to where you cloned the repository.

## Usage

Once configured, Claude Code has access to two tools:

### `take_screenshot`
Capture screenshots of your screen, specific windows, or interactively select areas.

**Parameters:**
- `filename` (optional): Custom filename for the screenshot (without extension). If not provided, uses timestamp format (YYYY-MM-DD_HH-MM-SS)
- `mode` (optional): Screenshot mode
  - `"fullscreen"` (default): Capture entire screen
  - `"window"`: Capture specific window by ID
  - `"interactive"`: User selects area/window interactively
- `windowId` (required for window mode): Window ID to capture. Use `list_windows` to get available IDs
- `display` (optional): Display number to capture (default: 1, fullscreen mode only)
- `includeWindowShadow` (optional): Include window shadow (default: true, window mode only)

### `list_windows`
List all available windows with their IDs, app names, and titles for targeted screenshot capture.

**Examples:**
- Take a fullscreen screenshot: `take_screenshot`
- Capture a specific window: First use `list_windows`, then `take_screenshot` with `mode: "window"` and the desired `windowId`
- Interactive selection: `take_screenshot` with `mode: "interactive"`

## Features

- 📸 Multiple capture modes: fullscreen, window-specific, and interactive
- 🏷️ Automatic timestamp-based filenames
- 📁 Auto-creation of screenshots folder
- 🖼️ Direct image display in Claude Code conversations
- 🪟 Window listing with app names and titles
- 🎯 Precise window targeting by ID

## Development

Run in development mode:
```bash
npm run dev
```