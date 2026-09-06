import { auth } from "./firebase";

const BASE = import.meta.env.VITE_API_URL;

/**
 * Every call carries a fresh Firebase ID token. The Worker verifies it
 * against Google's JWKS and derives the uid from the token's `sub` claim.
 * The uid is never sent in the body — there is nothing for a client to forge.
 */
export async function api(path, body) {
  const user = auth.currentUser;
  if (!user) throw new Error("Sign in to continue.");

  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${await user.getIdToken()}`,
    },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status}).`);
  return data;
}

export function cosine(a, b) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-9);
}
