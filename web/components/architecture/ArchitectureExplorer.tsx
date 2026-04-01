"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Search,
  Layers,
  FileCode2,
  ArrowRight,
  ChevronRight,
  ChevronDown,
  Box,
  Cpu,
  Wrench,
  Terminal,
  Layout,
  Database,
  Server,
  Zap,
  X,
  BarChart3,
} from "lucide-react";
import { cn } from "@/lib/utils";

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

interface ArchitectureData {
  modules: ModuleInfo[];
  coreFiles: { name: string; lines: number }[];
  totalFiles: number;
  totalLines: number;
}

const layerConfig: Record<
  string,
  { label: string; color: string; bg: string; border: string; icon: React.ElementType; ring: string }
> = {
  entry: {
    label: "Entry Points",
    color: "text-amber-400",
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
    icon: Zap,
    ring: "ring-amber-500/40",
  },
  core: {
    label: "Core Logic",
    color: "text-brand-400",
    bg: "bg-brand-500/10",
    border: "border-brand-500/30",
    icon: Cpu,
    ring: "ring-brand-500/40",
  },
  tools: {
    label: "Tools & Skills",
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/30",
    icon: Wrench,
    ring: "ring-emerald-500/40",
  },
  commands: {
    label: "Commands",
    color: "text-sky-400",
    bg: "bg-sky-500/10",
    border: "border-sky-500/30",
    icon: Terminal,
    ring: "ring-sky-500/40",
  },
  ui: {
    label: "UI Layer",
    color: "text-pink-400",
    bg: "bg-pink-500/10",
    border: "border-pink-500/30",
    icon: Layout,
    ring: "ring-pink-500/40",
  },
  services: {
    label: "Services",
    color: "text-orange-400",
    bg: "bg-orange-500/10",
    border: "border-orange-500/30",
    icon: Server,
    ring: "ring-orange-500/40",
  },
  data: {
    label: "Data & State",
    color: "text-cyan-400",
    bg: "bg-cyan-500/10",
    border: "border-cyan-500/30",
    icon: Database,
    ring: "ring-cyan-500/40",
  },
  infra: {
    label: "Infrastructure",
    color: "text-surface-400",
    bg: "bg-surface-500/10",
    border: "border-surface-500/30",
    icon: Box,
    ring: "ring-surface-500/40",
  },
};

const layerOrder = ["entry", "core", "tools", "commands", "ui", "services", "data", "infra"];

