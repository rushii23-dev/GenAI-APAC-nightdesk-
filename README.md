# Nightdesk

**A private journal you think out loud in, with Gemini on the other side of the desk.**

You sign in with Google, talk something through across a multi-turn
conversation, and when you're done the session is summarised and filed under
your identity alone. Later you can ask your own past self a question, or look at
the shape your last few weeks made.

The product is a journal. The engineering problem is multi-tenant isolation in
an AI app: one person's writing must never be reachable by another, and the
model API key must never be reachable by anyone.

---

## Features

**Write.** A single writing column, no chat bubbles. Your voice is marked by a
lamp-coloured rule down the left; the companion's replies sit plain beside it.
It asks one good follow-up at a time and keeps its answers short.

**File.** *Save and summarise* turns a session into a structured entry — title,
summary written back to you in second person, mood, energy score, two to four
themes, and one open question worth carrying.

**Ask your past self.** Semantic search over your own journal. Entries are
embedded on save; a question is embedded, ranked against your entries only, and
the top matches are cited by date.

**Trend.** A chart of how mood and energy have moved across your saved entries,
the themes that keep coming back, and one plain sentence about the direction.
Computed entirely in the browser.

**Security console.** An in-app panel that runs real cross-tenant reads,
malformed writes and prompt injections against live rules, and shows them fail.

---

## Technologies

| Layer | Technology | Used for |
|---|---|---|
| Frontend | **React 18 + Vite** | Single-page app, no CSS framework, no charting library |
| Hosting | **Firebase Hosting** | Static hosting for the built bundle |
| Authentication | **Firebase Auth** (Google provider) | Sign-in, and the ID token attached to every API call |
| Database | **Cloud Firestore** | Per-user entry storage at `/users/{uid}/entries` |
| Authorisation | **Firestore Security Rules** | Default deny, ownership checks, schema validation, immutability |
| API | **Cloudflare Workers** | Authenticated backend at the edge, free tier, no payment method |
| Token verification | **`jose`** against Google's public **JWKS** | Verifies Firebase ID tokens inside the Worker |
| AI | **Google AI Studio / Gemini API** | `gemini-3.7-flash` for chat and summarisation |
| Embeddings | **`gemini-embedding-001`** | 768-dimension vectors for semantic search |
| Secret storage | **Cloudflare encrypted secrets** | Holds the Gemini API key at runtime |
| Secret storage (alt) | **Google Cloud Secret Manager** | Same key via `defineSecret` on the Cloud Functions path |
| Testing | **Firebase Emulator Suite** + `@firebase/rules-unit-testing` | Eight assertions proving tenant isolation |

---

## Architecture

```
Browser — React + Vite on Firebase Hosting
  │
  │  Authorization: Bearer <Firebase ID token>
  ▼
Cloudflare Worker — nightdesk-api
  │   ├─ verifies the token against Google's public JWKS
  │   ├─ uid = the token's verified `sub` claim, and nothing else
  │   ├─ per-user rate limit
  │   ├─ fences untrusted text before it reaches a prompt
  │   └─ calls Gemini with a key from an encrypted Worker secret
  ▼
Gemini API — gemini-3.7-flash, gemini-embedding-001

Browser ──────▶ Cloud Firestore   /users/{uid}/entries
                 reads:   own subtree only
                 creates: schema-validated documents only
                 updates: never
```

Four endpoints, all POST, all authenticated:

| Route | Does |
|---|---|
| `/chat` | one turn of the conversation |
| `/summarise` | structured entry + embedding, via a JSON response schema |
| `/embed-query` | embeds a question so the client can rank locally |
| `/answer` | answers from the five entries the client selected |

---

## Data model

```
/users/{uid}/entries/{entryId}
```

| Field | Type | Notes |
|---|---|---|
| `title` | string | 1–200 chars |
| `summary` | string | under 4000 chars, written in second person |
| `mood` | enum | `low` · `flat` · `steady` · `bright` · `elated` |
| `energy` | int | 1–5 |
| `themes` | list | up to 6 short lowercase tags |
| `openQuestion` | string | one question worth carrying |
| `vector` | list | exactly 768 floats |
| `turnCount` | int | how long the session ran |
| `createdAt` | timestamp | must equal `request.time` |

Entries are immutable once written: `allow update: if false`.

---

## Security

**Identity comes only from a verified token.** The Worker verifies every request
against Google's public JWKS and takes the uid from the token's `sub` claim. It
is never read from a request body, query parameter or client-controlled header.

