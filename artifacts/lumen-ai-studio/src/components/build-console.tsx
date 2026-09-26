import {
  Download,
  ExternalLink,
  FileCode2,
  Folder,
  FolderOpen,
  Play,
  WandSparkles,
  Square,
  Terminal,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  getListProjectFilesQueryKey,
  getListProjectsQueryKey,
  getGetProjectQueryKey,
  type Project,
  useControlProjectServer,
  useEditProject,
  useListProjectFiles,
  useReadProjectFile,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

type BuildConsoleProps = {
  projects: Project[];
  selectedProjectId: string;
  creditsRemaining?: number;
  onSelectProject: (id: string) => void;
};

export default function BuildConsole({
  projects,
  selectedProjectId,
  creditsRemaining,
  onSelectProject,
}: BuildConsoleProps) {
  const queryClient = useQueryClient();
  const [selectedFile, setSelectedFile] = useState("");
  const [editInstruction, setEditInstruction] = useState("");
  const filesQuery = useListProjectFiles(selectedProjectId, {
    query: {
      enabled: Boolean(selectedProjectId),
      queryKey: getListProjectFilesQueryKey(selectedProjectId),
    },
  });
  const fileReader = useReadProjectFile();
  const serverControl = useControlProjectServer();
  const editProject = useEditProject();
  const project = projects.find((item) => item.id === selectedProjectId);
  const fileContent = fileReader.data;

  useEffect(() => {
    setSelectedFile("");
    fileReader.reset();
  }, [selectedProjectId]);

  function openFile(path: string) {
    setSelectedFile(path);
    fileReader.mutate({ id: selectedProjectId, data: { path } });
  }

  function controlServer(action: "start" | "stop") {
    serverControl.mutate(
      { id: selectedProjectId, data: { action } },
      {
        onSuccess: (updated) => {
          queryClient.setQueryData(getGetProjectQueryKey(selectedProjectId), updated);
          queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
        },
      },
    );
  }

  function submitEdit() {
    const instruction = editInstruction.trim();
    if (!instruction || !selectedProjectId) return;
    editProject.mutate(
      { id: selectedProjectId, data: { instruction } },
      {
        onSuccess: () => {
          setEditInstruction("");
          queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(selectedProjectId) });
          queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getListProjectFilesQueryKey(selectedProjectId) });
        },
      },
    );
  }

  if (!project && projects.length === 0) {
    return (
      <section className="build-console mx-auto w-full max-w-[860px]" data-testid="build-console-empty">
        <div className="build-console-empty">
          <Terminal size={18} />
          <div>
            <p className="font-mono-ui text-[10px] uppercase tracking-[0.16em] text-[#f65d3d]">Build room ready</p>
            <p className="mt-1 text-sm text-[#806f69]">Describe what you want to make below. Lumen will write the files and prepare the workspace.</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="build-console mx-auto w-full max-w-[860px]" data-testid="build-console">
      <div className="build-console-header">
        <div>
          <div className="flex items-center gap-2 font-mono-ui text-[10px] uppercase tracking-[0.16em] text-[#f65d3d]">
            <span className="size-2 rounded-full bg-[#f65d3d]" /> Build room
          </div>
          <h2 className="mt-2 font-display text-3xl text-[#2d2039]">Your projects, in the open.</h2>
        </div>
        <div className="build-credit-meter" data-testid="status-build-credits">
          <span className="font-mono-ui text-[9px] uppercase tracking-[0.12em] text-[#806f69]">Today’s build</span>
          <strong>{creditsRemaining ?? "—"} <span>/ 1</span></strong>
        </div>
      </div>

      <div className="build-console-grid">
        <div className="build-project-list">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-mono-ui text-[9px] uppercase tracking-[0.15em] text-[#9d8e8d]">Projects</span>
            <span className="font-mono-ui text-[9px] text-[#9d8e8d]">{projects.length.toString().padStart(2, "0")}</span>
          </div>
          {projects.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`build-project-row ${item.id === selectedProjectId ? "build-project-row-active" : ""}`}
              onClick={() => onSelectProject(item.id)}
              data-testid={`button-select-project-${item.id}`}
            >
              <FileCode2 size={15} />
              <span className="min-w-0 flex-1 text-left">
                <span className="block truncate text-xs font-semibold">{item.name}</span>
                <span className="mt-1 block font-mono-ui text-[9px] uppercase tracking-[0.08em] text-[#9d8e8d]">{item.status}</span>
              </span>
              <span className={`status-dot status-dot-${item.serverStatus}`} />
            </button>
          ))}
        </div>

        <div className="build-project-detail">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e9dfd2] pb-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-[#2d2039]">{project?.name}</p>
              <p className="mt-1 font-mono-ui text-[9px] uppercase tracking-[0.1em] text-[#9d8e8d]">{project?.serverStatus} server</p>
            </div>
            <div className="flex items-center gap-2">
              {project?.serverStatus === "running" ? (
                <a className="console-action" href={`/api/projects/${selectedProjectId}/preview/`} target="_blank" rel="noreferrer" data-testid="link-live-preview"><ExternalLink size={13} /> Preview</a>
              ) : null}
              {project?.serverStatus === "running" ? (
                <button type="button" className="console-action console-action-stop" onClick={() => controlServer("stop")} disabled={serverControl.isPending} data-testid="button-stop-project-server"><Square size={13} /> Stop</button>
              ) : (
                <button type="button" className="console-action" onClick={() => controlServer("start")} disabled={serverControl.isPending || project?.status !== "ready"} data-testid="button-start-project-server"><Play size={13} /> Start server</button>
              )}
              <a className="console-action" href={`/api/projects/${selectedProjectId}/download`} download data-testid="link-download-project"><Download size={13} /> Download</a>
            </div>
          </div>

          <div className="build-edit-bar">
            <WandSparkles size={15} className="shrink-0 text-[#f65d3d]" />
            <input
              value={editInstruction}
              onChange={(event) => setEditInstruction(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter") submitEdit(); }}
              placeholder="Ask Lumen to fix or change this project..."
              disabled={editProject.isPending || project?.status === "building"}
              data-testid="input-project-edit"
            />
            <button type="button" className="console-action" onClick={submitEdit} disabled={!editInstruction.trim() || editProject.isPending || project?.status === "building"} data-testid="button-submit-project-edit">
              {editProject.isPending ? "Working..." : "Apply"}
            </button>
          </div>

          <div className="build-files-layout">
            <div className="build-file-tree">
              {filesQuery.isLoading ? <p className="p-3 text-xs text-[#9d8e8d]">Indexing files...</p> : null}
              {filesQuery.data?.map((file) => (
                <button
                  key={file.path}
                  type="button"
                  className={`build-file-row ${file.path === selectedFile ? "build-file-row-active" : ""}`}
                  onClick={() => file.kind === "file" && openFile(file.path)}
                  disabled={file.kind === "directory"}
                  data-testid={`button-open-file-${file.path.replaceAll("/", "-")}`}
                >
                  {file.kind === "directory" ? <Folder size={14} /> : file.path === selectedFile ? <FolderOpen size={14} /> : <FileCode2 size={14} />}
                  <span className="truncate">{file.path}</span>
                </button>
              ))}
            </div>
            <div className="build-file-preview" data-testid="panel-file-preview">
              {fileReader.isPending ? <p className="text-xs text-[#9d8e8d]">Opening file...</p> : null}
              {!fileReader.isPending && !fileContent ? <p className="text-xs leading-5 text-[#9d8e8d]">Choose a file to inspect its contents.</p> : null}
              {fileContent ? (
                <pre className="max-h-[300px] overflow-auto whitespace-pre-wrap font-mono-ui text-[11px] leading-5 text-[#403649]">{fileContent.content}</pre>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}