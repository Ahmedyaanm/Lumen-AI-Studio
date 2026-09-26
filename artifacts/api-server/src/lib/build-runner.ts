import { execFile, spawn, type ChildProcess } from "node:child_process";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { db, projectsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

const execFileAsync = promisify(execFile);
const workspaceRoot = path.resolve(
  process.env.BUILD_WORKSPACE_ROOT ?? path.join(process.cwd(), "data", "build-workspaces"),
);
const runningProcesses = new Map<string, ChildProcess>();

type GeneratedProject = {
  summary?: string;
  files?: { path: string; content: string }[];
  dependencies?: string[];
};

function projectRoot(userId: string, projectId: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(userId) || !/^project-[A-Za-z0-9-]+$/.test(projectId)) {
    throw new Error("Invalid project workspace.");
  }
  return path.join(workspaceRoot, userId, projectId);
}

function safePath(root: string, relativePath: string): string {
  const normalized = relativePath.replaceAll("\\", "/").replace(/^\/+/, "");
  if (!normalized || normalized.includes("\0")) {
    throw new Error("Invalid project file path.");
  }
  const resolved = path.resolve(root, normalized);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error("Project file path escapes the workspace.");
  }
  return resolved;
}

function parseGeneratedProject(content: string): GeneratedProject {
  const trimmed = content.trim();
  const withoutFence = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");

  for (let start = withoutFence.indexOf("{"); start >= 0; start = withoutFence.indexOf("{", start + 1)) {
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let index = start; index < withoutFence.length; index += 1) {
      const character = withoutFence[index];
      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (character === "\\") {
          escaped = true;
        } else if (character === '"') {
          inString = false;
        }
        continue;
      }

      if (character === '"') {
        inString = true;
      } else if (character === "{") {
        depth += 1;
      } else if (character === "}") {
        depth -= 1;
        if (depth === 0) {
          try {
            const parsed = JSON.parse(withoutFence.slice(start, index + 1)) as GeneratedProject;
            if (Array.isArray(parsed.files) && parsed.files.length > 0) return parsed;
          } catch {
            break;
          }
        }
      }
    }
  }

  throw new Error("The build model returned invalid project JSON.");
}

function normalizeGeneratedFile(pathName: string, content: string): string {
  if (path.basename(pathName) !== "package.json") return content;
  try {
    return JSON.stringify(JSON.parse(content), null, 2);
  } catch {
    const unescaped = content.replace(/\\"/g, '"').replace(/\\\\/g, "\\");
    try {
      return JSON.stringify(JSON.parse(unescaped), null, 2);
    } catch {
      throw new Error("The build model returned an invalid package.json.");
    }
  }
}

async function askBuildModel(
  prompt: string,
  name: string,
  existingFiles: { path: string; content: string }[] = [],
): Promise<GeneratedProject> {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) throw new Error("AI builds require a GROQ_API_KEY secret.");

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "openai/gpt-oss-20b",
      temperature: 0.2,
      max_tokens: 12_000,
      messages: [
        {
          role: "system",
          content: [
            "You are Lumen Build, a careful autonomous coding agent.",
            "Return ONLY valid JSON with this exact shape:",
            '{"summary":"short summary","files":[{"path":"relative/path","content":"full file contents"}],"dependencies":["package-name"]}',
            "Build a runnable web project from the user's request.",
            "Include a valid package.json with a Vite dev script when a server or preview is useful.",
            "Use package scripts such as \"dev\":\"vite --host 0.0.0.0\"; do not use live-server or custom shell commands.",
            "Do not include shell commands, secrets, credentials, binary data, symlinks, or paths beginning with /.",
            "Keep the project focused and complete. Use the existing Lumen square-grid visual language when the request is visual.",
            `Project name: ${name}`,
            existingFiles.length > 0
              ? "When editing, return the complete updated file manifest and preserve unrelated files."
              : "",
          ].join("\n"),
        },
        {
          role: "user",
          content: [
            prompt,
            existingFiles.length > 0
              ? `Existing project files:\n${existingFiles
                  .map((file) => `--- ${file.path} ---\n${file.content}`)
                  .join("\n")
                  .slice(0, 80_000)}`
              : "",
          ]
            .filter(Boolean)
            .join("\n\n")
            .slice(0, 100_000),
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`The build model could not respond (${response.status}).`);
  }
  const body = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = body.choices?.[0]?.message?.content;
  if (!content) throw new Error("The build model returned an empty project.");
  return parseGeneratedProject(content);
}

