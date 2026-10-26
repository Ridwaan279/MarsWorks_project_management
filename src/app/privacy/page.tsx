import type { Metadata } from "next";
import Link from "next/link";
import { FLOW_MINUTES } from "@/lib/auth/flow";
import { SESSION_DAYS } from "@/lib/auth/config";

export const metadata: Metadata = {
  title: "Privacy policy | MarsWorks Mission Control",
  description: "How MarsWorks Mission Control uses member information, Google sign-in and project data, and how to request deletion.",
};

export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-3xl space-y-8 px-4 py-10 text-sm leading-relaxed text-ink-2 sm:px-6">
      <header className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">Privacy policy</h1>
        <p>Last updated: <time dateTime="2026-10-26">26 October 2026</time></p>
        <p>
          MarsWorks Mission Control is a project management app for MarsWorks at the
          University of Sheffield. This policy explains how we handle personal
          information when you use the app.
        </p>
      </header>

      <section className="space-y-3" aria-labelledby="information">
        <h2 id="information" className="text-lg font-semibold text-ink">Information we collect</h2>
        <p>
          Google sign-in provides your name, university email address, Google
          account identifier and verification details in a sign-in token. The app
          uses your name and verified university email to find or create your member
          account. It does not store your Google account identifier in the member database.
          We do not receive your Google password.
        </p>
        <p>
          Member records contain your name, email where provided, team, role and
          last sign-in time. Existing team roster records may also include a GitHub
          username or avatar URL. We store project information entered or imported
          into the app, including task assignments, descriptions, notes, dates,
          progress and attached links.
        </p>
      </section>

      <section className="space-y-3" aria-labelledby="use">
        <h2 id="use" className="text-lg font-semibold text-ink">How we use information</h2>
        <p>
          We use sign-in details to identify members, check that they use a
          University of Sheffield account and manage access. Team roles determine
          permissions. Member names and assignments help people coordinate project
          work, track progress and understand dependencies. Signed-in users can see
          project information and member names used in the app.
        </p>
      </section>

      <section className="space-y-3" aria-labelledby="storage">
        <h2 id="storage" className="text-lg font-semibold text-ink">Storage and service providers</h2>
        <p>
          Account and project information is stored in our Supabase PostgreSQL
          database. Vercel hosts the app and processes requests to serve it.
          Google provides authentication. Where the project&apos;s Google Sheets
          integration is configured, project records, including task owner names,
          are synchronised with the connected team spreadsheet and are accessible
          to people who have access to that spreadsheet.
        </p>
        <p>
          Google sign-in requests basic profile and email information; it does not
          request access to your Gmail, personal Drive files or personal spreadsheets.
          The team spreadsheet connection is configured separately from member sign-in.
        </p>
      </section>

      <section className="space-y-3" aria-labelledby="cookies">
        <h2 id="cookies" className="text-lg font-semibold text-ink">Cookies and browser storage</h2>
        <p>
          We use a session cookie to keep you signed in for up to {SESSION_DAYS} days
          and a temporary sign-in cookie that expires after {FLOW_MINUTES} minutes.
          Signing out clears the session cookie from your browser. Your light or dark
          theme preference is saved in your browser&apos;s local storage.
        </p>
      </section>

      <section className="space-y-3" aria-labelledby="retention">
        <h2 id="retention" className="text-lg font-semibold text-ink">Retention and deletion</h2>
        <p>
          Account and project records currently remain in the database until they
          are manually removed; the app does not automatically delete them after
          inactivity or when a project ends. Signing out does not delete your account.
        </p>
        <p>
          To request access to, correction of, or deletion of your personal information,
          email the contact below using your university address. We may need to
          verify your identity before acting. Tell us if your request also concerns
          information copied to the connected team spreadsheet so it can be addressed
          there too. Any information retained to meet a legal obligation will be
          explained when we respond.
        </p>
      </section>

      <section className="space-y-3" aria-labelledby="contact">
        <h2 id="contact" className="text-lg font-semibold text-ink">Contact</h2>
        <p>
          For privacy questions or a deletion request, contact the MarsWorks Mission
          Control administrator at{" "}
          <a href="mailto:mrjoomun1@sheffield.ac.uk" className="break-words rounded text-accent underline underline-offset-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent">
            mrjoomun1@sheffield.ac.uk
          </a>.
        </p>
      </section>

      <footer className="border-t border-line pt-6">
        <Link href="/" className="rounded text-accent underline underline-offset-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent">
          Return to Mission Control
        </Link>
      </footer>
    </article>
  );
}
