---
name: Groq provider availability
description: Groq model IDs can change or vary by account, so verify the live model list before choosing a default.
---

Do not assume a previously documented Groq model ID is still enabled. Query the provider's models endpoint with the configured secret and choose an active chat-capable model.

**Why:** A valid Groq credential can still return a model-not-found error when an older model has been retired or is unavailable to that account.

**How to apply:** During provider setup or debugging, inspect the live model list without printing credentials, then update the server-side model constant.