import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { exec } from "child_process";
import { promisify } from "util";
import { mkdir, writeFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";

const execAsync = promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const server = new Server(
  {
    name: "screenshot-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

const SCREENSHOT_TOOL: Tool = {
  name: "take_screenshot",
  description: "Take a screenshot of the screen and save it to the screenshots folder",
  inputSchema: {
    type: "object",
    properties: {
      filename: {
        type: "string",
        description: "Optional filename for the screenshot (without extension). If not provided, uses timestamp.",
      },
      display: {
        type: "number",
        description: "Display number to capture (default: 1)",
      },
    },
  },
};

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [SCREENSHOT_TOOL],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name !== "take_screenshot") {
    throw new Error(`Unknown tool: ${request.params.name}`);
  }

  const args = request.params.arguments as any;
  const filename = args?.filename || `screenshot_${Date.now()}`;
  const display = args?.display || 1;

  try {
    // Get the current working directory where Claude Code is running
    const cwd = process.cwd();
    const screenshotsDir = join(cwd, "screenshots");

    // Create screenshots directory if it doesn't exist
    if (!existsSync(screenshotsDir)) {
      await mkdir(screenshotsDir, { recursive: true });
    }

    const screenshotPath = join(screenshotsDir, `${filename}.png`);

    // Take screenshot using macOS screencapture command
    const command = `screencapture -x -D ${display} "${screenshotPath}"`;
    await execAsync(command);

    return {
      content: [
        {
          type: "text",
          text: `Screenshot saved to: ${screenshotPath}`,
        },
        {
          type: "image",
          data: await readFileAsBase64(screenshotPath),
          mimeType: "image/png",
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error taking screenshot: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
});

async function readFileAsBase64(filePath: string): Promise<string> {
  const { readFile } = await import("fs/promises");
  const buffer = await readFile(filePath);
  return buffer.toString("base64");
}

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);