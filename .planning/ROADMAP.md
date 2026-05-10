# ROADMAP

## Milestone 1: Foundation & SDK

### Phase 1: Project Setup & Monorepo Structure
**Goal**: Initialize project structure, copy AIDLC source, set up build tooling
- Create directory structure
- Copy AIDLC from team-build-chill-repo
- Initialize monorepo with npm workspaces
- Set up TypeScript configs and build pipeline

### Phase 2: Build @opencode-go/sdk Package
**Goal**: Create standalone SDK wrapping pi-ai and pi-agent-core
- Install pi dependencies
- Create OpenCodeAgent wrapper class
- Implement provider configuration helpers
- Add streaming event adapter
- Write TypeScript types and package.json

### Phase 3: Create PiSdkStepRunner
**Goal**: New step runner that uses @opencode-go/sdk
- Implement PiSdkStepRunner class
- Wire up streaming events to AIDLC AgentEvent system
- Implement tool execution (read/write/edit/bash)
- Add error handling and file recovery
- Register runner in engine-bridge

### Phase 4: Update AIDLC Extension & Panel UI
**Goal**: Multi-backend support in settings and UI
- Add backend configuration options
- Update EngineBridge to instantiate correct runner
- Add backend selector to Settings page
- Show backend badge in StepCard
- Support per-step backend override in pipeline schema

### Phase 5: Testing & Documentation
**Goal**: Verify functionality and write docs
- Unit tests for PiSdkStepRunner
- Multi-provider integration tests
- SDK documentation
- AIDLC integration guide
- Example pipelines

### Phase 6: Integration Verification & Polish
**Goal**: End-to-end testing and final polish
- Full pipeline run with pi backend
- Performance comparison (pi vs Cursor)
- Error message improvements
- Final README updates

## Progress
- Total Phases: 6
- Completed: 0
- In Progress: 0
- Pending: 6
