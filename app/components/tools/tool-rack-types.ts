import { ToolDefinition, ToolId } from "@/app/lib/tool-catalog";

export interface ToolRackProps {
  tool: ToolDefinition;
  activeBuffer: AudioBuffer | null;
  onCommitBuffer: (next: AudioBuffer, label: string) => void;
  onPipeToTool?: (targetToolId: ToolId, buffer?: AudioBuffer, label?: string) => void;
}
