import type { Metadata, Viewport } from "next";
import Link from "next/link";
import Image from "next/image";
import { Outfit, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { NavLinks } from "@/components/NavLinks";
import { HelpButton } from "@/components/HelpButton";
import { ThemeToggle } from "@/components/ThemeToggle";

/*
 * Applies the stored theme before the first paint. Anything later -- an
 * effect, a layout pass -- flashes the wrong theme on every page load, so
 * this has to be an inline script in the document head.
 */
// Dark is the recommended default in the palette document, so the system
// preference is not consulted -- only a choice this person has made here.
const THEME_SCRIPT = `try{var t=localStorage.getItem('marsworks-theme');document.documentElement.dataset.theme=(t==='light'||t==='dark')?t:'dark'}catch(e){document.documentElement.dataset.theme='dark'}`;

// Outfit has more character than a system stack without being decorative, and
// its tighter geometric shapes suit the wordmark. JetBrains Mono carries the
// task keys and the figures in dense tables.
const outfit = Outfit({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-outfit",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono-brand",
  display: "swap",
});

export const metadata: Metadata = {
  title: "MarsWorks Mission Control",
  description:
    "One view of every MarsWorks sub-team: board, timeline, and what a delay in one team does to the others.",
};

// themeColor belongs to the viewport export, not metadata; Next warns on
// every route otherwise. Matches --color-ground so mobile browser chrome
// blends with the page.
export const viewport: Viewport = {
  themeColor: "#0a0d14",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      data-theme="dark"
      suppressHydrationWarning
      className={`${outfit.variable} ${mono.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-dvh bg-canvas text-ink">
        <a
          href="#content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:rounded-md focus:bg-accent focus:px-3 focus:py-1.5 focus:text-sm focus:font-medium focus:text-canvas"
        >
          Skip to content
        </a>

        <header className="sticky top-0 z-40 border-b border-line bg-canvas/85 backdrop-blur">
          <div className="flex h-14 items-center gap-3 px-4 sm:gap-5 sm:px-6">
            <Link
              href="/"
              className="flex shrink-0 items-center gap-2.5 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <Image
                src="/marsworks-logo.png"
                alt="MarsWorks, University of Sheffield"
                width={28}
                height={28}
                priority
                className="h-7 w-7"
              />
              <span
                className="text-sm font-semibold tracking-tight"
                translate="no"
              >
                MarsWorks
                {/* The subtitle costs more than it earns on a phone, where it
                    pushes the nav links off screen. */}
                <span className="ml-1.5 hidden font-normal text-ink-3 sm:inline">
                  Mission Control
                </span>
              </span>
            </Link>
            <NavLinks />
            <div className="ml-auto flex shrink-0 items-center gap-2">
              <ThemeToggle />
              <HelpButton />
            </div>
          </div>
        </header>

        <main id="content" className="relative z-0">
          {children}
        </main>
      </body>
    </html>
  );
}
