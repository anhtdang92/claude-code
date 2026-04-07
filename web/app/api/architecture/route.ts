import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";

// Allow Next.js to cache the response between requests; the in-memory cache
// below provides per-process protection during the same revalidation window.
export const revalidate = 3600;

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

interface ArchitecturePayload {
  modules: ModuleInfo[];
  coreFiles: { name: string; lines: number }[];
  totalFiles: number;
  totalLines: number;
}

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx"]);

const MODULE_DEFINITIONS: ReadonlyArray<{
  name: string;
  description: string;
  layer: ModuleInfo["layer"];
  deps: string[];
}> = [
  { name: "entrypoints", description: "CLI, SDK & MCP server entry points and initialization", layer: "entry", deps: ["services", "tools", "commands", "components"] },
  { name: "tools", description: "44 agent tool implementations (Bash, File I/O, Search, MCP, Tasks)", layer: "tools", deps: ["services", "utils"] },
  { name: "commands", description: "50+ slash commands (/commit, /review, /config, etc.)", layer: "commands", deps: ["services", "tools", "utils"] },
  { name: "components", description: "140+ Ink/React terminal UI components", layer: "ui", deps: ["hooks", "state", "services"] },
  { name: "services", description: "API adapters, auth, MCP, LSP, analytics, audit, plugins", layer: "services", deps: ["utils"] },
  { name: "hooks", description: "React hooks for permissions, keybindings, commands, settings", layer: "ui", deps: ["state", "services"] },
  { name: "state", description: "React context + custom AppState store", layer: "data", deps: ["utils"] },
  { name: "utils", description: "Shell, file ops, permissions, config, git, model selection, telemetry", layer: "infra", deps: [] },
  { name: "screens", description: "Full-screen UIs (Doctor, REPL, Resume, Compact)", layer: "ui", deps: ["components", "hooks", "state"] },
  { name: "skills", description: "Bundled skills + skill loader system", layer: "tools", deps: ["services", "utils"] },
  { name: "plugins", description: "Plugin marketplace & loader system", layer: "services", deps: ["utils"] },
  { name: "coordinator", description: "Multi-agent coordination & supervisor logic", layer: "core", deps: ["services", "tools", "utils"] },
  { name: "tasks", description: "Task management (shell tasks, agent tasks, teammates)", layer: "core", deps: ["services", "utils"] },
  { name: "context", description: "React context providers (notifications, stats, FPS)", layer: "data", deps: [] },
  { name: "memdir", description: "Persistent memory system (CLAUDE.md, user/project memory)", layer: "data", deps: ["utils"] },
  { name: "keybindings", description: "Vim mode & keybinding configuration", layer: "ui", deps: ["utils"] },
  { name: "types", description: "TypeScript type definitions", layer: "infra", deps: [] },
  { name: "migrations", description: "Config migrations between versions", layer: "infra", deps: ["utils"] },
  { name: "query", description: "Query pipeline & processing", layer: "core", deps: ["services", "tools"] },
  { name: "server", description: "Server/daemon mode with database layer", layer: "services", deps: ["utils"] },
  { name: "bridge", description: "Bidirectional IDE communication layer (VS Code, JetBrains)", layer: "services", deps: ["utils"] },
  { name: "outputStyles", description: "Output formatting & theming", layer: "ui", deps: ["utils"] },
  { name: "remote", description: "Remote session handling", layer: "services", deps: ["utils"] },
];

const TOP_LEVEL_CORE_FILES = [
  "main.tsx",
  "QueryEngine.ts",
  "Tool.ts",
  "tools.ts",
  "commands.ts",
  "context.ts",
  "constants.ts",
];

interface ScanResult {
  fileCount: number;
  lineCount: number;
}

async function countLines(filePath: string): Promise<number> {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    if (content.length === 0) return 0;
    // Count newlines by scanning the buffer once instead of allocating a split array.
    let lines = 1;
    for (let i = 0; i < content.length; i++) {
      if (content.charCodeAt(i) === 10) lines++;
    }
    return lines;
  } catch {
    return 0;
  }
}

