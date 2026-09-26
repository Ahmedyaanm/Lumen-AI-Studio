import { Router, type IRouter } from "express";
import { and, desc, eq, gt, sql } from "drizzle-orm";
import {
  BuildProjectBody,
  BuildProjectResponse,
  EditProjectBody,
  EditProjectParams,
  EditProjectResponse,
  ControlProjectServerBody,
  ControlProjectServerParams,
  ControlProjectServerResponse,
  GetCurrentUserResponse,
  GetProjectParams,
  GetProjectResponse,
  ListProjectFilesParams,
  ListProjectFilesResponse,
  ListProjectsResponse,
  ReadProjectFileBody,
  ReadProjectFileParams,
  ReadProjectFileResponse,
} from "@workspace/api-zod";
import { db, projectFilesTable, projectsTable, userCreditsTable } from "@workspace/db";
import { getUserId, requireAuth } from "../lib/auth";
import {
  buildProjectFiles,
  controlProjectServer,
  editProjectFiles,
  listProjectFiles,
  projectArchivePath,
  readProjectFile,
  isProjectServerActive,
} from "../lib/build-runner";
import { logger } from "../lib/logger";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createProxyMiddleware } from "http-proxy-middleware";

const router: IRouter = Router();
const execFileAsync = promisify(execFile);
const dailyBuildLimit = 1;

function currentBuildDay(): string {
  return new Date().toISOString().slice(0, 10);
}

async function getDailyCredits(userId: string) {
  const today = currentBuildDay();
  let [credits] = await db
    .select()
    .from(userCreditsTable)
    .where(eq(userCreditsTable.userId, userId));
  if (!credits) {
    await db
      .insert(userCreditsTable)
      .values({ userId, buildCreditsRemaining: dailyBuildLimit, buildDay: today })
      .onConflictDoNothing();
    [credits] = await db
      .select()
      .from(userCreditsTable)
      .where(eq(userCreditsTable.userId, userId));
  } else if (credits.buildDay !== today) {
    [credits] = await db
      .update(userCreditsTable)
      .set({ buildCreditsRemaining: dailyBuildLimit, buildDay: today, updatedAt: new Date() })
      .where(eq(userCreditsTable.userId, userId))
      .returning();
  }
  return credits;
}

async function refundDailyCredit(userId: string) {
  await db
    .update(userCreditsTable)
    .set({ buildCreditsRemaining: dailyBuildLimit, updatedAt: new Date() })
    .where(and(eq(userCreditsTable.userId, userId), eq(userCreditsTable.buildDay, currentBuildDay())));
}

function projectResponse(project: typeof projectsTable.$inferSelect) {
  return {
    id: project.id,
    name: project.name,
    prompt: project.prompt,
    status: project.status,
    serverStatus: project.serverStatus,
    serverPort: project.serverPort,
    buildLog: project.buildLog,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}

async function findProject(userId: string, id: string) {
  const [project] = await db
    .select()
    .from(projectsTable)
    .where(and(eq(projectsTable.id, id), eq(projectsTable.ownerId, userId)));
  return project;
}

async function saveProjectFiles(
  projectId: string,
  files: { path: string; content: string; size: number }[],
) {
  for (const file of files) {
    await db
      .insert(projectFilesTable)
      .values({
        projectId,
        path: file.path,
        kind: "file",
        content: file.content,
        size: file.size,
      })
      .onConflictDoUpdate({
        target: [projectFilesTable.projectId, projectFilesTable.path],
        set: {
          content: file.content,
          size: file.size,
          updatedAt: new Date(),
        },
      });
  }
}

router.get("/me", requireAuth, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const credits = await getDailyCredits(userId);
  res.json(
    GetCurrentUserResponse.parse({
      id: userId,
      displayName: "Builder",
      email: null,
      buildCreditsRemaining: credits.buildCreditsRemaining,
      workspaceId: `lumen-${userId}`,
      workspaceType: "managed-sandbox",
    }),
  );
});

router.get("/projects", requireAuth, async (req, res): Promise<void> => {
  const projects = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.ownerId, getUserId(req)))
    .orderBy(desc(projectsTable.updatedAt));
  res.json(ListProjectsResponse.parse(projects.map(projectResponse)));
});

