---
name: Controlled AI build sandbox
description: Safety boundary for generated project files, package installation, and local project servers.
---

AI-generated projects run as isolated per-user workspaces, with path traversal blocked, package installs limited to local dependencies with lifecycle scripts disabled, and server commands restricted to known development-server patterns.

**Why:** The build feature must be useful without giving generated code unrestricted host access or exposing workspace secrets through child-process environments.

**How to apply:** Preserve the allowlist and minimal child-process environment when extending project builds, server controls, or any future external runtime adapter.