function validateDependency(name: string): boolean {
  return (
    name.length <= 120 &&
    /^[A-Za-z0-9@._/~:-]+$/.test(name) &&
    !name.includes("..") &&
    !name.startsWith("-")
  );
}

async function installDependencies(root: string, dependencies: string[]): Promise<string[]> {
  const safeDependencies = [...new Set(dependencies.filter(validateDependency))].slice(0, 12);
  if (safeDependencies.length === 0) return [];

  await execFileAsync(
    "pnpm",
    ["add", "--ignore-scripts", "--save-exact", ...safeDependencies],
    { cwd: root, timeout: 120_000, maxBuffer: 400_000 },
  );
  return safeDependencies;
}

export async function buildProjectFiles(
  userId: string,
  projectId: string,
  name: string,
  prompt: string,
): Promise<{
  summary: string;
  dependencies: string[];
  fileCount: number;
  files: { path: string; content: string; size: number }[];
}> {
  const root = projectRoot(userId, projectId);
  await mkdir(root, { recursive: true });
  const generated = await askBuildModel(prompt, name);
  const files = generated.files?.slice(0, 48) ?? [];
  const persistedFiles: { path: string; content: string; size: number }[] = [];
  for (const file of files) {
    if (
      typeof file.path !== "string" ||
      typeof file.content !== "string" ||
      file.content.length > 250_000 ||
      file.path.startsWith(".env") ||
      file.path === ".npmrc"
    ) {
      throw new Error("The build model returned an unsafe or oversized file.");
    }
    const normalizedContent = normalizeGeneratedFile(file.path, file.content);
    const destination = safePath(root, file.path);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, normalizedContent, "utf8");
    persistedFiles.push({
      path: file.path.replaceAll("\\", "/"),
      content: normalizedContent,
      size: Buffer.byteLength(normalizedContent, "utf8"),
    });
  }

  const dependencies = await installDependencies(root, generated.dependencies ?? []);
  return {
    summary: generated.summary?.slice(0, 1_000) || "Project files generated.",
    dependencies,
    fileCount: files.length,
    files: persistedFiles,
  };
}

export async function editProjectFiles(
  userId: string,
  projectId: string,
  name: string,
  instruction: string,
): Promise<{
  summary: string;
  dependencies: string[];
  fileCount: number;
  files: { path: string; content: string; size: number }[];
}> {
  const existingEntries = await listProjectFiles(userId, projectId);
  const existingFiles = await Promise.all(
    existingEntries
      .filter((entry) => entry.kind === "file")
      .slice(0, 32)
      .map(async (entry) => ({
        path: entry.path,
        content: (await readProjectFile(userId, projectId, entry.path)).content,
      })),
  );
  const generated = await askBuildModel(
    `Edit this existing project according to the instruction below. Fix broken behavior if needed.\nInstruction: ${instruction}`,
    name,
    existingFiles,
  );
  const root = projectRoot(userId, projectId);
  const files = generated.files?.slice(0, 48) ?? [];
  const persistedFiles: { path: string; content: string; size: number }[] = [];
  for (const file of files) {
    if (
      typeof file.path !== "string" ||
      typeof file.content !== "string" ||
      file.content.length > 250_000 ||
      file.path.startsWith(".env") ||
      file.path === ".npmrc"
    ) {
      throw new Error("The build model returned an unsafe or oversized file.");
    }
    const normalizedContent = normalizeGeneratedFile(file.path, file.content);
    const destination = safePath(root, file.path);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, normalizedContent, "utf8");
    persistedFiles.push({
      path: file.path.replaceAll("\\", "/"),
      content: normalizedContent,
      size: Buffer.byteLength(normalizedContent, "utf8"),
    });
  }
  const dependencies = await installDependencies(root, generated.dependencies ?? []);
  return {
    summary: generated.summary?.slice(0, 1_000) || "Project updated.",
    dependencies,
    fileCount: files.length,
    files: persistedFiles,
  };
}

