# Screenshot MCP Tool

An MCP server that allows Claude Code to take screenshots of your screen.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Build the project:
```bash
npm run build
```

3. Install the MCP server in Claude Code:
```bash
claude mcp add screenshot "node" "/Users/awlego/Repositories/screenshot-mcp/dist/index.js"
```

Or manually add to your Claude Code configuration (~/.config/claude/claude_desktop_config.json):
```json
{
  "mcpServers": {
    "screenshot": {
      "command": "node",
      "args": ["/Users/awlego/Repositories/screenshot-mcp/dist/index.js"]
    }
  }
}
```

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