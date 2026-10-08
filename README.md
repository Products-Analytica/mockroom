# Mock Interview Room

AI mock interviews for the batch. The interviewer asks questions out loud, listens, follows up and scores each answer.

- **Students** continue with any Google account, submit their full name and SAP ID, and are approved by the committee (automatically if their SAP ID is on the uploaded batch list). They then connect their own free Gemini API key once. The browser talks to Google's Gemini API directly with that key, so there is no AI bill and no AI server to run.
- **Privacy:** the Gemini key, resume, JDs, answers, interview reports, scores and feedback stay in the student's browser (localStorage). The database holds only sign-in and approval data: Google name and email, full name, SAP ID and approval status.
- **The committee** (emails listed in `public.admins`) approves students and sees their names, SAP IDs and emails. Interview results are never visible to the committee.

Stack: Next.js on Vercel, Supabase (Google sign-in, Postgres), Google Gemini (each student's own key), browser speech synthesis and speech recognition.

## Setup (about 45 minutes, once)

Do every step while signed in to the shared committee accounts below, not your personal ones, so the project can be handed over cleanly.

### 1. Shared committee Google account
Create one Google account for the committee (for example `analytica.mockroom@gmail.com`) and store its password somewhere the committee can access. Use it to sign up for GitHub, Supabase, Google Cloud and Vercel below. Turn on 2-step verification and add a second committee member's phone as a backup.

### 2. GitHub organization
1. Sign in to GitHub with the shared account and create a free **organization** (for example `analytica-nmims`).
2. Create a repository in the organization and push this folder to it.
3. Add current committee members to the organization as owners.

### 3. Supabase project
1. At supabase.com, create a new project. Choose the **Mumbai (ap-south-1)** region.
2. Open `supabase/schema.sql` and change `your.email@gmail.com` in the `admins` insert to the Google account you'll sign in with as committee (you can add more later).
3. In Supabase, go to **SQL Editor**, paste the whole file and click **Run**. The schema is written for a fresh project.

### 4. Google sign-in
1. In Google Cloud Console (console.cloud.google.com), create a project (for example `mockroom`).
2. Go to **APIs & Services > OAuth consent screen** (Google Auth Platform). Choose **External**, fill in the app name, support email and developer contact, and add the scopes `email`, `profile` and `openid`. Then **publish** the app (Audience > Publish app) so any Google account can sign in, not just test users.
3. Go to **Credentials > Create credentials > OAuth client ID**, type **Web application**.
   - **Authorized JavaScript origins:** `https://your-app.vercel.app` and `http://localhost:3000`
   - **Authorized redirect URIs:** `https://<project>.supabase.co/auth/v1/callback` (your Supabase project URL)
4. Copy the client ID and client secret.
5. In Supabase, go to **Authentication > Sign In / Providers > Google**, turn it on, paste the client ID and secret, and save.

### 5. Supabase URL configuration
In Supabase, go to **Authentication > URL Configuration**:
- **Site URL:** `https://your-app.vercel.app` (update it once Vercel gives you the address)
- **Redirect URLs:** add `https://your-app.vercel.app/**` and `http://localhost:3000/**`

### 6. Deploy to Vercel
1. Sign in to Vercel with the shared GitHub account, click **Add New > Project** and import the repository.
2. Add these environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (Supabase **Project Settings > API**)
   - `NEXT_PUBLIC_GEMINI_MODELS`: Gemini models to try in order, comma-separated, for example `gemini-2.5-flash,gemini-2.5-flash-lite` (see [AI models and busy periods](#ai-models-and-busy-periods)). The older single-model `NEXT_PUBLIC_GEMINI_MODEL` still works if this isn't set.
3. Deploy, then put the Vercel address into Supabase's URL Configuration (step 5) and the Google OAuth client's JavaScript origins (step 4.3).

### 7. Logos (optional)
Put `logo-nmims.png` and `logo-analytica.png` in `public/`. They appear on the landing page.

## Adding committee members
In the Supabase SQL Editor, add the Google account email they'll sign in with:
```sql
insert into public.admins (email) values ('member@gmail.com');
```
Committee members are approved automatically and don't need a SAP ID. If they had already signed in before being added, they get access on their next page load. Remove someone with `delete from public.admins where email = '...';`

## Approving students
Students sign in with Google, then submit their full name and SAP ID (11 digits). Until approved they see a "Waiting for approval" screen.

- **Committee view** (`/admin`): the nav shows a badge with the number waiting. Approve or reject each student (a rejection can include a note the student sees; they can fix their details and resubmit), or tick several and click **Approve selected**. The Approved and Rejected filters let you revoke access or correct a name or SAP ID, and the Approved filter has a CSV export of approved students.
- **Batch list:** upload a CSV with the columns `sap_id,full_name` (for example exported from the official class list). Students whose SAP ID is on this list are approved automatically when they submit their details. Duplicates are skipped and invalid rows are listed so you can fix them. Students who signed up before the list was uploaded are shown with a one-click **Approve** link. In Excel, format the SAP ID column as Text before exporting so long numbers aren't turned into `8.06E+10`.

## AI models and busy periods
Google's free Gemini models are sometimes overloaded. The app handles this on its own, one request at a time:
- **Busy (503 / "overloaded" / "high demand"):** retries the same model after 2 seconds, then 5 seconds, then moves to the next model in `NEXT_PUBLIC_GEMINI_MODELS`.
- **Rate-limited (429):** waits 10 seconds and retries once, then moves to the next model.
- **Retired or unknown model (404):** skips it straight away and doesn't try it again for the rest of the browser session.
- The model that last worked is tried first for the rest of the session, and each report records which model(s) answered.

While this happens the student sees "The AI is busy, retrying…". Only if every model fails do they see "Google's AI is very busy right now. Your progress is saved. Press Retry in a minute." Retry carries on from where it stopped, so no answers are lost. Follow-up questions during the interview get one quick try per model and are skipped if the AI is busy, so the room never stalls.

When Google retires a model, update `NEXT_PUBLIC_GEMINI_MODELS` in Vercel and redeploy. List current models at ai.google.dev/gemini-api/docs/models.

## Handover checklist
When the committee changes:
1. Make your successor an owner everywhere: the shared Google account (password and recovery details), the GitHub organization, the Supabase project, the Google Cloud project and the Vercel team.
2. In Google Cloud, regenerate the OAuth client secret (**Credentials > your client > Reset secret**).
3. Paste the new secret into Supabase's Google provider and save.
4. Update `public.admins` for the new committee, and the Vercel environment variables if anything changed.
5. Remove yourself from every service above.

## Run locally
```
npm install
cp .env.example .env.local   # then fill in the values
npm run dev
```
Open http://localhost:3000 in Chrome.

## Good to know
- **Gemini free tier:** each student's key has its own rate limits. If a student hits one, the app asks them to wait a minute and press Retry; nothing is lost. On Google's free tier, Google may use what's sent to improve its products, and students are told this when they connect their key.
- **Free tiers:** Vercel Hobby is for non-commercial use. Supabase free projects pause after about a week with no activity; open the dashboard to resume.
- **Browsers:** latest Chrome or Edge on a laptop work best. The interviewer's voice is the browser's own speech synthesis, so it varies between browsers and operating systems.
- **Interview history is per browser.** Reports are kept only in the browser where the interview was taken (the last 30), so clearing site data or switching laptops starts a fresh history. Students can use **Save as PDF** on a report to keep a copy.
- **Speech-to-text** uses the browser's own service (Google in Chrome, Microsoft in Edge), so spoken answers are sent there for transcription.