```js
const { payload } = await jwtVerify(token, JWKS, {
  issuer:   `https://securetoken.google.com/${env.FIREBASE_PROJECT_ID}`,
  audience: env.FIREBASE_PROJECT_ID,
});
return payload.sub;
```

**Isolation is enforced by the database, not the app.** Firestore rules default
to deny and validate the exact key set, every field's type, the mood enum, the
energy range, the theme count, the vector length, and that `createdAt` is the
server's time. A hostile client cannot write an arbitrary payload even into its
own tenant space.

**Retrieval never crosses a tenant boundary.** Ranking runs on the client, by
cosine similarity, over documents it already read under its own rules. Most
multi-tenant RAG systems keep one shared index and add a tenant filter to the
query, where a single bug leaks everyone's data. Here another user's writing was
never fetched and could not be.

**The Gemini key is never in the client.** It lives in an encrypted Cloudflare
secret (or Google Cloud Secret Manager on the Functions path), is injected at
runtime, and appears in no bundle, no repository file and no log line.

```bash
grep -ri "AIza" web/dist/     # returns nothing
```

**Stored text re-entering a prompt is treated as untrusted.** User content is
wrapped in `<user_text>` tags and every system prompt declares fenced content to
be data, never instructions. Payloads are capped at 40 turns, 30k characters
total and 8k per turn.

**Origins are allowlisted.** The Worker echoes a caller's `Origin` only when it
appears in `ALLOWED_ORIGINS`, and sends no CORS header at all when unset.

**Logs carry the uid and the action, never content.**

### The Firebase web config is not a secret

`web/src/firebase.js` ships `apiKey`, `projectId` and friends to the browser on
purpose. That object identifies the project; it does not authorise anything.
Access is controlled by Auth and Firestore rules.

---

## Tests

```bash
cd tests && npm install && npm test
```

Runs against the Firestore emulator:

```
  pass  Alice reads her own entry
  pass  Mallory cannot read Alice's entry
  pass  Signed-out visitor cannot read anything
  pass  Mallory cannot write into Alice's collection
  pass  Alice can create a well-formed entry of her own
  pass  Alice cannot write a malformed entry (schema enforced)
  pass  Alice cannot forge an energy score outside 1-5
  pass  Entries are immutable once written
```

---

## Running it

**Prerequisites:** Node 18+, a Firebase project, a Gemini API key from Google AI
Studio, and a Cloudflare account.

### 1. Firebase

Enable **Authentication → Google**, create a **Cloud Firestore** database in
production mode, and register a web app. Add `localhost` and your live domain
under *Authentication → Settings → Authorised domains*.

```bash
firebase deploy --only firestore:rules
```

### 2. Backend

```bash
cd worker && npm install
```

```bash
npx wrangler secret put GEMINI_API_KEY
```

```bash
npx wrangler deploy
```

The secret prompt never echoes the key and never writes it to the repository.
`wrangler deploy` prints the Worker URL. Set `ALLOWED_ORIGINS` in
`worker/wrangler.toml` to your Hosting URL before going live.

### 3. Web

Create `web/.env.local`. None of these are secrets, and the Gemini key does
**not** go here:

```
VITE_FB_API_KEY=
VITE_FB_AUTH_DOMAIN=
VITE_FB_PROJECT_ID=
VITE_FB_STORAGE_BUCKET=
VITE_FB_SENDER_ID=
VITE_FB_APP_ID=
VITE_API_URL=
```

The `VITE_FB_*` values come from the Firebase console; `VITE_API_URL` is the
Worker URL.

```bash
cd web && npm install && npm run dev
```

### 4. Deploy

```bash
cd web && npm run build && cd .. && firebase deploy --only hosting
```

Vite bakes `VITE_` variables in at build time, so editing `.env.local` changes
nothing until you rebuild.

---

## Known limitations

- **Firebase App Check is not enforced.** Endpoints accept any request carrying
  a valid ID token for the project, not only requests from the app's origin.
- **Rate limiting is per-isolate.** The in-memory counter in the Worker is a
  cost guard against denial-of-wallet, not a hard quota. Durable Objects or KV
  would make it exact.
- **Vector ranking is linear** over entries held in memory. Fine for a personal
  journal, wrong past a few thousand entries.
- **No audit log of reads**, and no account deletion or export flow in the UI.
- **Entry text is unencrypted at rest** beyond the database's own encryption.
- **Prompt-injection defence is a mitigation, not a proof.**
