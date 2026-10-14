# Signing in

Mission Control is for the team only. People sign in with their University of
Sheffield Google account -- the one ending in **@sheffield.ac.uk** -- and
nothing else gets in.

- **Everyone on the team list has an account already** (`prisma/members.ts`).
  Signing in finds it by their university address, which is loaded once (Part 3
  below); someone added to the list later is found by name the first time.
- **Anyone else at the university** who signs in gets a new account, as a Team
  Member with no sub-team. They appear in the assignee lists like anyone else.
- **What people can do** follows the Role column of the team list:

  | Role | View, create, edit and move tasks | Delete tasks |
  | --- | --- | --- |
  | Project Lead | Yes | Yes |
  | Team Lead | Yes | Yes |
  | Technical Advisor | Yes | Yes |
  | Team Member | Yes | No |

Until sign-in is switched on, the site stays open exactly as before and every
page says so in a banner, so the deploy that brought this in cannot lock the
team out. It takes about fifteen minutes to switch on.

## Part 1 -- Google (about 10 minutes)

Sign-in goes through Google because university accounts are Google accounts.
Google needs to know about the site first.

1. Open <https://console.cloud.google.com/> and sign in. **Any Google account
   works for this, and a personal one is the safer choice**: university
   accounts are often not allowed to create Cloud projects, and whoever creates
   it owns it.
2. Top left, the project picker > **New project**. Call it "MarsWorks Mission
   Control" and create it, then make sure it is the selected project.
3. Search for **Google Auth Platform** (or go to *APIs & Services > OAuth
   consent screen*) and click **Get started**:
   - App name: `MarsWorks Mission Control`; user support email: yours.
   - Audience: **External**.
   - Contact email: yours. Agree and **Create**.
4. **Audience** (left menu) > **Publish app** > Confirm, so it says *In
   production*. Left in *Testing*, only people listed as test users could sign
   in. The site asks Google only for someone's name and email address, which
   needs no review from Google.
5. **Clients** > **Create client**:
   - Application type: **Web application**; name: `Mission Control`.
   - **Authorised redirect URIs** > Add URI: your site's address followed by
     `/api/auth/callback`, for example
     `https://marsworks.vercel.app/api/auth/callback`. It must match exactly:
     `https`, no trailing slash.
   - **Create**, then copy the **Client ID** and **Client secret**.

## Part 2 -- Vercel (2 minutes)

In the Vercel project, **Settings > Environment Variables**, add for
**Production**:

| Name | Value |
| --- | --- |
| `GOOGLE_CLIENT_ID` | The Client ID from Part 1 |
| `GOOGLE_CLIENT_SECRET` | The Client secret from Part 1 |
| `AUTH_SECRET` | A new long random string, e.g. from `openssl rand -hex 32`. Not the same as `SHEETS_SYNC_SECRET`. |
| `AUTH_URL` | Optional. The site's address, e.g. `https://marsworks.vercel.app`. Set it if the site has more than one address (a custom domain as well as the vercel.app one), so Google always gets the one in Part 1. |

Then **Deployments > the latest > ... > Redeploy**.

Check `https://<your-site>/api/health`: **Sign-in switched on** should say
`true`. Open the site in a private window: it should ask you to sign in.

All three of `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `AUTH_SECRET` are
needed. With only some of them set the site locks rather than guessing, and the
health page names what is missing.

## Part 3 -- link everyone's address (once, 1 minute)

The repository is public, so people's email addresses are never in it. They go
straight into the database instead:

1. Open Supabase > your project > **SQL Editor** > **New query**.
2. Paste in the SQL file you were sent alongside this change (it sets the
   address of everyone on the team list) and click **Run**.

Without this, people are matched by name the first time they sign in. That
works for most, but not where the team list and the university disagree --
"Matt" and "Matthew", say -- and someone not matched gets a new Team Member
account instead of their own (and loses a lead's delete rights).

## Day to day

- **Someone's role changes** (a new team lead): change their `role` in
  `prisma/members.ts`. The next deploy applies it.
- **Someone joins**: add them to `prisma/members.ts`. They are linked by name
  when they first sign in; to be certain, also put their address in Supabase
  (**Table Editor > Member**, their row, `email`).
- **Signing out**: click your initials, top right.
- **A session lasts 30 days**, then Google is asked again.

## If something goes wrong

- *"That isn't a University of Sheffield account"*: Google's chooser was used
  with a personal account. Pick the @sheffield.ac.uk one.
- *Google says `redirect_uri_mismatch`*: the address in Part 1, step 5 does not
  match the site exactly. Fix it there (it can take a few minutes to apply), or
  set `AUTH_URL` to the address you registered.
- *Google says the app is blocked, or `admin_policy_enforced`*: the
  university's Google admins do not allow sign-in to this app. Ask IT Services
  to allow "MarsWorks Mission Control" (sign-in only: name and email). Until
  then, removing the three variables reopens the site.
- *Everyone is locked out*: `/api/health` says what is wrong. Removing
  `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `AUTH_SECRET` and redeploying
  reopens the site to anyone with the link.

## What is protected, and how

- Every page and API route needs a signed-in session, except signing in
  itself, `/api/health`, and the Google Sheets sync, which Google's servers
  call and which checks its own secret.
- Sign-in uses Google's OpenID Connect flow with PKCE, a state value and a
  nonce. Only a verified address at `sheffield.ac.uk`, on an account the
  university manages, is accepted: a personal Google account that merely uses a
  university address is turned away, since its owner can give it any name.
- The session is a signed, httpOnly, SameSite=Lax cookie. Changes sent from
  another site are refused outright.
- Roles are read from the database on every check, so a change applies at
  once. Deleting a task is refused on the server for anyone but leads and
  technical advisors; hiding the button is only a courtesy.
- The code is in `src/lib/auth/` and `src/proxy.ts`.
