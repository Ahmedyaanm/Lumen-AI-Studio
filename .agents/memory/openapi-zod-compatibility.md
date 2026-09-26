---
name: OpenAPI Zod compatibility
description: OpenAPI integer schemas can generate helpers unsupported by the workspace's installed Zod version.
---

When codegen targets an older Zod runtime, prefer a compatible numeric schema for bounded tuning values if generated zod.int() is unavailable.

**Why:** Orval generated zod.int() for an integer request field, but the installed Zod version exposed no zod.int helper and failed the workspace library typecheck.

**How to apply:** Run codegen plus library typecheck after each spec change; if generated helpers exceed the installed runtime, adjust the OpenAPI field or align the dependency before proceeding.