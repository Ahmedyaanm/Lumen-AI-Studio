import { Router, type IRouter } from "express";
import { and, asc, desc, eq } from "drizzle-orm";
import {
  DeleteThreadParams,
  ListThreadsResponse,
  SyncThreadBody,
  SyncThreadParams,
  SyncThreadResponse,
} from "@workspace/api-zod";
import { chatMessagesTable, chatThreadsTable, db } from "@workspace/db";
import { getUserId, requireAuth } from "../lib/auth";

const router: IRouter = Router();

async function serializeThread(ownerId: string, thread: typeof chatThreadsTable.$inferSelect) {
  const messages = await db
    .select()
    .from(chatMessagesTable)
    .where(and(eq(chatMessagesTable.threadId, thread.id), eq(chatMessagesTable.ownerId, ownerId)))
    .orderBy(asc(chatMessagesTable.createdAt));
  return {
    id: thread.id,
    mode: thread.mode,
    title: thread.title,
    createdAt: thread.createdAt,
    updatedAt: thread.updatedAt,
    messages: messages.map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      thought: message.thought,
      createdAt: message.createdAt,
    })),
  };
}

router.get("/threads", requireAuth, async (req, res): Promise<void> => {
  const ownerId = getUserId(req);
  const threads = await db
    .select()
    .from(chatThreadsTable)
    .where(eq(chatThreadsTable.ownerId, ownerId))
    .orderBy(desc(chatThreadsTable.updatedAt));
  res.json(ListThreadsResponse.parse(await Promise.all(threads.map((thread) => serializeThread(ownerId, thread)))));
});

router.put("/threads/:id", requireAuth, async (req, res): Promise<void> => {
  const params = SyncThreadParams.safeParse(req.params);
  const body = SyncThreadBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "The chat thread is not valid." });
    return;
  }

  const ownerId = getUserId(req);
  if (body.data.messages.length === 0) {
    await db
      .delete(chatMessagesTable)
      .where(and(eq(chatMessagesTable.threadId, params.data.id), eq(chatMessagesTable.ownerId, ownerId)));
    await db
      .delete(chatThreadsTable)
      .where(and(eq(chatThreadsTable.id, params.data.id), eq(chatThreadsTable.ownerId, ownerId)));
    res.status(204).send();
    return;
  }

  const [existing] = await db
    .select()
    .from(chatThreadsTable)
    .where(eq(chatThreadsTable.id, params.data.id));
  if (existing && existing.ownerId !== ownerId) {
    res.status(404).json({ error: "Chat thread not found." });
    return;
  }

  const [thread] = existing
    ? await db
        .update(chatThreadsTable)
        .set({
          mode: body.data.mode,
          title: body.data.title.slice(0, 120),
          updatedAt: new Date(),
        })
        .where(and(eq(chatThreadsTable.id, params.data.id), eq(chatThreadsTable.ownerId, ownerId)))
        .returning()
    : await db
        .insert(chatThreadsTable)
        .values({
          id: params.data.id,
          ownerId,
          mode: body.data.mode,
          title: body.data.title.slice(0, 120),
          createdAt: new Date(body.data.createdAt),
          updatedAt: new Date(),
        })
        .returning();

  if (!thread) {
    res.status(404).json({ error: "Chat thread not found." });
    return;
  }

  await db
    .delete(chatMessagesTable)
    .where(and(eq(chatMessagesTable.threadId, thread.id), eq(chatMessagesTable.ownerId, ownerId)));
  await db.insert(chatMessagesTable).values(
    body.data.messages.slice(-200).map((message) => ({
      id: message.id,
      threadId: thread.id,
      ownerId,
      role: message.role,
      content: message.content.slice(0, 20_000),
      thought: message.thought?.slice(0, 10_000) ?? null,
      createdAt: new Date(message.createdAt),
    })),
  );

  res.json(SyncThreadResponse.parse(await serializeThread(ownerId, thread)));
});

router.delete("/threads/:id", requireAuth, async (req, res): Promise<void> => {
  const params = DeleteThreadParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "The chat thread is not valid." });
    return;
  }
  const ownerId = getUserId(req);
  await db
    .delete(chatMessagesTable)
    .where(and(eq(chatMessagesTable.threadId, params.data.id), eq(chatMessagesTable.ownerId, ownerId)));
  await db
    .delete(chatThreadsTable)
    .where(and(eq(chatThreadsTable.id, params.data.id), eq(chatThreadsTable.ownerId, ownerId)));
  res.status(204).send();
});

export default router;