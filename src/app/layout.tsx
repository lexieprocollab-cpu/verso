import type { Metadata, Viewport } from "next";
import { AppShell } from "@/components/AppShell";
import { PreferencesProvider, preferencesBootScript } from "@/components/Preferences";
import "./globals.css";

export const metadata: Metadata = {
  title: "Verso",
  description: "Learn languages through the songs you love",
  applicationName: "Verso",
  appleWebApp: { capable: true, title: "Verso", statusBarStyle: "default" },
  icons: { apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbf8f4" },
    { media: "(prefers-color-scheme: dark)", color: "#121118" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: preferencesBootScript }} />
      </head>
      <body>
        <PreferencesProvider>
          <AppShell>{children}</AppShell>
        </PreferencesProvider>
      </body>
    </html>
  );
}
