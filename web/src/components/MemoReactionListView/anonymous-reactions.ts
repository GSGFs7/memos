// These markers prevent accidental repeats; they do not identify a visitor to the server.
const PREFIX = "memos:anonymous-reaction:";
const confirmed = new Set<string>();
const pending = new Set<string>();
const listeners = new Set<() => void>();
let revision = 0;

const keyFor = (memoName: string, reactionType: string) => `${PREFIX}${memoName}:${encodeURIComponent(reactionType)}`;
const notify = () => {
  revision++;
  for (const listener of listeners) listener();
};

export const subscribeAnonymousReactions = (listener: () => void) => {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key.startsWith(PREFIX)) notify();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
};
export const anonymousReactionRevision = () => revision;

export const hasAnonymousReaction = (memoName: string, reactionType: string) => {
  const key = keyFor(memoName, reactionType);
  if (confirmed.has(key)) return true;
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
};

export const startAnonymousReaction = (memoName: string, reactionType: string) => {
  const key = keyFor(memoName, reactionType);
  if (pending.has(key) || hasAnonymousReaction(memoName, reactionType)) return false;
  pending.add(key);
  return true;
};

export const finishAnonymousReaction = (memoName: string, reactionType: string, success: boolean) => {
  const key = keyFor(memoName, reactionType);
  pending.delete(key);
  if (success) {
    confirmed.add(key);
    try {
      localStorage.setItem(key, "1");
    } catch {
      // Keep the marker in memory when browser storage is unavailable.
    }
  }
  notify();
};
