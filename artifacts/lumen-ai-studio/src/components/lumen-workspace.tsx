import {
  ArrowUp,
  BookOpen,
  ChevronDown,
  Command,
  FileCode2,
  History,
  Layers3,
  Menu,
  MessageCircle,
  MoreHorizontal,
  Plus,
  RotateCcw,
  Settings2,
  Sparkles,
  Trash2,
  Wifi,
  X,
  Zap,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { useClerk, useUser } from '@clerk/react';
import {
  getGetCurrentUserQueryKey,
  getHealthCheckQueryKey,
  getListThreadsQueryKey,
  getListProjectsQueryKey,
  useCompleteChat,
  useBuildProject,
  useDeleteThread,
  useGetCurrentUser,
  useHealthCheck,
  useListProjects,
  useListThreads,
  useSyncThread,
} from '@workspace/api-client-react';
import type { ChatMessage } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import BuildConsole from '@/components/build-console';
import {
  createThread,
  type StudioMessage,
  type StudioMode,
  type StudioThread,
} from '@/lib/thread-storage';

function formatTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatHistoryDate(value: string) {
  const date = new Date(value);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date);
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  return 'The studio could not reach the model. Try sending that again.';
}

function ModeGlyph({ mode, size = 16 }: { mode: StudioMode; size?: number }) {
  return mode === 'build' ? <FileCode2 size={size} strokeWidth={1.8} /> : <MessageCircle size={size} strokeWidth={1.8} />;
}

function LumenMark() {
  return (
    <div className="flex items-center gap-3" data-testid="brand-lumen">
      <div className="relative flex size-9 items-center justify-center rounded-[11px] bg-[#f65d3d] text-[#2d2039] shadow-[0_4px_0_#b94231]">
        <span className="absolute size-4 rounded-full border-[2px] border-[#2d2039]" />
        <span className="absolute h-[2px] w-7 rotate-45 bg-[#2d2039]" />
      </div>
      <div>
        <div className="font-mono-ui text-[13px] font-bold tracking-[0.24em] text-[#fff8ea]">LUMEN</div>
        <div className="mt-0.5 text-[10px] uppercase tracking-[0.16em] text-[#b9afc3]">AI studio</div>
      </div>
    </div>
  );
}

