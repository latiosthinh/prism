// Re-export LoopOrchestrator as SequentialOrchestrator for backward compatibility.
// The build script references this file as an entry point.
export { LoopOrchestrator as SequentialOrchestrator } from "./loop-orchestrator.js";
export type { OrchestratorConfig } from "./loop-orchestrator.js";