export async function listProjectFiles(userId: string, projectId: string) {
  const root = projectRoot(userId, projectId);
  const results: { path: string; kind: "file" | "directory"; size: number }[] = [];

  async function walk(current: string): Promise<void> {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      const absolute = path.join(current, entry.name);
      const relative = path.relative(root, absolute).replaceAll(path.sep, "/");
      if (entry.isDirectory()) {
        results.push({ path: relative, kind: "directory", size: 0 });
        await walk(absolute);
      } else if (entry.isFile()) {
        results.push({ path: relative, kind: "file", size: (await stat(absolute)).size });
      }
    }
  }

  await walk(root);
  return results.sort((a, b) => a.path.localeCompare(b.path));
}

export async function readProjectFile(userId: string, projectId: string, relativePath: string) {
  const root = projectRoot(userId, projectId);
  const filePath = safePath(root, relativePath);
  const fileStats = await stat(filePath);
  if (!fileStats.isFile() || fileStats.size > 500_000) {
    throw new Error("That project file cannot be previewed.");
  }
  return {
    path: relativePath.replaceAll("\\", "/"),
    content: await readFile(filePath, "utf8"),
    size: fileStats.size,
  };
}

export function projectArchivePath(userId: string, projectId: string): string {
  return projectRoot(userId, projectId);
}

export function isProjectServerActive(projectId: string): boolean {
  const process = runningProcesses.get(projectId);
  return Boolean(process && !process.killed);
}

export async function controlProjectServer(
  userId: string,
  projectId: string,
  action: "start" | "stop",
): Promise<{ status: "stopped" | "starting" | "running" | "failed"; pid: number | null; port: number | null }> {
  const root = projectRoot(userId, projectId);
  if (action === "stop") {
    const process = runningProcesses.get(projectId);
    if (process && !process.killed) process.kill("SIGTERM");
    runningProcesses.delete(projectId);
    return { status: "stopped", pid: null, port: null };
  }

  const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8")) as {
    scripts?: Record<string, string>;
  };
  const script = packageJson.scripts?.dev ? "dev" : packageJson.scripts?.start ? "start" : null;
  if (!script) throw new Error("This project does not define a dev or start script.");
  const command = packageJson.scripts?.[script]?.trim() ?? "";
  if (!/^(vite|next\s+dev|astro\s+dev|react-scripts\s+start|live-server|python(?:3)?\s+-m\s+http\.server)(?:\s|$)/.test(command)) {
    throw new Error("This project server command is outside the controlled sandbox allowlist.");
  }

  const existing = runningProcesses.get(projectId);
  if (existing && !existing.killed) {
    return { status: "running", pid: existing.pid ?? null, port: 18_000 + (projectId.charCodeAt(0) % 500) };
  }

  const port = 18_000 + (projectId.charCodeAt(0) % 500);
  const child = spawn("pnpm", ["run", script], {
    cwd: root,
    env: {
      PATH: process.env.PATH ?? "",
      HOME: root,
      NODE_ENV: "development",
      PORT: String(port),
      HOST: "0.0.0.0",
    },
    stdio: "ignore",
  });
  runningProcesses.set(projectId, child);
  child.on("exit", () => {
    runningProcesses.delete(projectId);
    void db
      .update(projectsTable)
      .set({ serverStatus: "stopped", serverPid: null, serverPort: null })
      .where(eq(projectsTable.id, projectId));
  });
  child.on("error", (error) => logger.error({ error, projectId }, "Project server failed"));
  return { status: "running", pid: child.pid ?? null, port };
}