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

interface CachedWindow {
  windowId: number;
  appName: string;
  windowTitle: string;
  timestamp: number;
}

class WindowCache {
  private cache = new Map<string, CachedWindow>();
  private readonly CACHE_TTL = 30000; // 30 seconds

  private getCacheKey(appName: string, windowTitle: string): string {
    return `${appName}|||${windowTitle}`;
  }

  get(appName: string, windowTitle: string): number | null {
    const key = this.getCacheKey(appName, windowTitle);
    const cached = this.cache.get(key);
    
    if (!cached) return null;
    
    // Check if cache entry is expired
    if (Date.now() - cached.timestamp > this.CACHE_TTL) {
      this.cache.delete(key);
      return null;
    }
    
    return cached.windowId;
  }

  set(appName: string, windowTitle: string, windowId: number): void {
    const key = this.getCacheKey(appName, windowTitle);
    this.cache.set(key, {
      windowId,
      appName,
      windowTitle,
      timestamp: Date.now()
    });
  }

  clear(): void {
    this.cache.clear();
  }

  getStats(): { size: number; entries: CachedWindow[] } {
    return {
      size: this.cache.size,
      entries: Array.from(this.cache.values())
    };
  }
}

const windowCache = new WindowCache();

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
    properties: {
      forceRefresh: {
        type: "boolean",
        description: "Force refresh all window IDs, bypassing cache (default: false)",
      },
    },
  },
};

const CLEAR_CACHE_TOOL: Tool = {
  name: "clear_cache",
  description: "Clear the window ID cache and show cache statistics",
  inputSchema: {
    type: "object",
    properties: {},
  },
};

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [SCREENSHOT_TOOL, LIST_WINDOWS_TOOL, CLEAR_CACHE_TOOL],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  switch (request.params.name) {
    case "clear_cache":
      try {
        const stats = windowCache.getStats();
        windowCache.clear();
        
        return {
          content: [
            {
              type: "text",
              text: `Cache cleared. Previously contained ${stats.size} entries.`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error clearing cache: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }

    case "list_windows":
      try {
        const args = request.params.arguments as any;
        const forceRefresh = args?.forceRefresh || false;
        
        const applications = await getApplicationWindowsList(forceRefresh);
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
        
        const cacheStats = windowCache.getStats();
        const windowList = applications
          .map(app => {
            const windowEntries = app.windows
              .map(w => `  • "${w.windowTitle}" (ID: ${w.windowId})`)
              .join("\n");
            return `${app.appName}:\n${windowEntries}`;
          })
          .join("\n\n");
        
        const cacheInfo = forceRefresh ? 
          "\n\n[Cache bypassed - all window IDs refreshed]" : 
          `\n\n[Cache: ${cacheStats.size} entries]`;
        
        return {
          content: [
            {
              type: "text",
              text: `Available applications and windows:\n\n${windowList}${cacheInfo}`,
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
          // App-specific screenshot using cached window IDs when possible
          let windowId: number;
          
          if (windowName) {
            // Try cache first for specific window name
            windowId = windowCache.get(appName, windowName) || 0;
            
            if (!windowId) {
              // Cache miss - use GetWindowID
              try {
                const { stdout: windowIdStr } = await execAsync(`GetWindowID "${appName}" "${windowName}"`);
                windowId = parseInt(windowIdStr.trim());
                if (isNaN(windowId)) {
                  throw new Error(`Invalid window ID returned for ${appName} - ${windowName}`);
                }
                // Cache the result
                windowCache.set(appName, windowName, windowId);
              } catch (error) {
                throw new Error(`Could not find window "${windowName}" in application "${appName}". Use list_windows to see available windows.`);
              }
            }
          } else {
            // Find first available window for the app using fast cached lookup
            windowId = await getFirstWindowIdForApp(appName);
            if (!windowId) {
              throw new Error(`No windows found for application "${appName}". Use list_windows to see available applications.`);
            }
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

async function getFirstWindowIdForApp(appName: string): Promise<number> {
  try {
    // First check cache for any windows of this app
    const cacheStats = windowCache.getStats();
    const cachedWindow = cacheStats.entries.find(entry => 
      entry.appName.toLowerCase() === appName.toLowerCase()
    );
    
    if (cachedWindow) {
      return cachedWindow.windowId;
    }
    
    // Cache miss - use direct AppleScript approach to avoid recursion
    const appleScript = `
      tell application "System Events"
        try
          set appProcess to first application process whose name is "${appName}"
          set firstWindow to first window of appProcess
          return name of firstWindow
        on error
          return "NOT_FOUND"
        end try
      end tell
    `;
    
    const fs = await import("fs/promises");
    const os = await import("os");
    const path = await import("path");
    
    const tmpFile = path.join(os.tmpdir(), 'getFirstWindow.scpt');
    await fs.writeFile(tmpFile, appleScript);
    
    const { stdout } = await execAsync(`osascript ${tmpFile}`);
    await fs.unlink(tmpFile);
    
    const windowTitle = stdout.trim();
    
    if (windowTitle === "NOT_FOUND" || !windowTitle) {
      return 0;
    }
    
    // Get window ID for this specific window
    try {
      const { stdout: windowIdStr } = await execAsync(`GetWindowID "${appName}" "${windowTitle}"`);
      const windowId = parseInt(windowIdStr.trim());
      
      if (!isNaN(windowId)) {
        // Cache the result
        windowCache.set(appName, windowTitle, windowId);
        return windowId;
      }
    } catch (error) {
      console.error(`Failed to get window ID for ${appName} - ${windowTitle}:`, error);
    }
    
    return 0;
  } catch (error) {
    console.error(`Error getting first window ID for ${appName}:`, error);
    return 0;
  }
}

async function getApplicationWindowsList(forceRefresh = false): Promise<ApplicationWindows[]> {
  const windows = await getWindowList(forceRefresh);
  
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

async function getWindowList(forceRefresh = false): Promise<WindowInfo[]> {
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
    
    // Get window IDs for each window, using cache when possible
    for (const windowString of windowStrings) {
      const parts = windowString.split("|||");
      if (parts.length === 2) {
        const appName = parts[0];
        const windowTitle = parts[1];
        
        let windowId: number;
        
        // Try cache first (unless force refresh is requested)
        if (!forceRefresh) {
          windowId = windowCache.get(appName, windowTitle) || 0;
        } else {
          windowId = 0;
        }
        
        if (!windowId) {
          // Cache miss or force refresh - use GetWindowID
          try {
            const { stdout: windowIdStr } = await execAsync(`GetWindowID "${appName}" "${windowTitle}"`);
            windowId = parseInt(windowIdStr.trim());
            
            if (!isNaN(windowId)) {
              // Cache the result
              windowCache.set(appName, windowTitle, windowId);
            }
          } catch (error) {
            // If GetWindowID fails for this window, skip it
            console.error(`Failed to get window ID for ${appName} - ${windowTitle}:`, error);
            continue;
          }
        }
        
        if (!isNaN(windowId) && windowId > 0) {
          windows.push({
            windowId,
            appName,
            windowTitle
          });
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