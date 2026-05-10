# AIDLC + OpenCode Integration Project

## Overview
Integrate pi SDK (pi-ai + pi-agent-core) into AIDLC pipeline engine, creating a multi-backend AI coding system with a standalone @opencode-go/sdk package.

## Tech Stack
- TypeScript (strict)
- VS Code Extension API
- React 19 + Tailwind CSS 4 (panel UI)
- pi-ai (unified LLM API)
- pi-agent-core (agent runtime)
- @cursor/sdk (existing backend)
- @anthropic-ai/sdk (fallback backend)

## Architecture
- Monorepo with packages/opencode-sdk and aidlc/
- AIDLC engine supports multiple step runners (Cursor, Pi, Anthropic)
- Users can select backend per-step or globally
- @opencode-go/sdk wraps pi packages with OpenCode-style API

## Key Decisions
- Keep Cursor SDK as existing backend (no replacement)
- Add Pi SDK as parallel backend option
- Build standalone SDK package for reusability
- Use pi-agent-core SDK approach (not RPC mode)
