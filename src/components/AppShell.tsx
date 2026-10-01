"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { onboardingStore } from "@/lib/learnerStores";
import { listenForInstall } from "@/lib/install";
import { registerServiceWorker } from "@/lib/offline";
import { usePreferences } from "./Preferences";
import { useHydrated } from "./useSongs";

/** Pages reachable before onboarding: the welcome flow, team tools and artist pages. */
const OPEN_PATHS = ["/welcome", "/studio", "/stats", "/artists", "/family"];

type NavKey = "catalog" | "player" | "words" | "practice" | "rooms";

const NAV: { key: NavKey; href: string; icon: ReactNode }[] = [
  {
    key: "catalog",
    href: "/",
    icon: <path d="M4 5h16M4 12h16M4 19h10" />,
  },
  {
    key: "player",
    href: "/player",
    icon: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M10 8.5v7l6-3.5z" />
      </>
    ),
  },
  {
    key: "words",
    href: "/words",
    icon: <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />,
  },
  {
    key: "practice",
    href: "/practice",
    icon: (
      <>
        <rect x="4" y="6" width="12" height="14" rx="2" />
        <path d="M8 3h10a2 2 0 0 1 2 2v12" />
      </>
    ),
  },
  {
    key: "rooms",
    href: "/rooms",
    icon: <path d="M4 5h16v11H9l-5 4z" />,
  },
];

function subscribeOnline(notify: () => void) {
  window.addEventListener("online", notify);
  window.addEventListener("offline", notify);
  return () => {
    window.removeEventListener("online", notify);
    window.removeEventListener("offline", notify);
  };
}

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = usePreferences();
  const onboarding = onboardingStore.useValue();
  const hydrated = useHydrated();
  const open = OPEN_PATHS.some((path) => pathname.startsWith(path));
  const online = useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );

  useEffect(() => {
    registerServiceWorker();
    listenForInstall();
  }, []);

  // First visit: send new learners through onboarding.
  useEffect(() => {
    if (hydrated && !onboarding.done && !open) router.replace("/welcome");
  }, [hydrated, onboarding.done, open, router]);

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col">
      <header className="flex items-center justify-between px-4 pt-4 pb-2">
        <Link href="/" className="text-2xl font-bold tracking-tight text-accent">
          Verso
        </Link>
        <Link
          href="/settings"
          aria-label={t.settings}
          className="rounded-full p-2 text-muted hover:bg-accent-soft hover:text-text"
        >
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="12" cy="12" r="3" />
            <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1" />
          </svg>
        </Link>
      </header>

      {!online && (
        <p role="status" className="mx-4 rounded-xl bg-amber-300/30 px-3 py-2 text-sm font-medium">
          📴 {t.offline.youAreOffline}
        </p>
      )}
      <main className="flex-1 px-4 pb-28">{children}</main>

      {pathname !== "/welcome" && <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
      >
        <ul className="mx-auto grid max-w-2xl grid-cols-5">
          {NAV.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <li key={item.key}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium ${
                    active ? "text-accent" : "text-muted hover:text-text"
                  }`}
                >
                  <svg
                    viewBox="0 0 24 24"
                    width="24"
                    height="24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    {item.icon}
                  </svg>
                  <span className="max-w-full truncate px-1">{t.nav[item.key]}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>}
    </div>
  );
}
