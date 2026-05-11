# PRISM Project

## Overview
Multi-provider AI development orchestration engine. Refracts ideas into working software through structured, gated pipelines with 30+ AI providers.

## Tech Stack
- TypeScript (strict)
- VS Code Extension API
- React 19 + Tailwind CSS 4 (panel UI)
- pi-ai (unified LLM API)
- pi-agent-core (agent runtime)
- @cursor/sdk (existing backend)
- @anthropic-ai/sdk (fallback backend)

## Architecture
- Monorepo with packages/prism-sdk and prism/
- PRISM engine supports multiple step runners (Cursor, PRISM SDK, Anthropic)
- Users can select backend per-step or globally
- @prism/sdk wraps pi packages with PRISM-style API

## Key Decisions
- Keep Cursor SDK as existing backend (no replacement)
- Add PRISM SDK as parallel backend option
- Build standalone SDK package for reusability
- Use pi-agent-core SDK approach (not RPC mode)
- Named "PRISM" — refracting ideas through multiple AI providers
