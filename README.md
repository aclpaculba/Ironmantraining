# Raceplan

A triathlon and running training planner with an in-app AI coach.

- Pick your race (Ironman, 70.3, marathon, half, 10K). Ironman and 70.3 races are listed with dates and a live countdown.
- A detailed onboarding captures your experience in each sport, body stats, health and recovery, and your week.
- The plan builds around your busy days and shows every workout as steps, zones, paces, a chart and fuelling advice.
- Each day you can do a 30 second readiness check-in.
- Ask your coach how a session should feel. The coach (DeepSeek) sees today's workout, your profile and your check-in.

Your plan, check-ins and coach chats are stored in your browser (localStorage). Only the coach questions leave your device, and they go to your own server first, then to DeepSeek.

## Run it in VS Code

You need Node.js 18 or newer (https://nodejs.org).

1. Open this folder in VS Code (File, Open Folder).
2. Copy `.env.example` to `.env` and paste your DeepSeek API key:
   ```
   DEEPSEEK_API_KEY=your-key-here
   ```
   Get a key at https://platform.deepseek.com. The key stays in `.env` on your machine.
3. Open the VS Code terminal (Ctrl+` or Cmd+`) and run:
   ```
   npm start
   ```
   (or press F5 and choose "Run Raceplan").
4. Open http://localhost:3000 in your browser.

Use `npm run dev` to restart the server automatically when you edit `dev-server.js` or `api/coach.js`. For changes to `index.html`, just refresh the browser.

If you open `index.html` straight from disk, the planner still works but the coach cannot answer, because it needs the server.

## Open it on your phone

Your phone must reach your computer. On the same Wi-Fi, find your computer's local IP address and open `http://YOUR-IP:3000` on the phone. For a permanent setup, deploy it (below).

## Deploy to Vercel and get iPhone reminders

### 1. Put the code on GitHub
1. Create a new empty repository on github.com (private is fine).
2. In a terminal inside this folder run: `git init`, `git add .`, `git commit -m "Raceplan"`, then the `git remote add origin ...` and `git push -u origin main` commands GitHub shows you. The `.gitignore` keeps `.env` out. Never commit your keys.

### 2. Create the reminders table in Supabase
1. Open your Supabase project, go to SQL Editor, paste the contents of `supabase.sql`, and run it. It creates two tables: `app_users` (one row per username, holding that user's plan, check-ins and coach chats) and `push_subscriptions` (reminders).
2. Go to Project Settings, API. Copy the **Project URL** and the **service_role** key (the secret one, never put it in the app code).

### 3. Import into Vercel
1. On vercel.com choose Add New, Project, and import the repository. If the repository root is the parent folder, set **Root Directory** to `raceplan`. Leave the framework as Other and the build settings empty.
2. Before deploying, open Environment Variables and add these (copy the values from your local `.env`):

| Name | Value |
| --- | --- |
| `DEEPSEEK_API_KEY` | your DeepSeek key |
| `APP_PASSCODE` | a passcode only you know (the app is public on the internet, so set this) |
| `VAPID_PUBLIC_KEY` | from your `.env` |
| `VAPID_PRIVATE_KEY` | from your `.env` |
| `VAPID_SUBJECT` | `mailto:you@example.com` (your email) |
| `CRON_SECRET` | from your `.env` (any long random string) |
| `SUPABASE_URL` | Supabase Project URL |
| `SUPABASE_SERVICE_KEY` | Supabase service_role key |

3. Click Deploy. You get a URL like `https://raceplan-xyz.vercel.app`.

### 4. Schedule the morning check
Vercel Hobby cron only runs once a day, so use a free external scheduler to call the reminder job every 15 minutes:
1. Create a free account at cron-job.org and add a cron job.
2. URL: `https://YOUR-APP.vercel.app/api/cron`, schedule: every 15 minutes.
3. Under Advanced, add a header `Authorization` with the value `Bearer YOUR_CRON_SECRET`.
4. Save. Use the Test run button: you should see `{"ok":true,...}`.

### 5. Install on your iPhone (iOS 16.4 or newer)
1. Open your Vercel URL in **Safari** (not Chrome).
2. Tap Share, then **Add to Home Screen**, then Add.
3. Open Raceplan from the new Home Screen icon.
4. Go to Profile, Settings, Reminders. Pick a time and tap **Turn on reminders**. Allow notifications and a test notification arrives.
5. Enter your passcode in the Coach tab the first time you use the coach or reminders if you set `APP_PASSCODE`.

Reminders arrive on days with a workout, at up to 5 times you choose. Later ones are skipped once you mark the workout done, and tapping a reminder opens that day's workout. Open the app now and then: it refreshes your next four weeks of workouts on the server each time you use it, and reminders stop when that copy runs out.

## Files

| File | What it does |
| --- | --- |
| `index.html` | The whole app: onboarding, plan generator, workouts, check-in, coach chat. No build step. |
| `api/coach.js` | The coach endpoint. Builds the prompt and calls DeepSeek. Contains the coach's system prompt. |
| `dev-server.js` | Local-only dev server (not used on Vercel) that serves the app and runs the `api/` functions. |
| `api/push.js`, `api/cron.js` | Save your phone for reminders, and send the daily reminder. |
| `sw.js`, `manifest.webmanifest`, `icons/` | Make the app installable and show notifications. |
| `supabase.sql` | Creates the reminders table. |
| `.env.example` | Settings template. Copy to `.env`. |

## Settings (`.env`)

| Variable | Meaning |
| --- | --- |
| `DEEPSEEK_API_KEY` | Your DeepSeek key. Required for the coach. |
| `DEEPSEEK_MODEL` | Defaults to `deepseek-v4-flash`. The older `deepseek-chat` name was retired in July 2026. Check https://api-docs.deepseek.com for current names. |
| `DEEPSEEK_BASE_URL` | Defaults to `https://api.deepseek.com`. |
| `APP_PASSCODE` | Optional. If set, the app asks for it before the coach answers. |
| `COACH_RATE_LIMIT` | Optional. Coach questions per hour per IP. Default 60. |
| `PORT` | Optional. Default 3000. |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Keys for push notifications. Generate with `npx web-push generate-vapid-keys`. |
| `CRON_SECRET` | Protects `/api/cron`. |
| `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` | Where phone subscriptions are stored. |

## Tuning the coach

Open `api/coach.js` and edit the `SYSTEM` text near the top to change the coach's voice, length or rules. The profile fields the coach sees are built in `athleteCtx()` in `index.html`, and the workout it sees is built in `workoutCtx()`.

## Race dates

The race list in `index.html` (search for `var RACES`) is a snapshot from 28 Oct 2026. Confirm dates on ironman.com before you register, and add or edit races there.

## Notes

- This is general training guidance, not medical advice.
- Paces are estimated until you enter a recent 5K time and 400 swim time during setup.
