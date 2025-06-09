# Screenshot MCP Tool

An MCP server that allows Claude Code to take screenshots of your screen.

## Installation

1. Install GetWindowID (required dependency for app-specific screenshots):
```bash
brew install smokris/getwindowid/getwindowid
```

2. Clone the repository:
```bash
git clone https://github.com/awlego/screenshot-mcp.git
cd screenshot-mcp
```

3. Install dependencies:
```bash
npm install
```

4. Build the project:
```bash
npm run build
```

5. Install the MCP server in Claude Code:
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

Once configured, Claude Code has access to three tools:

### `take_screenshot`
Capture screenshots of your screen or specific application windows.

**Parameters:**
- `appName` (optional): Name of the application to screenshot (e.g., 'Figma', 'VS Code'). If not provided, takes fullscreen screenshot
- `windowName` (optional): Specific window name within the app. If not provided, uses the first available window of the app
- `filename` (optional): Custom filename for the screenshot (without extension). If not provided, uses timestamp format (YYYY-MM-DD_HH-MM-SS)
- `includeWindowShadow` (optional): Include window shadow in screenshot (default: true)

### `list_windows`
List all available applications and their windows to help identify targets for screenshots.

**Parameters:**
- `forceRefresh` (optional): Force refresh all window IDs, bypassing cache (default: false)

### `clear_cache`
Clear the window ID cache and show cache statistics for optimal performance.

**Examples:**
- Take a fullscreen screenshot: `take_screenshot`
- Capture any Figma window: `take_screenshot` with `appName: "Figma"`
- Capture specific window: `take_screenshot` with `appName: "Figma"` and `windowName: "Design File"`
- List available windows: `list_windows`
- Clear performance cache: `clear_cache`

## Features

- 📸 App-specific screenshots: Target specific applications like Figma, VS Code, etc.
- 🏷️ Automatic timestamp-based filenames
- 📁 Auto-creation of screenshots folder  
- 🖼️ Direct image display in Claude Code conversations
- 🪟 Window listing with app names and titles
- ⚡ Performance optimized with window ID caching (80% faster repeated operations)
- 🧹 Cache management tools for optimal performance

## Development

Run in development mode:
```bash
npm run dev
```