router.post("/projects", requireAuth, async (req, res): Promise<void> => {
  const parsed = BuildProjectBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const userId = getUserId(req);
  await getDailyCredits(userId);

  const [claimedCredits] = await db
    .update(userCreditsTable)
    .set({
      buildCreditsRemaining: sql`${userCreditsTable.buildCreditsRemaining} - 1`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(userCreditsTable.userId, userId),
        eq(userCreditsTable.buildDay, currentBuildDay()),
        gt(userCreditsTable.buildCreditsRemaining, 0),
      ),
    )
    .returning();
  if (!claimedCredits) {
    res.status(402).json({ error: "You have used both build credits for this account." });
    return;
  }

  const id = `project-${crypto.randomUUID()}`;
  const rootPath = path.join(process.env.BUILD_WORKSPACE_ROOT ?? path.join(process.cwd(), "data", "build-workspaces"), userId, id);
  const [project] = await db
    .insert(projectsTable)
    .values({
      id,
      ownerId: userId,
      name: parsed.data.name.slice(0, 80),
      prompt: parsed.data.prompt.slice(0, 20_000),
      rootPath,
      status: "building",
      serverStatus: "stopped",
      buildLog: "Lumen is planning the project...",
    })
    .returning();

  try {
    const result = await buildProjectFiles(userId, id, parsed.data.name, parsed.data.prompt);
    await saveProjectFiles(id, result.files);
    const [ready] = await db
      .update(projectsTable)
      .set({
        status: "ready",
        buildLog: `${result.summary}\n\n${result.fileCount} files created${result.dependencies.length ? `\nPackages: ${result.dependencies.join(", ")}` : ""}`,
        updatedAt: new Date(),
      })
      .where(eq(projectsTable.id, id))
      .returning();
    res.status(201).json(BuildProjectResponse.parse(projectResponse(ready)));
  } catch (error) {
    const message = error instanceof Error ? error.message : "The build failed.";
    logger.error({ error, projectId: id, userId }, "AI project build failed");
    const [failed] = await db
      .update(projectsTable)
      .set({ status: "failed", buildLog: message, updatedAt: new Date() })
      .where(eq(projectsTable.id, id))
      .returning();
    await refundDailyCredit(userId);
    res.status(500).json({ error: message, project: projectResponse(failed) });
  }
});

router.post("/projects/:id/edit", requireAuth, async (req, res): Promise<void> => {
  const params = EditProjectParams.safeParse(req.params);
  const body = EditProjectBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Describe the change you want to make." });
    return;
  }

  const userId = getUserId(req);
  const project = await findProject(userId, params.data.id);
  if (!project) {
    res.status(404).json({ error: "Project not found." });
    return;
  }

  await db
    .update(projectsTable)
    .set({ status: "building", buildLog: "Lumen is applying your requested change...", updatedAt: new Date() })
    .where(eq(projectsTable.id, project.id));

  try {
    const result = await editProjectFiles(userId, project.id, project.name, body.data.instruction);
    await saveProjectFiles(project.id, result.files);
    const [updated] = await db
      .update(projectsTable)
      .set({
        status: "ready",
        buildLog: `${result.summary}\n\n${result.fileCount} files updated${result.dependencies.length ? `\nPackages: ${result.dependencies.join(", ")}` : ""}`,
        updatedAt: new Date(),
      })
      .where(eq(projectsTable.id, project.id))
      .returning();
    res.json(EditProjectResponse.parse(projectResponse(updated)));
  } catch (error) {
    const message = error instanceof Error ? error.message : "The project edit failed.";
    logger.error({ error, projectId: project.id, userId }, "AI project edit failed");
    const [failed] = await db
      .update(projectsTable)
      .set({ status: "failed", buildLog: message, updatedAt: new Date() })
      .where(eq(projectsTable.id, project.id))
      .returning();
    res.status(500).json({ error: message, project: projectResponse(failed) });
  }
});

router.get("/projects/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetProjectParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const project = await findProject(getUserId(req), params.data.id);
  if (!project) {
    res.status(404).json({ error: "Project not found." });
    return;
  }
  res.json(GetProjectResponse.parse(projectResponse(project)));
});

