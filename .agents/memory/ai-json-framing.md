---
name: AI JSON framing
description: How to safely parse structured project manifests returned by coding models
---

Coding models can return a complete valid JSON object followed by another JSON object, markdown, or explanatory text even when instructed to return only JSON. Parsing from the first opening brace to the last closing brace creates an invalid combined document.

**Why:** Project builds failed with `Unexpected non-whitespace character after JSON` because trailing model output was included in the JSON slice.

**How to apply:** Scan from candidate opening braces, track quoted strings and escapes while balancing braces, and parse the first complete object that has the required project-manifest shape.