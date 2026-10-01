import { useSyncExternalStore } from "react";

// "Install Verso" (step 31). Chrome and Android offer an install prompt event,
// which is kept until the learner taps Install; iPhone shows instructions.

type InstallPromptEvent = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
type InstallState = { canPrompt: boolean; installed: boolean; ios: boolean };

let deferred: InstallPromptEvent | null = null;
let state: InstallState = { canPrompt: false, installed: false, ios: false };
const listeners = new Set<() => void>();
const SERVER_STATE: InstallState = { canPrompt: false, installed: false, ios: false };

function update(patch: Partial<InstallState>) {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
}

/** Call once at startup: the browser fires its install event early. */
export function listenForInstall() {
  const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
  update({ installed: standalone, ios: /iphone|ipad|ipod/i.test(navigator.userAgent) });
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferred = event as InstallPromptEvent;
    update({ canPrompt: true });
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    update({ canPrompt: false, installed: true });
  });
}

export async function promptInstall() {
  if (!deferred) return;
  await deferred.prompt();
  const { outcome } = await deferred.userChoice;
  deferred = null;
  update({ canPrompt: false, installed: outcome === "accepted" || state.installed });
}

export function useInstall(): InstallState {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    () => state,
    () => SERVER_STATE,
  );
}
