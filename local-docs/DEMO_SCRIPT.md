# Five-minute demo script

Rehearse this twice before you present. Have three browser tabs pre-opened:
the app (account A), the app in incognito (account B), and the Google Cloud
Secret Manager console.

**0:00 — The constitution (30s)**
Show the AI Studio screen with the custom instructions pasted in.
> "Before writing any code, I gave the studio a constitution: threat model first,
> tenant id only from the verified token, default deny, secrets from Secret Manager.
> Everything after this was generated under those rules."

**0:30 — It works (60s)**
Sign in. Type something real. Get a reply. Send one more turn so multi-turn is
obvious. Click *Save and summarise*. The entry appears in the rail with a mood,
energy score and themes.

**1:30 — Ask your past self (45s)**
Switch to the *Ask your past self* tab. Ask something the entry answers. Point at
the source citations underneath.
> "This is semantic search over your own journal. Most RAG apps run one shared
> vector index with a tenant filter in the query — one bug in that filter leaks
> everyone's diary. Ours is physically partitioned. The retrieval path is built
> from the verified uid, so the query literally cannot name another user."

**2:15 — Break it (75s)** ← the moment that wins
Open the *Security* tab. Paste account B's uid from the incognito window.
Click all three buttons in turn. Read the results aloud:
- blocked reading another user's entries
- blocked writing to Firestore at all, even my own path
- the model refusing an injection attempt

> "Three attacks a hostile signed-in user would actually try. All three fail
> against production rules, live, right now."

**3:30 — The key (45s)**
Terminal: `grep -ri "AIza" web/dist/` → no results.
Cut to the Secret Manager tab showing `GEMINI_API_KEY` with its version history.
> "The key is never in the bundle, never in the repo, never in an env file. It's
> mounted into the function at runtime from Secret Manager."

**4:15 — Tests (30s)**
Terminal: `cd tests && npm test`. Eight green assertions.
> "Isolation isn't a claim in my README. It's an assertion in CI."

**4:45 — Close (15s)**
> "Four requirements. All four demonstrable rather than described. And the
> original feature is the one place multi-tenant AI apps leak most often, built
> so that it can't."

---

## Likely judge questions, and answers

**"Your Firebase apiKey is in the frontend."**
That's the Firebase project identifier, not a credential. Google publishes it in
their own docs and quickstarts. Access is enforced by Firestore rules and Auth,
which I can demonstrate. The credential that *is* sensitive is the Gemini key,
and it's in Secret Manager.

**"What if someone calls your backend directly?"**
They need a valid Firebase ID token, verified against Google's public JWKS on
every request. Without one they get a 401. With one, the uid comes from the
token's `sub` claim, so they can only ever act on their own data. CORS is also
locked to the Hosting origin. App Check is the next layer.

**"Why does the client write to Firestore instead of the server?"**
Cloudflare Workers can't hold a Google service-account key as cheaply as
Cloud Functions can, so authorization moves entirely into Firestore rules —
which is what they're designed for. The rules validate every field's type,
range and presence, reject unknown keys, and make entries immutable after
creation. The tests demonstrate all of that.

**"What stops someone running up your Gemini bill?"**
A fixed-window rate limit of 20 calls per minute per uid, enforced inside a
Firestore transaction so it can't be raced, plus payload size caps before the
model is ever invoked.

**"Isn't the summary in the prompt user-controlled?"**
Yes, which is why every stored fragment re-entering a prompt is wrapped in
`<user_text>` or `<entry>` tags and every system prompt tells the model that
content inside them is data, never instructions. You just watched me try it.

**"What didn't you mitigate?"** (Answer honestly — it reads as senior.)
App Check isn't enforced yet, so the endpoints accept calls from outside my
origin as long as the caller holds a valid token. Vector search ranks in memory
over the latest 200 entries, which won't scale past a few thousand; the fix is a
proper vector index. And there's no audit log of reads yet.
