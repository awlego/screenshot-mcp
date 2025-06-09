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

interface WindowInfo {
  windowId: number;
  appName: string;
  windowTitle: string;
}

interface ApplicationWindows {
  appName: string;
  windows: Array<{
    windowId: number;
    windowTitle: string;
  }>;
}

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
  description: "Take a screenshot of a specific application window or the full screen. Examples: 'take a screenshot of figma', 'take a screenshot of the godot game window'",
  inputSchema: {
    type: "object",
    properties: {
      appName: {
        type: "string",
        description: "Name of the application to screenshot (e.g., 'Figma', 'Godot'). If not provided, takes fullscreen screenshot.",
      },
      windowName: {
        type: "string",
        description: "Specific window name within the app (optional). If not provided, uses the first available window of the app.",
      },
      filename: {
        type: "string",
        description: "Optional filename for the screenshot (without extension). If not provided, uses timestamp.",
      },
      includeWindowShadow: {
        type: "boolean",
        description: "Include window shadow in screenshot (default: true)",
      },
    },
  },
};

const LIST_WINDOWS_TOOL: Tool = {
  name: "list_windows", 
  description: "List all available applications and their windows to help identify targets for screenshots",
  inputSchema: {
    type: "object",
    properties: {},
  },
};

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [SCREENSHOT_TOOL, LIST_WINDOWS_TOOL],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  switch (request.params.name) {
    case "list_windows":
      try {
        const applications = await getApplicationWindowsList();
        if (applications.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: "No windows found. Make sure you have granted accessibility permissions to Terminal in System Preferences > Security & Privacy > Privacy > Accessibility.",
              },
            ],
          };
        }
        
        const windowList = applications
          .map(app => {
            const windowEntries = app.windows
              .map(w => `  • "${w.windowTitle}" (ID: ${w.windowId})`)
              .join("\n");
            return `${app.appName}:\n${windowEntries}`;
          })
          .join("\n\n");
        
        return {
          content: [
            {
              type: "text",
              text: `Available applications and windows:\n\n${windowList}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error listing windows: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }

    case "take_screenshot":
      const args = request.params.arguments as any;
      const filename = args?.filename || `screenshot_${formatTimestamp()}`;
      const appName = args?.appName;
      const windowName = args?.windowName;
      const includeWindowShadow = args?.includeWindowShadow !== false;

      try {
        // Get the current working directory where Claude Code is running
        const cwd = process.cwd();
        const screenshotsDir = join(cwd, "screenshots");

        // Create screenshots directory if it doesn't exist
        if (!existsSync(screenshotsDir)) {
          await mkdir(screenshotsDir, { recursive: true });
        }

        const screenshotPath = join(screenshotsDir, `${filename}.png`);

        let command: string;
        
        if (appName) {
          // App-specific screenshot using GetWindowID
          let windowId: number;
          
          if (windowName) {
            // Use specific window name
            try {
              const { stdout: windowIdStr } = await execAsync(`GetWindowID "${appName}" "${windowName}"`);
              windowId = parseInt(windowIdStr.trim());
              if (isNaN(windowId)) {
                throw new Error(`Invalid window ID returned for ${appName} - ${windowName}`);
              }
            } catch (error) {
              throw new Error(`Could not find window "${windowName}" in application "${appName}". Use list_windows to see available windows.`);
            }
          } else {
            // Find first available window for the app
            const applications = await getApplicationWindowsList();
            const targetApp = applications.find(app => app.appName.toLowerCase() === appName.toLowerCase());
            if (!targetApp || targetApp.windows.length === 0) {
              throw new Error(`No windows found for application "${appName}". Use list_windows to see available applications.`);
            }
            windowId = targetApp.windows[0].windowId;
          }
          
          const shadowFlag = includeWindowShadow ? "" : "-o";
          command = `screencapture -x ${shadowFlag} -l ${windowId} "${screenshotPath}"`;
        } else {
          // Fullscreen screenshot
          command = `screencapture -x "${screenshotPath}"`;
        }

        await execAsync(command);

        // Check if file was created
        if (!existsSync(screenshotPath)) {
          return {
            content: [
              {
                type: "text",
                text: "Screenshot failed to save.",
              },
            ],
          };
        }

        const appInfo = appName ? ` of ${appName}${windowName ? ` (${windowName})` : ''}` : '';
        return {
          content: [
            {
              type: "text",
              text: `Screenshot${appInfo} saved to: ${screenshotPath}`,
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

    default:
      throw new Error(`Unknown tool: ${request.params.name}`);
  }
});

async function readFileAsBase64(filePath: string): Promise<string> {
  const { readFile } = await import("fs/promises");
  const buffer = await readFile(filePath);
  return buffer.toString("base64");
}

async function getApplicationWindowsList(): Promise<ApplicationWindows[]> {
  const windows = await getWindowList();
  
  // Group windows by application
  const appMap = new Map<string, ApplicationWindows>();
  
  for (const window of windows) {
    if (!appMap.has(window.appName)) {
      appMap.set(window.appName, {
        appName: window.appName,
        windows: []
      });
    }
    
    appMap.get(window.appName)!.windows.push({
      windowId: window.windowId,
      windowTitle: window.windowTitle
    });
  }
  
  // Convert to array and sort by app name
  return Array.from(appMap.values()).sort((a, b) => 
    a.appName.localeCompare(b.appName)
  );
}

async function getWindowList(): Promise<WindowInfo[]> {
  try {
    // Get list of all windows from all applications
    const appleScript = `
      set windowList to {}
      tell application "System Events"
        repeat with appProcess in (every application process whose visible is true)
          set appName to name of appProcess
          try
            repeat with aWindow in windows of appProcess
              set windowTitle to name of aWindow
              set end of windowList to appName & "|||" & windowTitle
            end repeat
          end try
        end repeat
      end tell
      return windowList
    `;
    
    // Write script to temp file and execute
    const fs = await import("fs/promises");
    const os = await import("os");
    const path = await import("path");
    
    const tmpFile = path.join(os.tmpdir(), 'getWindows.scpt');
    await fs.writeFile(tmpFile, appleScript);
    
    const { stdout } = await execAsync(`osascript ${tmpFile}`);
    
    // Clean up temp file
    await fs.unlink(tmpFile);
    
    if (!stdout.trim()) {
      return [];
    }
    
    // Parse the window list
    const windowStrings = stdout.trim().split(", ");
    const windows: WindowInfo[] = [];
    
    // Get window IDs for each window using GetWindowID
    for (const windowString of windowStrings) {
      const parts = windowString.split("|||");
      if (parts.length === 2) {
        const appName = parts[0];
        const windowTitle = parts[1];
        
        try {
          // Use GetWindowID to get the actual window ID
          const { stdout: windowIdStr } = await execAsync(`GetWindowID "${appName}" "${windowTitle}"`);
          const windowId = parseInt(windowIdStr.trim());
          
          if (!isNaN(windowId)) {
            windows.push({
              windowId,
              appName,
              windowTitle
            });
          }
        } catch (error) {
          // If GetWindowID fails for this window, skip it
          console.error(`Failed to get window ID for ${appName} - ${windowTitle}:`, error);
        }
      }
    }
    
    return windows;
  } catch (error) {
    console.error("Error getting window list:", error);
    return [];
  }
}

function formatTimestamp(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
}

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);