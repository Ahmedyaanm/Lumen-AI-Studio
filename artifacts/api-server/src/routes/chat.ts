import { Router, type IRouter } from "express";
import { CompleteChatBody, CompleteChatResponse } from "@workspace/api-zod";

const router: IRouter = Router();

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "openai/gpt-oss-20b";
const MAX_TURNS = 16;
const MAX_CHARS = 20_000;

router.post("/chat", async (req, res) => {
  const parsed = CompleteChatBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      ok: false,
      text: null,
      thought: null,
      error: "The chat request is not valid.",
    });
    return;
  }

  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) {
    res.json({
      ok: false,
      text: null,
      thought: null,
      error: "AI is not configured yet. Add a GROQ_API_KEY secret to enable replies.",
    });
    return;
  }

  const messages = parsed.data.messages
    .slice(-MAX_TURNS)
    .filter((message) => message.content.trim().length > 0)
    .map((message) => ({
      role: message.role,
      content: message.content.slice(0, MAX_CHARS),
    }));

  if (!messages.some((message) => message.role === "user")) {
    res.json({
      ok: false,
      text: null,
      thought: null,
      error: "Write a message first.",
    });
    return;
  }

  try {
    const upstream = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        temperature: parsed.data.temperature ?? 0.7,
        max_tokens: Math.round(parsed.data.maxTokens ?? 800),
      }),
    });

    if (!upstream.ok) {
      let detail = `The model could not reply (${upstream.status}).`;
      try {
        const errorBody = (await upstream.json()) as {
          error?: string | { message?: string };
        };
        const message =
          typeof errorBody.error === "string"
            ? errorBody.error
            : errorBody.error?.message;
        if (message) detail = message;
      } catch {
        // Keep the status fallback when Groq returns a non-JSON error.
      }

      res.json({
        ok: false,
        text: null,
        thought: null,
        error: detail,
      });
      return;
    }

    const body = (await upstream.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = body.choices?.[0]?.message?.content?.trim() ?? "";

    if (!text) {
      res.json({
        ok: false,
        text: null,
        thought: null,
        error: "The model returned an empty reply.",
      });
      return;
    }

    const response = CompleteChatResponse.parse({
      ok: true,
      text,
      thought: null,
      error: null,
    });
    res.json(response);
  } catch (error) {
    req.log.error({ err: error }, "Chat provider request failed");
    res.json({
      ok: false,
      text: null,
      thought: null,
      error: "The AI service could not be reached. Try again in a moment.",
    });
  }
});

export default router;