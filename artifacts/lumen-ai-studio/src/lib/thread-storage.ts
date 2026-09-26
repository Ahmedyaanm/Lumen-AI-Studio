export type StudioMode = 'chat' | 'build';

export type StudioMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
  thought?: string | null;
};

export type StudioThread = {
  id: string;
  mode: StudioMode;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: StudioMessage[];
};

const STORAGE_KEY = 'lumen-ai-studio.threads';

export function readThreads(): StudioThread[] {
  if (typeof window === 'undefined') return [];

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored) as StudioThread[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((thread) => thread?.id && Array.isArray(thread.messages));
  } catch {
    return [];
  }
}

export function writeThreads(threads: StudioThread[]) {
  if (typeof window === 'undefined') return;

  try {
    const durableThreads = threads.filter((thread) => thread.messages.length > 0);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(durableThreads));
  } catch {
    // Persistence is a convenience; the workspace remains usable if storage is unavailable.
  }
}

export function createThread(mode: StudioMode): StudioThread {
  const now = new Date().toISOString();
  return {
    id: `thread-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    mode,
    title: mode === 'build' ? 'Untitled build' : 'Untitled conversation',
    createdAt: now,
    updatedAt: now,
    messages: [],
  };
}