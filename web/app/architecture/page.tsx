import type { Metadata } from "next";
import { ArchitectureExplorer } from "@/components/architecture/ArchitectureExplorer";

export const metadata: Metadata = {
  title: "Architecture Explorer — Claude Code",
  description: "Interactive visualization of the Claude Code codebase architecture",
};

export default function ArchitecturePage() {
  return <ArchitectureExplorer />;
}
