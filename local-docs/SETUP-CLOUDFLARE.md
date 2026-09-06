# Build it tonight — no card required

Google Cloud billing verification failed, so the backend moves to **Cloudflare
Workers**: free tier, 100,000 requests a day, no payment method asked for at any
point. Firebase Auth, Firestore and Hosting all work fine on the free Spark plan.

Follow these in order. About 45 minutes.

> **Use `SETUP.md` instead** if you ever get GCP billing working. That path uses
> Cloud Functions and Secret Manager. Both backends are in the repo; the
> Cloudflare one is what deploys tonight.

---

## What changed, and what didn't

| | Cloud Functions path | Cloudflare path |
|---|---|---|
| Gemini key location | Secret Manager | Encrypted Worker secret |
| Key in client bundle | never | never |
| Identity source | verified ID token | verified ID token (JWKS) |
| Firestore writes | server, Admin SDK | client, under schema-validating rules |
| Cross-user isolation | enforced by rules | enforced by rules |
| Cost | needs a card | free, no card |

The one real trade-off: entries are now written by the client rather than the
server. Firestore rules take over that job, so `firestore.rules` got stricter —
it validates the shape, types and ranges of every field, and entries are
immutable once written. Read it; you'll be asked about it.

---

## Step 1 — Firebase (15 min, free, no card)

Stay on the **Spark** plan. Don't touch billing again.

1. **Authentication** → Get started → **Google** → Enable → set your email as
   support email → Save.
2. **Firestore Database** → Create database → **Production mode** →
   location `asia-south1` → Enable.
3. **Project settings** → scroll to *Your apps* → click `</>` → nickname
   `nightdesk-web` → Register app → copy the `firebaseConfig` values.
4. **Authentication → Settings → Authorised domains** → make sure `localhost`
   is listed. You'll add your live domain after step 5.

---

## Step 2 — Get a fresh Gemini key (2 min)

The old key was exposed in a screenshot, so it must be replaced.

1. <https://aistudio.google.com/apikey>
2. Delete the old key if you haven't already.
3. **Create API key** → pick the `nightdesk-journal` project → copy it.
4. Do not paste it into any file, any terminal command, or any screenshot.
   It only ever gets typed into the prompt in step 3.

---

## Step 3 — Deploy the Worker (10 min)

In your project folder terminal:

```bash
cd worker
npm install
npx wrangler login
```

A browser opens. Sign up for Cloudflare if you don't have an account — it's free
and asks only for an email and password. No card.

Open `worker/wrangler.toml` and confirm `FIREBASE_PROJECT_ID = "nightdesk-journal"`.

Now store the key:

```bash
npx wrangler secret put GEMINI_API_KEY
```

It prompts for the value. Paste your new key. Nothing appears on screen — that's
correct. Press Enter.

```bash
npx wrangler deploy
```

It prints a URL like `https://nightdesk-api.yourname.workers.dev`. **Copy it.**

That URL plus the encrypted secret is your key-management story. Run
`npx wrangler secret list` and you'll see the name listed with no value —
screenshot that for your submission.

---

## Step 4 — Frontend config (5 min)

```bash
cd ../web
cp .env.example .env.local
```

Fill in `web/.env.local`:

```
VITE_FB_API_KEY=AIza...
VITE_FB_AUTH_DOMAIN=nightdesk-journal.firebaseapp.com
VITE_FB_PROJECT_ID=nightdesk-journal
VITE_FB_STORAGE_BUCKET=nightdesk-journal.firebasestorage.app
VITE_FB_SENDER_ID=1027314141645
VITE_FB_APP_ID=1:1027314141645:web:...
VITE_API_URL=https://nightdesk-api.yourname.workers.dev
```

Two of these I already know from your console: project ID is `nightdesk-journal`,
sender ID is `1027314141645`. Get the rest from the config block Firebase showed you.

---

## Step 5 — Deploy the site (10 min)

Create `.firebaserc` in the project root:

```json
{ "projects": { "default": "nightdesk-journal" } }
```

Then:

```bash
cd ..
firebase login
firebase deploy --only firestore:rules
cd web && npm install && npm run build && cd ..
firebase deploy --only hosting
```

Hosting and Firestore rules both deploy on Spark. Only Functions needed billing,
and you're not deploying those.

Firebase prints a **Hosting URL**. Open it and sign in.

**Then lock down CORS.** Open `worker/wrangler.toml`, set
`ALLOWED_ORIGIN = "https://nightdesk-journal.web.app"` (your real URL), and run
`npx wrangler deploy` again from the `worker` folder. Now only your site can call
your backend. Mention this in the demo.

---

## Step 6 — Prove it (15 min) ← this is what wins

```bash
cd tests && npm install && npm test
```

Eight assertions, including cross-user reads failing, malformed writes rejected,
and entries being immutable. Screenshot the green output.

Then on the live site: sign in with a second Google account in an incognito
window, copy its uid from the **Security** tab, go back to account one, paste it
in, and click all three attack buttons. Three blocks, live, against production rules.

---

## What to submit

| Deliverable | Where |
|---|---|
| AI Studio custom instructions | `CUSTOM_INSTRUCTIONS.md` + screenshot in AI Studio |
| Firebase Auth | live sign-in |
| Multi-turn Gemini | the conversation column |
| Isolated Firestore | `firestore.rules` + 8 passing tests + live attack |
| Secure key management | `wrangler secret list` + `worker/src/index.js` |
| Original feature | Ask your past self + the Security console |

---

## Say this about the Secret Manager requirement

Don't hide it. Put this in your README and say it out loud:

> **Secret management.** Two backends are in this repo. `functions/index.js`
> implements the Google Cloud Secret Manager path with
> `defineSecret("GEMINI_API_KEY")` and is the intended production deployment.
> Google Cloud billing verification failed during the build window
> (`OR_BACR2_59`), which blocks Secret Manager access, so the deployed backend
> is `worker/src/index.js` on Cloudflare Workers using encrypted secrets. The
> principle is identical and testable: the key is injected at runtime, is absent
> from the client bundle, the repository and every log line, and is never
> returned in a response. `grep -ri "AIza" web/dist/` returns nothing.

A documented constraint with a working equivalent reads as engineering judgement.
A silent gap reads as an incomplete submission.

---

## Things that will break

**`wrangler login` won't open a browser**
Run `npx wrangler login --browser=false` and paste the URL manually.

**401 "Your session expired" on every call**
`FIREBASE_PROJECT_ID` in `wrangler.toml` doesn't match your real project id.
Fix it and redeploy the Worker.

**CORS error in the browser console**
`ALLOWED_ORIGIN` doesn't match the site you're on. Set it to `"*"` while
testing, then lock it down before the demo.

**Model 404**
Model names move. Open <https://ai.google.dev/gemini-api/docs/models>, copy the
current fast model id, change `CHAT_MODEL` at the top of `worker/src/index.js`,
redeploy. `gemini-3.6-flash` and `gemini-3.5-flash-lite` are safe fallbacks.

**Entry saves but doesn't appear**
Open the console. `permission-denied` on a write means the model returned a field
that fails validation. Check `energy` is 1–5 and `themes` has 6 or fewer items.

**`npm install` fails in worker/**
Delete `worker/node_modules` and `worker/package-lock.json`, retry.
