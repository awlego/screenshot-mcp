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

Once configured, Claude Code can use the `take_screenshot` tool to:
- Capture screenshots of your screen
- Save them to a `screenshots` folder in the current working directory
- Display the screenshot directly in the conversation

### Tool Parameters

- `filename` (optional): Custom filename for the screenshot (without extension)
- `display` (optional): Display number to capture (default: 1)

## Development

Run in development mode:
```bash
npm run dev
```