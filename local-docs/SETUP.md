# Build it tonight — step by step

Follow these in order. Don't skip ahead: steps 1–3 have delays that run in the
background while you do other work.

Total hands-on time: about 90 minutes if nothing fights you.

---

## Before you start

Install these if you don't have them:

```bash
node -v            # need 20 or newer. If missing: https://nodejs.org
npm i -g firebase-tools
```

You also need a Google account and a credit/debit card on file for Google Cloud.
Cloud Functions requires the Blaze plan. The free tier is generous — this app will
cost you roughly nothing — but the card must be there or nothing deploys.

---

## Step 1 — Create the Firebase project (10 min)

1. Go to <https://console.firebase.google.com> and click **Add project**.
2. Name it something like `nightdesk-journal`. Turn Analytics off (faster).
3. Once created, click the gear icon → **Usage and billing** → **Modify plan** →
   choose **Blaze**. Attach a billing account. Set a budget alert of ₹500 so you
   sleep well.
4. In the left sidebar, open **Build → Authentication** → **Get started** →
   choose **Google** → toggle Enable → pick your email as support email → Save.
5. Open **Build → Firestore Database** → **Create database** → choose
   **Production mode** → pick location `asia-south1 (Mumbai)`.
6. Open **Project settings** (gear icon) → scroll to *Your apps* → click the
   **web** icon `</>` → nickname `nightdesk-web` → Register app.
7. **Copy the `firebaseConfig` object it shows you.** You need it in step 4.

---

## Step 2 — Get a Gemini API key (2 min)

1. Go to <https://aistudio.google.com/apikey>.
2. Click **Create API key** and pick the same Google Cloud project you just made.
3. Copy the key. Paste it into a scratch note for the next step, then delete
   the note. It never goes into any file.

---

## Step 3 — Wire up the code (15 min)

Open a terminal in this folder.

```bash
# 1. Point the project at your Firebase project
cp .firebaserc.example .firebaserc
```

Open `.firebaserc` and replace `YOUR-FIREBASE-PROJECT-ID` with your real project
id (visible in Firebase project settings, e.g. `nightdesk-journal-4f21`).

```bash
# 2. Sign in
firebase login

# 3. Install dependencies
cd functions && npm install && cd ..
cd web && npm install && cd ..

# 4. Store the Gemini key in Google Cloud Secret Manager.
#    This one command creates the secret, stores version 1, and grants access.
firebase functions:secrets:set GEMINI_API_KEY
#    Paste your key when prompted. It will not echo. Press Enter.
```

That last command is the whole "Secure Key Management" requirement. `defineSecret`
in `functions/index.js` is backed by Google Cloud Secret Manager — go look at
<https://console.cloud.google.com/security/secret-manager> and you'll see it sitting
there. Screenshot that for your submission.

If it errors about the API not being enabled, run this and retry:

```bash
gcloud services enable secretmanager.googleapis.com
```

---

## Step 4 — Add the frontend config (3 min)

```bash
cd web
cp .env.example .env.local
```

Open `web/.env.local` and fill in the six values from the `firebaseConfig` object
you copied in step 1.7. Mapping:

| firebaseConfig key | .env.local key |
|---|---|
| `apiKey` | `VITE_FB_API_KEY` |
| `authDomain` | `VITE_FB_AUTH_DOMAIN` |
| `projectId` | `VITE_FB_PROJECT_ID` |
| `storageBucket` | `VITE_FB_STORAGE_BUCKET` |
| `messagingSenderId` | `VITE_FB_SENDER_ID` |
| `appId` | `VITE_FB_APP_ID` |

**This is not a secret.** The Firebase web config is public by design; Google
documents it as such. Access is controlled by Firestore rules and Auth. If a judge
challenges you on it, that's your answer, and it's a good moment to point out that
the *Gemini* key is the actual secret and it's in Secret Manager.

---

## Step 5 — Deploy (10 min, mostly waiting)