async function scanDirectoryRecursive(dirPath: string): Promise<ScanResult> {
  let fileCount = 0;
  let lineCount = 0;

  let entries: Awaited<ReturnType<typeof fs.readdir>>;
  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true });
  } catch {
    return { fileCount, lineCount };
  }

  await Promise.all(
    entries.map(async (entry) => {
      if (entry.name.startsWith(".") || entry.name === "node_modules") return;
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        const sub = await scanDirectoryRecursive(fullPath);
        fileCount += sub.fileCount;
        lineCount += sub.lineCount;
      } else if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
        fileCount++;
        lineCount += await countLines(fullPath);
      }
    }),
  );

  return { fileCount, lineCount };
}

async function listTopLevelSourceFiles(dirPath: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    return entries
      .filter((e) => e.isFile() && SOURCE_EXTENSIONS.has(path.extname(e.name)))
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
}

async function listSubmodules(dirPath: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory() && !e.name.startsWith("."))
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
}

async function buildModuleInfo(
  def: (typeof MODULE_DEFINITIONS)[number],
  srcDir: string,
): Promise<ModuleInfo> {
  const dirPath = path.join(srcDir, def.name);
  const [stats, subDirs, topLevelFiles] = await Promise.all([
    scanDirectoryRecursive(dirPath),
    listSubmodules(dirPath),
    listTopLevelSourceFiles(dirPath),
  ]);

  const children: ModuleInfo[] = await Promise.all(
    subDirs.slice(0, 20).map(async (sub) => {
      const subPath = path.join(dirPath, sub);
      const [subStats, subTopFiles] = await Promise.all([
        scanDirectoryRecursive(subPath),
        listTopLevelSourceFiles(subPath),
      ]);
      return {
        name: sub,
        path: `${def.name}/${sub}`,
        description: "",
        layer: def.layer,
        fileCount: subStats.fileCount,
        lineCount: subStats.lineCount,
        children: [],
        keyFiles: subTopFiles.slice(0, 8),
        dependencies: [],
      } satisfies ModuleInfo;
    }),
  );

  return {
    name: def.name,
    path: def.name,
    description: def.description,
    layer: def.layer,
    fileCount: stats.fileCount,
    lineCount: stats.lineCount,
    children,
    keyFiles: topLevelFiles.slice(0, 10),
    dependencies: def.deps,
  };
}

async function resolveSrcDir(): Promise<string> {
  const candidates = [
    process.env.CLAUDE_CODE_SRC_DIR,
    path.resolve(process.cwd(), "../src"),
    path.resolve(process.cwd(), "src"),
    path.resolve(process.cwd(), "../../src"),
  ].filter((v): v is string => Boolean(v));

  for (const candidate of candidates) {
    try {
      const stat = await fs.stat(candidate);
      if (stat.isDirectory()) return candidate;
    } catch {
      // try next candidate
    }
  }
  // Fall back to the original behavior so the failure mode is recognizable.
  return path.resolve(process.cwd(), "../src");
}

async function buildPayload(): Promise<ArchitecturePayload> {
  const srcDir = await resolveSrcDir();

  const [modules, coreFilesEntries, totalStats] = await Promise.all([
    Promise.all(MODULE_DEFINITIONS.map((def) => buildModuleInfo(def, srcDir))),
    Promise.all(
      TOP_LEVEL_CORE_FILES.map(async (name) => {
        const filePath = path.join(srcDir, name);
        try {
          await fs.access(filePath);
          return { name, lines: await countLines(filePath) };
        } catch {
          return null;
        }
      }),
    ),
    scanDirectoryRecursive(srcDir),
  ]);

  return {
    modules: modules.filter((m) => m.fileCount > 0),
    coreFiles: coreFilesEntries.filter(
      (f): f is { name: string; lines: number } => f !== null,
    ),
    totalFiles: totalStats.fileCount,
    totalLines: totalStats.lineCount,
  };
}

const CACHE_TTL_MS = 60 * 60 * 1000;
let cache: { payload: ArchitecturePayload; expiresAt: number } | null = null;
let inflight: Promise<ArchitecturePayload> | null = null;

export async function GET() {
  const now = Date.now();
  if (cache && cache.expiresAt > now) {
    return NextResponse.json(cache.payload);
  }
  // Coalesce concurrent rebuilds so a burst of requests doesn't fan out into
  // multiple full filesystem walks.
  if (!inflight) {
    inflight = buildPayload().finally(() => {
      inflight = null;
    });
  }
  try {
    const payload = await inflight;
    cache = { payload, expiresAt: Date.now() + CACHE_TTL_MS };
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to scan source tree" },
      { status: 500 },
    );
  }
}
