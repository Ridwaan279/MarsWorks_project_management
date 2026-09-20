import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { NavLinks } from "@/components/NavLinks";

export const metadata: Metadata = {
  title: "MarsWorks Mission Control",
  description:
    "One view of every MarsWorks sub-team: board, timeline, and what a delay in one team does to the others.",
  // Matches --color-ground so mobile browser chrome blends with the page.
  themeColor: "#0a0d14",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-ground text-ink">
        <header className="sticky top-0 z-40 border-b border-edge bg-ground/85 backdrop-blur">
          <div className="flex h-14 items-center gap-3 px-4 sm:gap-6 sm:px-6">
            <Link href="/" className="flex shrink-0 items-center gap-2.5">
              <span
                aria-hidden
                className="grid h-7 w-7 place-items-center rounded-md bg-mars/15 text-mars"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
                  <circle cx="12" cy="12" r="8" opacity="0.35" />
                  <path d="M12 4a8 8 0 0 1 0 16 5 5 0 0 0 0-16Z" />
                </svg>
              </span>
              <span className="text-sm font-semibold tracking-tight" translate="no">
                MarsWorks
                {/* The subtitle costs more than it earns on a phone, where it
                    pushes the nav links off screen. */}
                <span className="ml-1.5 hidden font-normal text-ink-faint sm:inline">
                  Mission Control
                </span>
              </span>
            </Link>
            <NavLinks />
          </div>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
