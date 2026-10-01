import { sessionIsFresh, type EventName } from "./analytics";

// Sends anonymous analytics events in small batches. Safe to call anywhere on
// the client; does nothing during server rendering or if storage is blocked.

const ANON_KEY = "verso.anonId";
const SESSION_KEY = "verso.session";

type Session = { id: string; lastActivity: number };
type Queued = { anonId: string; sessionId: string; name: EventName; props?: Record<string, string | number | boolean> };

let queue: Queued[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage blocked: ids live for this page only
  }
}

function anonId(): string {
  const existing = read<string>(ANON_KEY);
  if (existing) return existing;
  const id = crypto.randomUUID();
  write(ANON_KEY, id);
  return id;
}

/** The current session id, starting a new session after 30 idle minutes. */
function currentSession(now: number): { id: string; isNew: boolean } {
  const session = read<Session>(SESSION_KEY);
  const fresh = session && sessionIsFresh(session.lastActivity, now);
  const id = fresh ? session.id : crypto.randomUUID();
  write(SESSION_KEY, { id, lastActivity: now });
  return { id, isNew: !fresh };
}

function flush() {
  timer = null;
  if (queue.length === 0) return;
  const batch = queue.slice(0, 25);
  queue = queue.slice(25);
  const body = JSON.stringify(batch);
  const sent = navigator.sendBeacon?.("/api/events", new Blob([body], { type: "application/json" }));
  if (!sent) void fetch("/api/events", { method: "POST", body, keepalive: true, headers: { "content-type": "application/json" } }).catch(() => {});
  if (queue.length) timer = setTimeout(flush, 0);
}

export function track(name: EventName, props?: Queued["props"]) {
  if (typeof window === "undefined") return;
  try {
    const id = anonId();
    const session = currentSession(Date.now());
    if (session.isNew && name !== "session_start") queue.push({ anonId: id, sessionId: session.id, name: "session_start" });
    queue.push({ anonId: id, sessionId: session.id, name, props });
    timer ??= setTimeout(flush, 2000);
  } catch {
    // analytics must never break the app
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", flush);
}
