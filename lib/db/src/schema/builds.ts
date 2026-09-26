import { createInsertSchema } from "drizzle-zod";
import { integer, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const userCreditsTable = pgTable("user_credits", {
  userId: text("user_id").primaryKey(),
  buildCreditsRemaining: integer("build_credits_remaining").notNull().default(1),
  buildDay: text("build_day").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const projectsTable = pgTable("build_projects", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  name: text("name").notNull(),
  prompt: text("prompt").notNull(),
  rootPath: text("root_path").notNull(),
  status: text("status").notNull().default("ready"),
  serverStatus: text("server_status").notNull().default("stopped"),
  serverPid: integer("server_pid"),
  serverPort: integer("server_port"),
  serverStartedAt: timestamp("server_started_at", { withTimezone: true }),
  buildLog: text("build_log"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const projectFilesTable = pgTable(
  "build_project_files",
  {
    projectId: text("project_id").notNull(),
    path: text("path").notNull(),
    kind: text("kind").notNull().default("file"),
    content: text("content").notNull(),
    size: integer("size").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    projectPath: primaryKey({ columns: [table.projectId, table.path] }),
  }),
);

export const chatThreadsTable = pgTable("chat_threads", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  mode: text("mode").notNull().default("chat"),
  title: text("title").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const chatMessagesTable = pgTable("chat_messages", {
  id: text("id").primaryKey(),
  threadId: text("thread_id").notNull(),
  ownerId: text("owner_id").notNull(),
  role: text("role").notNull(),
  content: text("content").notNull(),
  thought: text("thought"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertUserCreditsSchema = createInsertSchema(userCreditsTable);
export const insertProjectSchema = createInsertSchema(projectsTable);
export const insertProjectFileSchema = createInsertSchema(projectFilesTable);
export const insertChatThreadSchema = createInsertSchema(chatThreadsTable);
export const insertChatMessageSchema = createInsertSchema(chatMessagesTable);

export type InsertUserCredits = z.infer<typeof insertUserCreditsSchema>;
export type UserCredits = typeof userCreditsTable.$inferSelect;
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type Project = typeof projectsTable.$inferSelect;
export type InsertProjectFile = z.infer<typeof insertProjectFileSchema>;
export type ProjectFile = typeof projectFilesTable.$inferSelect;
export type InsertChatThread = z.infer<typeof insertChatThreadSchema>;
export type ChatThread = typeof chatThreadsTable.$inferSelect;
export type InsertChatMessage = z.infer<typeof insertChatMessageSchema>;
export type ChatMessage = typeof chatMessagesTable.$inferSelect;