function formatNumber(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function ModuleCard({
  module,
  isSelected,
  onClick,
}: {
  module: ModuleInfo;
  isSelected: boolean;
  onClick: () => void;
}) {
  const config = layerConfig[module.layer];
  const Icon = config.icon;
  const sizeClass =
    module.lineCount > 10000
      ? "col-span-2"
      : "";

  return (
    <button
      onClick={onClick}
      className={cn(
        "group relative text-left rounded-xl border p-4 transition-all duration-200",
        "hover:scale-[1.02] hover:shadow-lg hover:shadow-black/20",
        config.bg,
        config.border,
        isSelected && `ring-2 ${config.ring} shadow-lg`,
        sizeClass
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Icon className={cn("h-4 w-4 flex-shrink-0", config.color)} />
          <h3 className="font-mono text-sm font-semibold text-surface-100">{module.name}/</h3>
        </div>
        <ChevronRight
          className={cn(
            "h-4 w-4 text-surface-600 transition-transform",
            isSelected && "rotate-90"
          )}
        />
      </div>

      <p className="mt-1.5 text-xs text-surface-400 line-clamp-2 leading-relaxed">
        {module.description}
      </p>

      <div className="mt-3 flex items-center gap-3 text-xs text-surface-500">
        <span className="flex items-center gap-1">
          <FileCode2 className="h-3 w-3" />
          {module.fileCount} files
        </span>
        <span className="flex items-center gap-1">
          <BarChart3 className="h-3 w-3" />
          {formatNumber(module.lineCount)} lines
        </span>
      </div>

      {module.dependencies.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {module.dependencies.map((dep) => (
            <span
              key={dep}
              className="inline-flex items-center gap-0.5 rounded-md bg-surface-800/60 px-1.5 py-0.5 text-[10px] font-mono text-surface-500"
            >
              <ArrowRight className="h-2.5 w-2.5" />
              {dep}
            </span>
          ))}
        </div>
      )}
    </button>
  );
}

function DetailPanel({
  module,
  onClose,
  onNavigate,
}: {
  module: ModuleInfo;
  onClose: () => void;
  onNavigate: (name: string) => void;
}) {
  const config = layerConfig[module.layer];
  const Icon = config.icon;
  const [expandedChild, setExpandedChild] = useState<string | null>(null);

  return (
    <div
      className={cn(
        "rounded-xl border p-5 space-y-4 animate-fade-in",
        config.bg,
        config.border
      )}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className={cn("rounded-lg p-2", config.bg, "border", config.border)}>
            <Icon className={cn("h-5 w-5", config.color)} />
          </div>
          <div>
            <h2 className="font-mono text-lg font-bold text-surface-50">
              src/{module.name}/
            </h2>
            <p className="text-sm text-surface-400">{module.description}</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="rounded-lg p-1.5 text-surface-500 hover:bg-surface-800 hover:text-surface-300 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg bg-surface-900/50 border border-surface-800 p-3 text-center">
          <p className="text-xl font-bold text-surface-100">{module.fileCount}</p>
          <p className="text-xs text-surface-500">Files</p>
        </div>
        <div className="rounded-lg bg-surface-900/50 border border-surface-800 p-3 text-center">
          <p className="text-xl font-bold text-surface-100">
            {formatNumber(module.lineCount)}
          </p>
          <p className="text-xs text-surface-500">Lines</p>
        </div>
        <div className="rounded-lg bg-surface-900/50 border border-surface-800 p-3 text-center">
          <p className="text-xl font-bold text-surface-100">{module.children.length}</p>
          <p className="text-xs text-surface-500">Submodules</p>
        </div>
      </div>

      {/* Dependencies */}
      {module.dependencies.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-surface-500 mb-2">
            Dependencies
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {module.dependencies.map((dep) => {
              const depConfig = layerConfig[
                Object.keys(layerConfig).find((k) => k === dep) ?? "infra"
              ];
              return (
                <button
                  key={dep}
                  onClick={() => onNavigate(dep)}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-mono transition-colors",
                    "bg-surface-800 border border-surface-700 text-surface-300",
                    "hover:border-surface-600 hover:text-surface-100"
                  )}
                >
                  <ArrowRight className="h-3 w-3 text-surface-500" />
                  {dep}/
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Submodules */}
      {module.children.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-surface-500 mb-2">
            Submodules
          </h3>
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {module.children
              .sort((a, b) => b.lineCount - a.lineCount)
              .map((child) => (
                <div key={child.name}>
                  <button
                    onClick={() =>
                      setExpandedChild(expandedChild === child.name ? null : child.name)
                    }
                    className="w-full flex items-center justify-between rounded-lg px-3 py-2 text-sm hover:bg-surface-800/50 transition-colors group"
                  >
                    <div className="flex items-center gap-2">
                      {expandedChild === child.name ? (
                        <ChevronDown className="h-3.5 w-3.5 text-surface-500" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5 text-surface-500" />
                      )}
                      <span className="font-mono text-surface-200">{child.name}/</span>
                    </div>
                    <span className="text-xs text-surface-500">
                      {child.fileCount} files &middot; {formatNumber(child.lineCount)} lines
                    </span>
                  </button>
                  {expandedChild === child.name && child.keyFiles.length > 0 && (
                    <div className="ml-8 mb-1 space-y-0.5">
                      {child.keyFiles.map((file) => (
                        <div
                          key={file}
                          className="flex items-center gap-2 rounded px-2 py-1 text-xs"
                        >
                          <FileCode2 className="h-3 w-3 text-surface-600" />
                          <span className="font-mono text-surface-400">{file}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Top-level files */}
      {module.keyFiles.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-surface-500 mb-2">
            Key Files
          </h3>
          <div className="grid grid-cols-2 gap-1">
            {module.keyFiles.map((file) => (
              <div
                key={file}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs bg-surface-900/30"
              >
                <FileCode2 className="h-3 w-3 text-surface-600 flex-shrink-0" />
                <span className="font-mono text-surface-400 truncate">{file}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function DependencyGraph({
  modules,
  selectedModule,
  onSelect,
}: {
  modules: ModuleInfo[];
  selectedModule: string | null;
  onSelect: (name: string) => void;
}) {
  const positions = useMemo(() => {
    const pos: Record<string, { x: number; y: number }> = {};
    const grouped: Record<string, ModuleInfo[]> = {};

    for (const mod of modules) {
      if (!grouped[mod.layer]) grouped[mod.layer] = [];
      grouped[mod.layer].push(mod);
    }

    let y = 40;
    for (const layer of layerOrder) {
      const group = grouped[layer];
      if (!group) continue;
      const totalWidth = 800;
      const spacing = totalWidth / (group.length + 1);
      group.forEach((mod, i) => {
        pos[mod.name] = { x: spacing * (i + 1), y };
      });
      y += 90;
    }

    return pos;
  }, [modules]);

  const edges = useMemo(() => {
    const result: { from: string; to: string; highlighted: boolean }[] = [];
    for (const mod of modules) {
      for (const dep of mod.dependencies) {
        if (positions[dep]) {
          result.push({
            from: mod.name,
            to: dep,
            highlighted:
              selectedModule === mod.name || selectedModule === dep,
          });
        }
      }
    }
    return result;
  }, [modules, positions, selectedModule]);

  const svgHeight = layerOrder.length * 90 + 40;

  return (
    <div className="rounded-xl border border-surface-800 bg-surface-950/50 p-4 overflow-x-auto">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-surface-500 mb-3 flex items-center gap-2">
        <Layers className="h-3.5 w-3.5" />
        Dependency Graph
      </h3>
      <svg viewBox={`0 0 840 ${svgHeight}`} className="w-full" style={{ minWidth: 600 }}>
        <defs>
          <marker
            id="arrowhead"
            markerWidth="8"
            markerHeight="6"
            refX="8"
            refY="3"
            orient="auto"
          >
            <polygon points="0 0, 8 3, 0 6" fill="#525252" />
          </marker>
          <marker
            id="arrowhead-active"
            markerWidth="8"
            markerHeight="6"
            refX="8"
            refY="3"
            orient="auto"
          >
            <polygon points="0 0, 8 3, 0 6" fill="#8b5cf6" />
          </marker>
        </defs>

        {/* Layer backgrounds */}
        {layerOrder.map((layer, i) => {
          const config = layerConfig[layer];
          const hasModules = modules.some((m) => m.layer === layer);
          if (!hasModules) return null;
          return (
            <g key={layer}>
              <rect
                x={10}
                y={i * 90 + 12}
                width={820}
                height={76}
                rx={8}
                fill="currentColor"
                className="text-surface-900/30"
              />
              <text
                x={24}
                y={i * 90 + 28}
                className="text-[9px] uppercase tracking-widest"
                fill="#525252"
                fontFamily="monospace"
              >
                {config.label}
              </text>
            </g>
          );
        })}

        {/* Edges */}
        {edges.map(({ from, to, highlighted }) => {
          const p1 = positions[from];
          const p2 = positions[to];
          if (!p1 || !p2) return null;
          const midY = (p1.y + p2.y) / 2;
          return (
            <path
              key={`${from}-${to}`}
              d={`M ${p1.x} ${p1.y + 16} C ${p1.x} ${midY}, ${p2.x} ${midY}, ${p2.x} ${p2.y - 16}`}
              fill="none"
              stroke={highlighted ? "#8b5cf6" : "#333"}
              strokeWidth={highlighted ? 2 : 1}
              strokeDasharray={highlighted ? "none" : "4 4"}
              opacity={selectedModule ? (highlighted ? 1 : 0.15) : 0.5}
              markerEnd={highlighted ? "url(#arrowhead-active)" : "url(#arrowhead)"}
              className="transition-all duration-300"
            />
          );
        })}

        {/* Nodes */}
        {modules.map((mod) => {
          const pos = positions[mod.name];
          if (!pos) return null;
          const config = layerConfig[mod.layer];
          const isActive = selectedModule === mod.name;
          const isDimmed = selectedModule && !isActive &&
            !modules.find((m) => m.name === selectedModule)?.dependencies.includes(mod.name) &&
            !mod.dependencies.includes(selectedModule);

          return (
            <g
              key={mod.name}
              onClick={() => onSelect(mod.name)}
              className="cursor-pointer"
              opacity={isDimmed ? 0.2 : 1}
              style={{ transition: "opacity 0.3s" }}
            >
              <rect
                x={pos.x - 48}
                y={pos.y - 14}
                width={96}
                height={28}
                rx={6}
                fill={isActive ? "#1e1b4b" : "#18181b"}
                stroke={isActive ? "#8b5cf6" : "#333"}
                strokeWidth={isActive ? 2 : 1}
              />
              <text
                x={pos.x}
                y={pos.y + 1}
                textAnchor="middle"
                dominantBaseline="middle"
                className="text-[11px] font-medium"
                fill={isActive ? "#c4b5fd" : "#a1a1aa"}
                fontFamily="monospace"
              >
                {mod.name}
              </text>
              <text
                x={pos.x}
                y={pos.y + 22}
                textAnchor="middle"
                className="text-[8px]"
                fill="#525252"
                fontFamily="monospace"
              >
                {mod.fileCount}f &middot; {formatNumber(mod.lineCount)}L
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function ArchitectureExplorer() {
  const [data, setData] = useState<ArchitectureData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedModule, setSelectedModule] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "graph">("grid");
  const [filterLayer, setFilterLayer] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/architecture");
        if (!res.ok) throw new Error(`Failed to load (${res.status})`);
        const json = await res.json();
        setData(json);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load architecture data");
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, []);

  const filteredModules = useMemo(() => {
    if (!data) return [];
    let result = data.modules;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          m.description.toLowerCase().includes(q) ||
          m.children.some((c) => c.name.toLowerCase().includes(q))
      );
    }
    if (filterLayer) {
      result = result.filter((m) => m.layer === filterLayer);
    }
    return result;
  }, [data, searchQuery, filterLayer]);

  const selectedModuleData = useMemo(
    () => data?.modules.find((m) => m.name === selectedModule) ?? null,
    [data, selectedModule]
  );

  const handleNavigate = useCallback((name: string) => {
    setSelectedModule(name);
    setSearchQuery("");
    setFilterLayer(null);
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 rounded-full border-2 border-brand-500 border-t-transparent animate-spin" />
          <p className="text-sm text-surface-400">Scanning codebase...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-2">
          <p className="text-error text-sm">{error ?? "Failed to load"}</p>
          <button
            onClick={() => window.location.reload()}
            className="text-xs text-brand-400 hover:underline"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const layerStats = layerOrder
    .map((layer) => ({
      layer,
      config: layerConfig[layer],
      count: data.modules.filter((m) => m.layer === layer).length,
      files: data.modules
        .filter((m) => m.layer === layer)
        .reduce((sum, m) => sum + m.fileCount, 0),
      lines: data.modules
        .filter((m) => m.layer === layer)
        .reduce((sum, m) => sum + m.lineCount, 0),
    }))
    .filter((s) => s.count > 0);

  return (
    <main className="min-h-screen bg-surface-950 text-surface-100">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-surface-800 bg-surface-950/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-brand-500/15 border border-brand-500/25 p-2">
                <Layers className="h-5 w-5 text-brand-400" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-surface-50">Architecture Explorer</h1>
                <p className="text-xs text-surface-500">
                  {data.totalFiles.toLocaleString()} files &middot;{" "}
                  {formatNumber(data.totalLines)} lines &middot;{" "}
                  {data.modules.length} modules
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* View toggle */}
              <div className="flex rounded-lg border border-surface-700 overflow-hidden">
                <button
                  onClick={() => setViewMode("grid")}
                  className={cn(
                    "px-3 py-1.5 text-xs font-medium transition-colors",
                    viewMode === "grid"
                      ? "bg-surface-700 text-surface-100"
                      : "text-surface-500 hover:text-surface-300"
                  )}
                >
                  Grid
                </button>
                <button
                  onClick={() => setViewMode("graph")}
                  className={cn(
                    "px-3 py-1.5 text-xs font-medium transition-colors",
                    viewMode === "graph"
                      ? "bg-surface-700 text-surface-100"
                      : "text-surface-500 hover:text-surface-300"
                  )}
                >
                  Graph
                </button>
              </div>

              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-surface-500" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search modules..."
                  className="w-56 rounded-lg border border-surface-700 bg-surface-900 pl-9 pr-3 py-1.5 text-sm text-surface-100 placeholder:text-surface-600 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500/50"
                />
              </div>
            </div>
          </div>

          {/* Layer filter chips */}
          <div className="flex items-center gap-2 mt-3 overflow-x-auto pb-1">
            <button
              onClick={() => setFilterLayer(null)}
              className={cn(
                "flex-shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors border",
                !filterLayer
                  ? "bg-surface-700 border-surface-600 text-surface-100"
                  : "border-surface-800 text-surface-500 hover:border-surface-700 hover:text-surface-300"
              )}
            >
              All
            </button>
            {layerStats.map(({ layer, config, count }) => {
              const Icon = config.icon;
              return (
                <button
                  key={layer}
                  onClick={() => setFilterLayer(filterLayer === layer ? null : layer)}
                  className={cn(
                    "flex-shrink-0 flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors border",
                    filterLayer === layer
                      ? cn(config.bg, config.border, config.color)
                      : "border-surface-800 text-surface-500 hover:border-surface-700 hover:text-surface-300"
                  )}
                >
                  <Icon className="h-3 w-3" />
                  {config.label}
                  <span className="opacity-60">({count})</span>
                </button>
              );
            })}
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-6">
        {/* Core files bar */}
        {data.coreFiles.length > 0 && viewMode === "grid" && (
          <div className="mb-6 rounded-xl border border-surface-800 bg-surface-900/30 p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-surface-500 mb-3">
              Core Entry Files (src/)
            </h3>
            <div className="flex flex-wrap gap-2">
              {data.coreFiles.map((file) => (
                <div
                  key={file.name}
                  className="flex items-center gap-2 rounded-lg bg-surface-800/50 border border-surface-700/50 px-3 py-2"
                >
                  <FileCode2 className="h-3.5 w-3.5 text-brand-400" />
                  <span className="font-mono text-sm text-surface-200">{file.name}</span>
                  <span className="text-xs text-surface-500">
                    {formatNumber(file.lines)} lines
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {viewMode === "graph" ? (
          <div className="space-y-6">
            <DependencyGraph
              modules={filteredModules}
              selectedModule={selectedModule}
              onSelect={(name) =>
                setSelectedModule(selectedModule === name ? null : name)
              }
            />
            {selectedModuleData && (
              <DetailPanel
                module={selectedModuleData}
                onClose={() => setSelectedModule(null)}
                onNavigate={handleNavigate}
              />
            )}
          </div>
        ) : (
          <div className="flex gap-6">
            {/* Module grid */}
            <div className="flex-1 min-w-0">
              {layerStats.map(({ layer, config }) => {
                const layerModules = filteredModules.filter((m) => m.layer === layer);
                if (layerModules.length === 0) return null;
                const Icon = config.icon;
                return (
                  <div key={layer} className="mb-6">
                    <div className="flex items-center gap-2 mb-3">
                      <Icon className={cn("h-4 w-4", config.color)} />
                      <h2 className={cn("text-sm font-semibold", config.color)}>
                        {config.label}
                      </h2>
                      <div className="flex-1 h-px bg-surface-800" />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {layerModules
                        .sort((a, b) => b.lineCount - a.lineCount)
                        .map((mod) => (
                          <ModuleCard
                            key={mod.name}
                            module={mod}
                            isSelected={selectedModule === mod.name}
                            onClick={() =>
                              setSelectedModule(
                                selectedModule === mod.name ? null : mod.name
                              )
                            }
                          />
                        ))}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Detail sidebar */}
            {selectedModuleData && (
              <div className="w-96 flex-shrink-0 sticky top-32 self-start">
                <DetailPanel
                  module={selectedModuleData}
                  onClose={() => setSelectedModule(null)}
                  onNavigate={handleNavigate}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