```bash
cd ..                      # back to project root

# Push the security rules first
firebase deploy --only firestore:rules

# Then the backend. First deploy takes 3-6 minutes and may ask to
# enable APIs — say yes to all.
firebase deploy --only functions

# Then the site
cd web && npm run build && cd ..
firebase deploy --only hosting
```

Firebase prints a **Hosting URL** at the end. Open it. Sign in with Google. Talk to it.

If sign-in pops up and immediately fails: Firebase console →
**Authentication → Settings → Authorised domains** → make sure your
`*.web.app` domain is listed. Add `localhost` too.

---

## Step 6 — Prove it's secure (15 min) ← this is what wins

### 6a. The rules test suite

```bash
cd tests && npm install
npm test
```

You should see five passing assertions, including *"Mallory cannot read Alice's
entry"*. Screenshot this. It's the difference between claiming isolation and
proving it.

### 6b. Create a second account

Sign in on the deployed site with a different Google account (or use an incognito
window). Go to the **Security** tab in the right rail and copy the uid it shows.

### 6c. Run the attacks

Go back to your first account, open the **Security** tab, paste the second
account's uid, and click all three buttons. You'll see three green lines:

- blocked reading another user's entries
- blocked writing directly to Firestore, even to your own path
- the model refusing a prompt-injection attempt

That panel is built into the app on purpose. Judges love watching an attack fail
live far more than they like reading a security section in a README.

---

## Step 7 — Local development (optional, but useful)

```bash
cd web && npm run dev      # http://localhost:5173
```

The frontend talks to your *deployed* functions, so you can iterate on UI without
redeploying. To redeploy just the backend after a change:

```bash
firebase deploy --only functions
```

---

## What to submit

| Deliverable | Where it is |
|---|---|
| AI Studio custom instructions | `CUSTOM_INSTRUCTIONS.md` + a screenshot of it pasted into AI Studio |
| Firebase Auth | live sign-in on your Hosting URL |
| Multi-turn Gemini | the conversation column |
| Isolated Firestore | `firestore.rules` + passing `tests/rules.test.js` + the live attack |
| Secret Manager | `firebase functions:secrets:set` + Secret Manager console screenshot |
| Original feature | Ask your past self (tenant-scoped RAG) + the Security console |
| Repo | push to a public GitHub repo |

---

## Things that will break, and the fix

**"Error: HTTP Error 403, The caller does not have permission"**
Billing isn't on Blaze yet, or the API is still enabling. Wait 2 minutes, retry.

**Functions deploy fails with an eventarc / cloudbuild error**
Run `gcloud services enable cloudbuild.googleapis.com eventarc.googleapis.com run.googleapis.com` and redeploy.

**`functions/index.js` region mismatch**
`REGION` in `functions/index.js` must equal the region in `web/src/firebase.js`.
Both are set to `asia-south1`. If you change one, change both, or every call
fails with a CORS error that looks like an auth error.

**Model returns 404 / model not found**
Model names move fast. Open <https://ai.google.dev/gemini-api/docs/models>, copy
the current fast model id, and change `CHAT_MODEL` in `functions/index.js`.
`gemini-3.6-flash` and `gemini-3.5-flash-lite` are safe fallbacks.

**`npm install` fails in functions/**
Delete `functions/package-lock.json` and `functions/node_modules`, retry.

**Nothing appears in the Entries list after saving**
Open the browser console. If you see `permission-denied` on a *read*, your rules
didn't deploy. Run `firebase deploy --only firestore:rules` again.

---

## If you finish early

Cheap additions, roughly in order of impact per minute:

1. **App Check.** Register reCAPTCHA Enterprise in the Firebase console, then add
   `enforceAppCheck: true` to `baseOpts` in `functions/index.js`. Stops people
   calling your endpoints outside your app. 20 minutes, strong talking point.
2. **Streaming replies.** Swap `generateContent` for `generateContentStream`.
   Makes the demo feel much faster. 20 minutes.
3. **Weekly digest.** A scheduled function that summarises the week's entries per
   user. Shows you understand background jobs stay tenant-scoped too. 30 minutes.
4. **Export my data.** A button that downloads all your entries as JSON. Privacy
   story, and it's a 15-minute build.
