import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

interface ModuleInfo {
  name: string;
  path: string;
  description: string;
  layer: "core" | "tools" | "services" | "ui" | "commands" | "infra" | "data" | "entry";
  fileCount: number;
  lineCount: number;
  children: ModuleInfo[];
  keyFiles: string[];
  dependencies: string[];
}

function countLines(filePath: string): number {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    return content.split("\n").length;
  } catch {
    return 0;
  }
}

function scanDirectory(
  dirPath: string,
  extensions = [".ts", ".tsx", ".js", ".jsx"]
): { fileCount: number; lineCount: number; files: string[] } {
  let fileCount = 0;
  let lineCount = 0;
  const files: string[] = [];

  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "node_modules") {
        const sub = scanDirectory(fullPath, extensions);
        fileCount += sub.fileCount;
        lineCount += sub.lineCount;
        files.push(...sub.files);
      } else if (entry.isFile() && extensions.some((ext) => entry.name.endsWith(ext))) {
        fileCount++;
        lineCount += countLines(fullPath);
        files.push(entry.name);
      }
    }
  } catch {
    // directory might not exist
  }

  return { fileCount, lineCount, files };
}

function getSubmodules(dirPath: string): string[] {
  try {
    return fs
      .readdirSync(dirPath, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith("."))
      .map((e) => e.name);
  } catch {
    return [];
  }
}

function buildModuleInfo(
  name: string,
  dirPath: string,
  description: string,
  layer: ModuleInfo["layer"],
  deps: string[]
): ModuleInfo {
  const stats = scanDirectory(dirPath);
  const subDirs = getSubmodules(dirPath);

  const children: ModuleInfo[] = subDirs.slice(0, 20).map((sub) => {
    const subStats = scanDirectory(path.join(dirPath, sub));
    return {
      name: sub,
      path: `${name}/${sub}`,
      description: "",
      layer,
      fileCount: subStats.fileCount,
      lineCount: subStats.lineCount,
      children: [],
      keyFiles: subStats.files.slice(0, 8),
      dependencies: [],
    };
  });

  return {
    name,
    path: name,
    description,
    layer,
    fileCount: stats.fileCount,
    lineCount: stats.lineCount,
    children,
    keyFiles: stats.files.filter((f) => !subDirs.includes(f.replace(/\.[^.]+$/, ""))).slice(0, 10),
    dependencies: deps,
  };
}

export async function GET() {
  const srcDir = path.resolve(process.cwd(), "../src");

  const modules: ModuleInfo[] = [
    buildModuleInfo("entrypoints", path.join(srcDir, "entrypoints"), "CLI, SDK & MCP server entry points and initialization", "entry", ["services", "tools", "commands", "components"]),
    buildModuleInfo("tools", path.join(srcDir, "tools"), "44 agent tool implementations (Bash, File I/O, Search, MCP, Tasks)", "tools", ["services", "utils"]),
    buildModuleInfo("commands", path.join(srcDir, "commands"), "50+ slash commands (/commit, /review, /config, etc.)", "commands", ["services", "tools", "utils"]),
    buildModuleInfo("components", path.join(srcDir, "components"), "140+ Ink/React terminal UI components", "ui", ["hooks", "state", "services"]),
    buildModuleInfo("services", path.join(srcDir, "services"), "API adapters, auth, MCP, LSP, analytics, audit, plugins", "services", ["utils"]),
    buildModuleInfo("hooks", path.join(srcDir, "hooks"), "React hooks for permissions, keybindings, commands, settings", "ui", ["state", "services"]),
    buildModuleInfo("state", path.join(srcDir, "state"), "React context + custom AppState store", "data", ["utils"]),
    buildModuleInfo("utils", path.join(srcDir, "utils"), "Shell, file ops, permissions, config, git, model selection, telemetry", "infra", []),
    buildModuleInfo("screens", path.join(srcDir, "screens"), "Full-screen UIs (Doctor, REPL, Resume, Compact)", "ui", ["components", "hooks", "state"]),
    buildModuleInfo("skills", path.join(srcDir, "skills"), "Bundled skills + skill loader system", "tools", ["services", "utils"]),
    buildModuleInfo("plugins", path.join(srcDir, "plugins"), "Plugin marketplace & loader system", "services", ["utils"]),
    buildModuleInfo("coordinator", path.join(srcDir, "coordinator"), "Multi-agent coordination & supervisor logic", "core", ["services", "tools", "utils"]),
    buildModuleInfo("tasks", path.join(srcDir, "tasks"), "Task management (shell tasks, agent tasks, teammates)", "core", ["services", "utils"]),
    buildModuleInfo("context", path.join(srcDir, "context"), "React context providers (notifications, stats, FPS)", "data", []),
    buildModuleInfo("memdir", path.join(srcDir, "memdir"), "Persistent memory system (CLAUDE.md, user/project memory)", "data", ["utils"]),
    buildModuleInfo("keybindings", path.join(srcDir, "keybindings"), "Vim mode & keybinding configuration", "ui", ["utils"]),
    buildModuleInfo("types", path.join(srcDir, "types"), "TypeScript type definitions", "infra", []),
    buildModuleInfo("migrations", path.join(srcDir, "migrations"), "Config migrations between versions", "infra", ["utils"]),
    buildModuleInfo("query", path.join(srcDir, "query"), "Query pipeline & processing", "core", ["services", "tools"]),
    buildModuleInfo("server", path.join(srcDir, "server"), "Server/daemon mode with database layer", "services", ["utils"]),
    buildModuleInfo("bridge", path.join(srcDir, "bridge"), "Bidirectional IDE communication layer (VS Code, JetBrains)", "services", ["utils"]),
    buildModuleInfo("outputStyles", path.join(srcDir, "outputStyles"), "Output formatting & theming", "ui", ["utils"]),
    buildModuleInfo("remote", path.join(srcDir, "remote"), "Remote session handling", "services", ["utils"]),
  ];

  // Also get top-level core files
  const coreFiles: { name: string; lines: number }[] = [];
  const topLevelFiles = ["main.tsx", "QueryEngine.ts", "Tool.ts", "tools.ts", "commands.ts", "context.ts", "constants.ts"];
  for (const file of topLevelFiles) {
    const filePath = path.join(srcDir, file);
    if (fs.existsSync(filePath)) {
      coreFiles.push({ name: file, lines: countLines(filePath) });
    }
  }

  // Total stats
  const totalStats = scanDirectory(srcDir);

  return NextResponse.json({
    modules: modules.filter((m) => m.fileCount > 0),
    coreFiles,
    totalFiles: totalStats.fileCount,
    totalLines: totalStats.lineCount,
  });
}