router.get("/projects/:id/files", requireAuth, async (req, res): Promise<void> => {
  const params = ListProjectFilesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const project = await findProject(getUserId(req), params.data.id);
  if (!project) {
    res.status(404).json({ error: "Project not found." });
    return;
  }
  try {
    const files = await listProjectFiles(getUserId(req), project.id);
    if (files.length > 0) {
      res.json(ListProjectFilesResponse.parse(files));
      return;
    }
  } catch {
    // Fall through to the durable database copy.
  }
  const persistedFiles = await db
    .select({ path: projectFilesTable.path, kind: projectFilesTable.kind, size: projectFilesTable.size })
    .from(projectFilesTable)
    .where(eq(projectFilesTable.projectId, project.id));
  if (persistedFiles.length === 0) {
    res.status(404).json({ error: "Project files are not available yet." });
    return;
  }
  res.json(ListProjectFilesResponse.parse(persistedFiles.map((file) => ({
    ...file,
    kind: file.kind === "directory" ? "directory" : "file",
  }))));
});

router.post("/projects/:id/file", requireAuth, async (req, res): Promise<void> => {
  const params = ReadProjectFileParams.safeParse(req.params);
  const body = ReadProjectFileBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "A valid project file path is required." });
    return;
  }
  const project = await findProject(getUserId(req), params.data.id);
  if (!project) {
    res.status(404).json({ error: "Project not found." });
    return;
  }
  try {
    res.json(ReadProjectFileResponse.parse(await readProjectFile(getUserId(req), project.id, body.data.path)));
    return;
  } catch {
    const [persistedFile] = await db
      .select({
        path: projectFilesTable.path,
        content: projectFilesTable.content,
        size: projectFilesTable.size,
      })
      .from(projectFilesTable)
      .where(and(eq(projectFilesTable.projectId, project.id), eq(projectFilesTable.path, body.data.path)));
    if (!persistedFile) {
      res.status(404).json({ error: "Project file not found." });
      return;
    }
    res.json(ReadProjectFileResponse.parse(persistedFile));
  }
});

router.post("/projects/:id/server", requireAuth, async (req, res): Promise<void> => {
  const params = ControlProjectServerParams.safeParse(req.params);
  const body = ControlProjectServerBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "A valid server action is required." });
    return;
  }
  const userId = getUserId(req);
  const project = await findProject(userId, params.data.id);
  if (!project) {
    res.status(404).json({ error: "Project not found." });
    return;
  }
  try {
    const server = await controlProjectServer(userId, project.id, body.data.action);
    const [updated] = await db
      .update(projectsTable)
      .set({
        serverStatus: server.status,
        serverPid: server.pid,
        serverPort: server.port,
        serverStartedAt: body.data.action === "start" ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(projectsTable.id, project.id))
      .returning();
    res.json(ControlProjectServerResponse.parse(projectResponse(updated)));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not control the project server.";
    res.status(400).json({ error: message });
  }
});

router.use("/projects/:id/preview", requireAuth, async (req, res, next) => {
  const projectId = typeof req.params.id === "string" ? req.params.id : req.params.id[0];
  const project = await findProject(getUserId(req), projectId);
  if (!project) {
    res.status(404).json({ error: "Project not found." });
    return;
  }
  if (!project.serverPort || !isProjectServerActive(project.id)) {
    res.status(409).json({ error: "Start the project server before opening its preview." });
    return;
  }

  createProxyMiddleware({
    target: `http://127.0.0.1:${project.serverPort}`,
    changeOrigin: false,
    ws: false,
  })(req, res, next);
});

router.get("/projects/:id/download", requireAuth, async (req, res): Promise<void> => {
  const params = GetProjectParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const project = await findProject(getUserId(req), params.data.id);
  if (!project) {
    res.status(404).json({ error: "Project not found." });
    return;
  }
  const archive = `${project.id}.tar.gz`;
  const tempDir = path.join("/tmp", "lumen-archives");
  const archivePath = path.join(tempDir, archive);
  try {
    await mkdir(tempDir, { recursive: true });
    await execFileAsync("tar", ["-czf", archivePath, "-C", projectArchivePath(getUserId(req), project.id), "."]);
    res.download(archivePath, `${project.name.replace(/[^a-z0-9-_]+/gi, "-")}.tar.gz`, () => {
      void rm(archivePath, { force: true });
    });
  } catch {
    res.status(404).json({ error: "Project archive is not available." });
  }
});

export default router;