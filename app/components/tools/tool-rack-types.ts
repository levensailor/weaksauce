import { ToolDefinition } from "@/app/lib/tool-catalog";

export interface ToolRackProps {
  tool: ToolDefinition;
  activeBuffer: AudioBuffer | null;
  onCommitBuffer: (next: AudioBuffer, label: string) => void;
}
