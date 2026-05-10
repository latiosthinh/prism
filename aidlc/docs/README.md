# AIDLC documentation

This folder describes **purpose**, **architecture**, **user flows**, **features**, and how the **VS Code extension** talks to the **React panel** and **pipeline engine**.

| Document | Contents |
|----------|----------|
| [overview.md](./overview.md) | What AIDLC is, problems it solves, workspace layout (`.aidlc/`), core concepts |
| [architecture.md](./architecture.md) | Layers, build pipeline, engine modules, bridge callbacks, on-disk model |
| [user-flows.md](./user-flows.md) | Step-by-step journeys: start run, edit pipeline, gates, runs history, settings |
| [features.md](./features.md) | Feature catalog aligned with the UI and engine |
| [panel-extension-protocol.md](./panel-extension-protocol.md) | `postMessage` message types: panel → extension → engine |

For a shorter product intro and install steps, see the repository [README](../README.md).