function Sidebar({
  threads,
  activeThreadId,
  onSelectThread,
  onNewThread,
  onClose,
}: {
  threads: StudioThread[];
  activeThreadId: string;
  onSelectThread: (thread: StudioThread) => void;
  onNewThread: () => void;
  onClose?: () => void;
}) {
  const durableThreads = threads.filter((thread) => thread.messages.length > 0);
  const groups = durableThreads.reduce<Record<string, StudioThread[]>>((acc, thread) => {
    const group = formatHistoryDate(thread.updatedAt);
    acc[group] = [...(acc[group] ?? []), thread];
    return acc;
  }, {});

  return (
    <aside className="studio-sidebar fixed inset-y-0 left-0 z-40 flex w-[292px] -translate-x-full flex-col border-r border-[#453954] bg-[#2d2039] text-[#fff8ea] transition-transform duration-300 lg:relative lg:translate-x-0" data-testid="sidebar-history">
      <div className="flex items-center justify-between px-6 pb-6 pt-7">
        <LumenMark />
        {onClose ? (
          <button className="icon-button-dark lg:hidden" onClick={onClose} aria-label="Close history" data-testid="button-close-history">
            <X size={18} />
          </button>
        ) : null}
      </div>

      <div className="px-5">
        <button
          className="group flex w-full items-center justify-between rounded-[13px] bg-[#f65d3d] px-4 py-3 text-left text-sm font-bold text-[#2d2039] shadow-[0_4px_0_#b94231] transition-transform hover:-translate-y-0.5 active:translate-y-0 active:shadow-none"
          onClick={onNewThread}
          data-testid="button-new-session"
        >
          <span className="flex items-center gap-2"><Plus size={17} strokeWidth={2.5} /> New session</span>
          <span className="font-mono-ui text-[10px] opacity-70">N</span>
        </button>
      </div>

      <div className="mt-9 flex items-center justify-between px-6">
        <span className="flex items-center gap-2 font-mono-ui text-[10px] font-bold uppercase tracking-[0.18em] text-[#a99db5]">
          <History size={13} /> Desk history
        </span>
        <span className="font-mono-ui text-[10px] text-[#776a85]" data-testid="text-session-count">{durableThreads.length.toString().padStart(2, '0')}</span>
      </div>

      <div className="scrollbar-thin mt-4 flex-1 overflow-y-auto px-3 pb-5">
        {durableThreads.length === 0 ? (
          <div className="mx-2 mt-5 rounded-xl border border-dashed border-[#544462] px-4 py-5 text-center" data-testid="empty-history">
            <div className="mx-auto mb-3 flex size-8 items-center justify-center rounded-full bg-[#453954] text-[#f3ca62]"><Sparkles size={15} /></div>
            <p className="text-xs leading-5 text-[#b9afc3]">Your thinking will collect here.</p>
          </div>
        ) : (
          Object.entries(groups).map(([group, groupThreads]) => (
            <div className="mb-5" key={group}>
              <div className="px-3 pb-2 pt-1 font-mono-ui text-[9px] uppercase tracking-[0.2em] text-[#776a85]">{group}</div>
              <div className="space-y-1">
                {groupThreads.map((thread) => (
                  <button
                    key={thread.id}
                    className={`group flex w-full items-start gap-3 rounded-[11px] px-3 py-3 text-left transition-colors ${thread.id === activeThreadId ? 'bg-[#453954] text-[#fff8ea]' : 'text-[#b9afc3] hover:bg-[#392b47] hover:text-[#fff8ea]'}`}
                    onClick={() => onSelectThread(thread)}
                    data-testid={`button-select-thread-${thread.id}`}
                  >
                    <span className={`mt-0.5 shrink-0 ${thread.id === activeThreadId ? 'text-[#f65d3d]' : 'text-[#897e94]'}`}><ModeGlyph mode={thread.mode} size={15} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium">{thread.title}</span>
                      <span className="mt-1 block font-mono-ui text-[9px] uppercase tracking-[0.08em] text-[#776a85]">{thread.mode} · {formatTime(thread.updatedAt)}</span>
                    </span>
                    {thread.id === activeThreadId ? <span className="mt-1 size-1.5 shrink-0 rounded-full bg-[#f65d3d]" /> : null}
                  </button>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="border-t border-[#453954] px-6 py-5">
        <div className="flex items-center gap-3">
          <div className="flex size-8 items-center justify-center rounded-full bg-[#f3ca62] font-display text-sm text-[#2d2039]">A</div>
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-[#fff8ea]">Alex’s desk</p>
            <p className="font-mono-ui text-[9px] uppercase tracking-[0.14em] text-[#897e94]">Local workspace</p>
          </div>
          <MoreHorizontal size={16} className="ml-auto text-[#897e94]" />
        </div>
      </div>
    </aside>
  );
}

function MessageCard({ message }: { message: StudioMessage }) {
  const isUser = message.role === 'user';

  if (isUser) {
    return (
      <div className="animate-rise-in flex justify-end" data-testid={`message-user-${message.id}`}>
        <div className="max-w-[min(680px,88%)]">
          <div className="mb-2 flex items-center justify-end gap-2 font-mono-ui text-[9px] uppercase tracking-[0.12em] text-[#9d8e8d]">
            You <span className="size-1 rounded-full bg-[#f65d3d]" /> {formatTime(message.createdAt)}
          </div>
          <div className="rounded-[18px] rounded-tr-[5px] bg-[#f65d3d] px-5 py-4 text-[15px] leading-7 text-[#2d2039] shadow-[0_5px_0_#dfb8a6]">{message.content}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-rise-in flex gap-4" data-testid={`message-assistant-${message.id}`}>
      <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-[#2d2039] text-[#f3ca62] shadow-[0_3px_0_#b9afc3]"><Sparkles size={15} /></div>
      <div className="min-w-0 max-w-[720px] flex-1">
        <div className="mb-2 flex items-center gap-2 font-mono-ui text-[9px] uppercase tracking-[0.12em] text-[#9d8e8d]">
          Lumen <span className="size-1 rounded-full bg-[#f3ca62]" /> {formatTime(message.createdAt)}
        </div>
        <div className="prose prose-sm max-w-none text-[15px] leading-7 text-[#403649]">
          {message.content.split('\n').map((line, index) => <p key={`${message.id}-${index}`} className={index === 0 ? 'mt-0' : ''}>{line || '\u00a0'}</p>)}
        </div>
        {message.thought ? (
          <details className="mt-4 rounded-xl border border-[#ddd1c5] bg-[#f6f0e7] px-3 py-2" data-testid={`details-thought-${message.id}`}>
            <summary className="cursor-pointer list-none text-[11px] font-semibold text-[#806f69]">View working notes</summary>
            <p className="mt-2 border-t border-[#e5dace] pt-2 text-xs leading-5 text-[#806f69]">{message.thought}</p>
          </details>
        ) : null}
      </div>
    </div>
  );
}

function LoadingMessage() {
  return (
    <div className="flex gap-4" data-testid="status-response-loading">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-[#2d2039] text-[#f3ca62]"><Sparkles size={15} className="animate-pulse-dot" /></div>
      <div className="pt-1">
        <div className="mb-3 font-mono-ui text-[9px] uppercase tracking-[0.12em] text-[#9d8e8d]">Lumen is thinking</div>
        <div className="space-y-2">
          <div className="skeleton h-3 w-64 rounded-full" />
          <div className="skeleton h-3 w-44 rounded-full" />
        </div>
      </div>
    </div>
  );
}

export default function LumenWorkspace() {
  const [threads, setThreads] = useState<StudioThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState('');
  const [mode, setMode] = useState<StudioMode>('chat');
  const [composer, setComposer] = useState('');
  const [error, setError] = useState('');
  const [lastFailedPrompt, setLastFailedPrompt] = useState('');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(1600);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [threadsHydrated, setThreadsHydrated] = useState(false);
  const { signOut } = useClerk();
  const { user } = useUser();

  const health = useHealthCheck({ query: { queryKey: getHealthCheckQueryKey(), refetchInterval: 30000 } });
  const chatMutation = useCompleteChat();
  const buildMutation = useBuildProject();
  const currentUser = useGetCurrentUser({ query: { queryKey: getGetCurrentUserQueryKey() } });
  const projectsQuery = useListProjects({ query: { queryKey: getListProjectsQueryKey() } });
  const threadsQuery = useListThreads({ query: { queryKey: getListThreadsQueryKey() } });
  const { mutate: saveThread } = useSyncThread();
  const { mutate: removeThread } = useDeleteThread();
  const queryClient = useQueryClient();
  const projects = projectsQuery.data ?? [];
  const isBusy = chatMutation.isPending || buildMutation.isPending;

  useEffect(() => {
    if (threadsQuery.data === undefined && !threadsQuery.isError) return;
    const restored = threadsQuery.data ?? [];
    const initial = restored[0] ?? createThread('chat');
    setThreads(restored.length > 0 ? restored : [initial]);
    setActiveThreadId(initial.id);
    setMode(initial.mode);
    setThreadsHydrated(true);
  }, [threadsQuery.data, threadsQuery.isError]);

  useEffect(() => {
    if (!threadsHydrated) return;
    const timers = threads
      .filter((thread) => thread.messages.length > 0)
      .map((thread) => window.setTimeout(() => {
        saveThread({
          id: thread.id,
          data: {
            mode: thread.mode,
            title: thread.title,
            createdAt: thread.createdAt,
            messages: thread.messages.map((message) => ({
              ...message,
              thought: message.thought ?? null,
            })),
          },
        });
      }, 350));
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [threads, threadsHydrated, saveThread]);

  useEffect(() => {
    if (!selectedProjectId && projects[0]) setSelectedProjectId(projects[0].id);
  }, [projects, selectedProjectId]);

  const activeThread = useMemo(
    () => threads.find((thread) => thread.id === activeThreadId) ?? threads[0],
    [activeThreadId, threads],
  );

  const threadMessages = activeThread?.messages ?? [];

  function updateThread(threadId: string, updater: (thread: StudioThread) => StudioThread) {
    setThreads((current) => current.map((thread) => thread.id === threadId ? updater(thread) : thread));
  }

  function startNewThread(nextMode: StudioMode = mode) {
    const next = createThread(nextMode);
    setThreads((current) => [...current.filter((thread) => thread.messages.length > 0), next]);
    setActiveThreadId(next.id);
    setMode(nextMode);
    setComposer('');
    setError('');
    setLastFailedPrompt('');
    setMobileSidebarOpen(false);
  }

  function selectThread(thread: StudioThread) {
    setActiveThreadId(thread.id);
    setMode(thread.mode);
    setComposer('');
    setError('');
    setLastFailedPrompt('');
    setMobileSidebarOpen(false);
  }

  function switchMode(nextMode: StudioMode) {
    if (nextMode !== mode) startNewThread(nextMode);
  }

  function sendPrompt(prompt: string, isRetry = false) {
    const cleanPrompt = prompt.trim();
    if (!activeThread || isBusy || (!cleanPrompt && !isRetry)) return;

    const now = new Date().toISOString();
    const userMessage: StudioMessage = {
      id: `message-${Date.now()}`,
      role: 'user',
      content: cleanPrompt,
      createdAt: now,
    };
    const nextMessages = isRetry
      ? activeThread.messages
      : [...activeThread.messages, userMessage];
    const apiMessages: ChatMessage[] = nextMessages.map((message) => ({
      role: message.role,
      content: message.content,
    }));

    if (!isRetry) {
      updateThread(activeThread.id, (thread) => ({
        ...thread,
        title: thread.messages.length === 0 ? cleanPrompt.slice(0, 46) || thread.title : thread.title,
        messages: nextMessages,
        updatedAt: now,
      }));
    }
    setComposer('');
    setError('');
    setLastFailedPrompt('');

    if (mode === 'build') {
      buildMutation.mutate(
        {
          data: {
            name: cleanPrompt.slice(0, 56) || 'Untitled build',
            prompt: cleanPrompt || activeThread.messages.at(-1)?.content || '',
          },
        },
        {
          onSuccess: (project) => {
            setSelectedProjectId(project.id);
            updateThread(activeThread.id, (thread) => ({
              ...thread,
              messages: [
                ...thread.messages,
                {
                  id: `message-${Date.now()}-assistant`,
                  role: 'assistant',
                  content: `Built ${project.name}. ${project.buildLog ?? 'The project workspace is ready.'}`,
                  createdAt: new Date().toISOString(),
                },
              ],
              updatedAt: new Date().toISOString(),
            }));
            queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
            queryClient.invalidateQueries({ queryKey: getGetCurrentUserQueryKey() });
          },
          onError: (buildError) => {
            setError(getErrorMessage(buildError));
            setLastFailedPrompt(isRetry ? activeThread.messages.at(-1)?.content ?? '' : cleanPrompt);
          },
        },
      );
      return;
    }

    chatMutation.mutate({
      data: {
        messages: apiMessages,
        temperature,
        maxTokens,
      },
    }, {
      onSuccess: (result) => {
        if (!result.ok || !result.text) {
          const responseError = result.error || 'Lumen returned an empty response. Try refining the prompt.';
          setError(responseError);
          setLastFailedPrompt(isRetry ? activeThread.messages.at(-1)?.content ?? '' : cleanPrompt);
          return;
        }
        const assistantMessage: StudioMessage = {
          id: `message-${Date.now()}-assistant`,
          role: 'assistant',
          content: result.text,
          thought: result.thought,
          createdAt: new Date().toISOString(),
        };
        updateThread(activeThread.id, (thread) => ({
          ...thread,
          messages: [...thread.messages, assistantMessage],
          updatedAt: assistantMessage.createdAt,
        }));
      },
      onError: (mutationError) => {
        setError(getErrorMessage(mutationError));
        setLastFailedPrompt(isRetry ? activeThread.messages.at(-1)?.content ?? '' : cleanPrompt);
      },
    });
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendPrompt(composer);
    }
  }

  function clearThread() {
    if (!activeThread) return;
    if (activeThread.messages.length > 0) removeThread({ id: activeThread.id });
    const replacement = createThread(mode);
    setThreads((current) => [...current.filter((thread) => thread.id !== activeThread.id && thread.messages.length > 0), replacement]);
    setActiveThreadId(replacement.id);
    setComposer('');
    setError('');
    setLastFailedPrompt('');
  }

  const isConnected = !health.isLoading && !health.isError && health.data?.status !== 'error';
  const modeName = mode === 'build' ? 'Build' : 'Chat';
  const emptyIntro = mode === 'build'
    ? { eyebrow: 'Build session', heading: 'Give an idea a shape.', copy: 'Turn a loose thought into a plan, a prototype, or a clean first draft.' }
    : { eyebrow: 'Open conversation', heading: 'What are we making room for?', copy: 'A clear question, a half-formed thought, or the thing you cannot quite name yet.' };

  return (
    <div className="grain flex min-h-[100dvh] bg-[#f5f0e7] text-[#2d2039]" data-testid="lumen-studio">
      {mobileSidebarOpen ? <button className="fixed inset-0 z-30 bg-[#2d2039]/45 lg:hidden" onClick={() => setMobileSidebarOpen(false)} aria-label="Close navigation" data-testid="button-close-sidebar-overlay" /> : null}
      <div className={mobileSidebarOpen ? '[&>aside]:translate-x-0' : ''}>
        <Sidebar threads={threads} activeThreadId={activeThreadId} onSelectThread={selectThread} onNewThread={() => startNewThread()} onClose={() => setMobileSidebarOpen(false)} />
      </div>

      <main className="studio-grid flex min-w-0 flex-1 flex-col bg-[#f5f0e7]">
        <header className="flex h-[76px] shrink-0 items-center justify-between border-b border-[#dfd5c9] px-5 sm:px-8 lg:px-11" data-testid="header-studio">
          <div className="flex items-center gap-3">
            <button className="icon-button lg:hidden" onClick={() => setMobileSidebarOpen(true)} aria-label="Open history" data-testid="button-open-history"><Menu size={20} /></button>
            <div className="flex items-center gap-2 font-mono-ui text-[10px] uppercase tracking-[0.17em] text-[#9d8e8d]">
              <span className="hidden sm:inline">Lumen /</span>
              <span className="text-[#403649]" data-testid="text-current-mode">{modeName}</span>
            </div>
            <span className="hidden size-1 rounded-full bg-[#f65d3d] sm:block" />
            <span className="hidden text-xs text-[#9d8e8d] sm:inline" data-testid="text-current-thread">{activeThread?.title ?? 'New session'}</span>
          </div>
          <div className="flex items-center gap-3">
            <div className={`hidden items-center gap-2 rounded-full border px-3 py-1.5 font-mono-ui text-[9px] uppercase tracking-[0.12em] sm:flex ${isConnected ? 'border-[#c7d9ca] bg-[#edf5ec] text-[#587060]' : 'border-[#ebc4b9] bg-[#fff0eb] text-[#b14b37]'}`} data-testid="status-connection">
              <span className={`size-1.5 rounded-full ${isConnected ? 'bg-[#5e9b71]' : 'bg-[#d5533b]'}`} />
              {health.isLoading ? 'Connecting' : isConnected ? 'Studio online' : 'Offline'}
            </div>
            <button className="icon-button" onClick={() => setSettingsOpen((open) => !open)} aria-label="Open session settings" data-testid="button-session-settings"><Settings2 size={18} /></button>
            <div className="flex size-8 items-center justify-center rounded-full bg-[#f3ca62] font-display text-sm text-[#2d2039]" data-testid="avatar-user">{user?.firstName?.slice(0, 1) ?? 'A'}</div>
          </div>
          {settingsOpen ? (
            <div className="absolute right-5 top-[64px] z-20 w-[280px] rounded-2xl border border-[#dfd5c9] bg-[#fffaf2] p-4 shadow-[0_16px_45px_rgba(45,32,57,0.14)] sm:right-8" data-testid="panel-session-settings">
              <div className="mb-4 flex items-center justify-between">
                <div><p className="text-sm font-bold text-[#403649]">Session controls</p><p className="mt-0.5 text-[11px] text-[#9d8e8d]">A little room to tune the output.</p></div>
                <button className="icon-button small" onClick={() => setSettingsOpen(false)} aria-label="Close session settings" data-testid="button-close-settings"><X size={15} /></button>
              </div>
              <div className="mb-4 rounded-lg border border-[#dfd5c9] bg-[#f5f0e7] px-3 py-2 font-mono-ui text-[9px] uppercase tracking-[0.08em] text-[#806f69]" data-testid="text-workspace-isolation">
                <div className="flex justify-between gap-3"><span>Workspace</span><span className="truncate text-[#f65d3d]">{currentUser.data?.workspaceId ?? 'loading'}</span></div>
                <div className="mt-1 flex justify-between"><span>Runtime</span><span>Managed sandbox</span></div>
              </div>
              <label className="block text-[11px] font-semibold text-[#5d4e63]" htmlFor="temperature-control">
                Temperature <span className="float-right font-mono-ui text-[10px] text-[#f65d3d]">{temperature.toFixed(1)}</span>
              </label>
              <input id="temperature-control" className="mt-2 w-full accent-[#f65d3d]" type="range" min="0" max="1.2" step="0.1" value={temperature} onChange={(event) => setTemperature(Number(event.target.value))} data-testid="input-temperature" />
              <label className="mt-4 block text-[11px] font-semibold text-[#5d4e63]" htmlFor="tokens-control">
                Max tokens <span className="float-right font-mono-ui text-[10px] text-[#f65d3d]">{maxTokens}</span>
              </label>
              <input id="tokens-control" className="mt-2 w-full accent-[#f65d3d]" type="range" min="256" max="4000" step="128" value={maxTokens} onChange={(event) => setMaxTokens(Number(event.target.value))} data-testid="input-max-tokens" />
              <a href={`${import.meta.env.BASE_URL || '/' }account`} className="mt-5 block w-full rounded-lg border border-[#dfd5c9] px-3 py-2 text-left text-[11px] font-semibold text-[#806f69] transition-colors hover:border-[#f65d3d] hover:text-[#b94231]" data-testid="link-account-settings">Account settings</a>
              <button type="button" className="mt-2 w-full rounded-lg border border-[#dfd5c9] px-3 py-2 text-left text-[11px] font-semibold text-[#806f69] transition-colors hover:border-[#f65d3d] hover:text-[#b94231]" onClick={() => signOut({ redirectUrl: import.meta.env.BASE_URL || '/' })} data-testid="button-sign-out">Sign out</button>
            </div>
          ) : null}
        </header>

        <div className="flex min-h-0 flex-1 flex-col">
          {threadMessages.length === 0 ? (
            <section className="flex flex-1 flex-col justify-center px-5 pb-12 pt-10 sm:px-10 lg:px-20" data-testid="empty-workspace">
              <div className="mx-auto w-full max-w-[860px]">
                <div className="mb-6 flex items-center gap-3 font-mono-ui text-[10px] uppercase tracking-[0.2em] text-[#f65d3d]"><span className="size-2 rounded-full bg-[#f65d3d]" /> {emptyIntro.eyebrow}</div>
                <h1 className="max-w-[760px] font-display text-[clamp(3.4rem,7vw,6.7rem)] leading-[0.9] tracking-[-0.045em] text-[#2d2039]" data-testid="text-empty-heading">{emptyIntro.heading}</h1>
                <div className="mt-8 flex max-w-[620px] items-start gap-3 border-l-2 border-[#f3ca62] pl-4 text-[15px] leading-6 text-[#806f69]"><Zap size={17} className="mt-1 shrink-0 text-[#d59e25]" /> <p>{emptyIntro.copy}</p></div>

                {mode === 'build' ? (
                  <div className="mt-10 grid max-w-[650px] gap-2 sm:grid-cols-3">
                    {['Frame the problem', 'Find the first move', 'Make it tangible'].map((item, index) => (
                      <div className="rounded-xl border border-[#dfd5c9] bg-[#fffaf2]/70 p-3" key={item} data-testid={`build-stage-${index}`}>
                        <div className="mb-3 flex size-6 items-center justify-center rounded-full bg-[#e9dfd2] font-mono-ui text-[10px] text-[#806f69]">{String(index + 1).padStart(2, '0')}</div>
                        <p className="text-xs font-semibold text-[#5d4e63]">{item}</p>
                      </div>
                    ))}
                  </div>
                ) : null}

                <div className="mt-12 flex flex-wrap gap-2" data-testid="prompt-suggestions">
                  {(mode === 'build'
                    ? ['Turn this rough idea into a one-page plan', 'Help me choose a strong starting point', 'Draft the first version with me']
                    : ['Help me see this from a different angle', 'Make a messy thought more precise', 'Give me the short version']).map((suggestion) => (
                    <button className="suggestion-chip" key={suggestion} onClick={() => setComposer(suggestion)} data-testid={`button-suggestion-${suggestion.slice(0, 10).replaceAll(' ', '-').toLowerCase()}`}>{suggestion} <ChevronDown size={13} className="-rotate-90" /></button>
                  ))}
                </div>
              </div>
            </section>
          ) : (
            <section className="flex-1 overflow-y-auto px-5 py-8 sm:px-10 lg:px-20" data-testid="message-list">
              <div className="mx-auto flex w-full max-w-[860px] flex-col gap-9">
                <div className="mb-2 flex items-center gap-3 border-b border-[#dfd5c9] pb-4">
                  <span className="flex size-7 items-center justify-center rounded-lg bg-[#e9dfd2] text-[#806f69]"><ModeGlyph mode={mode} size={14} /></span>
                  <span className="font-mono-ui text-[10px] uppercase tracking-[0.18em] text-[#9d8e8d]">{mode} session</span>
                  <span className="ml-auto font-mono-ui text-[9px] uppercase tracking-[0.12em] text-[#b2a3a0]">{threadMessages.length} {threadMessages.length === 1 ? 'exchange' : 'messages'}</span>
                </div>
                {threadMessages.map((message) => <MessageCard key={message.id} message={message} />)}
                {isBusy ? <LoadingMessage /> : null}
                {error ? (
                  <div className="rounded-2xl border border-[#e8b9ac] bg-[#fff0eb] p-4" data-testid="status-response-error">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-[#f6cfc5] text-[#b14b37]"><Wifi size={14} /></div>
                      <div className="min-w-0 flex-1"><p className="text-sm font-semibold text-[#883f31]">A small snag in the studio</p><p className="mt-1 text-xs leading-5 text-[#a55a4a]">{error}</p></div>
                      {lastFailedPrompt ? <button className="button-quiet shrink-0" onClick={() => sendPrompt(lastFailedPrompt, true)} disabled={chatMutation.isPending} data-testid="button-retry-response"><RotateCcw size={13} /> Retry</button> : null}
                    </div>
                  </div>
                ) : null}
              </div>
            </section>
          )}

          <div className="shrink-0 px-5 pb-5 pt-3 sm:px-10 sm:pb-7 lg:px-20">
            <div className="mx-auto w-full max-w-[860px]">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="mode-switch" data-testid="control-mode-switch">
                    <button className={mode === 'chat' ? 'mode-switch-active' : ''} onClick={() => switchMode('chat')} data-testid="button-mode-chat"><MessageCircle size={13} /> Chat</button>
                    <button className={mode === 'build' ? 'mode-switch-active' : ''} onClick={() => switchMode('build')} data-testid="button-mode-build"><Layers3 size={13} /> Build</button>
                  </div>
                  <span className="hidden items-center gap-1.5 font-mono-ui text-[9px] uppercase tracking-[0.12em] text-[#b2a3a0] sm:flex"><BookOpen size={12} /> {mode === 'build' ? 'structured session' : 'quick thinking'}</span>
                </div>
                {threadMessages.length > 0 ? <button className="button-quiet hidden sm:flex" onClick={clearThread} data-testid="button-clear-thread"><Trash2 size={13} /> Clear thread</button> : null}
              </div>
              <div className={`composer-shell ${isBusy ? 'composer-shell-pending' : ''}`}>
                <textarea
                  value={composer}
                  onChange={(event) => setComposer(event.target.value)}
                  onKeyDown={handleComposerKeyDown}
                  placeholder={mode === 'build' ? 'Describe what you want to make...' : 'Ask Lumen anything...'}
                  rows={3}
                  disabled={isBusy}
                  data-testid="input-prompt"
                />
                <div className="flex items-center justify-between gap-3 px-3 pb-3">
                  <div className="flex items-center gap-2 font-mono-ui text-[9px] uppercase tracking-[0.12em] text-[#b2a3a0]"><Command size={12} /> <span className="hidden sm:inline">Enter to send</span><span className="sm:hidden">Send</span></div>
                  <button className="send-button" onClick={() => sendPrompt(composer)} disabled={!composer.trim() || isBusy} aria-label="Send prompt" data-testid="button-send-prompt">
                    {isBusy ? <span className="size-3 animate-pulse-dot rounded-full bg-[#2d2039]" /> : <ArrowUp size={17} strokeWidth={2.5} />}
                  </button>
                </div>
              </div>
              <p className="mt-3 text-center text-[10px] text-[#b2a3a0]" data-testid="text-privacy-note">Chat history stays on this device. Build workspaces are scoped to your account.</p>
            </div>
          </div>
          {mode === 'build' ? (
            <div className="shrink-0 px-5 pb-4 sm:px-10 lg:px-20">
              <BuildConsole
                projects={projects}
                selectedProjectId={selectedProjectId}
                creditsRemaining={currentUser.data?.buildCreditsRemaining}
                onSelectProject={setSelectedProjectId}
              />
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
}