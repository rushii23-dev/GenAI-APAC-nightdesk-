/**
 * Proves the isolation claim instead of asserting it.
 * Run:  cd tests && npm install && npm test
 */
import {
  initializeTestEnvironment, assertFails, assertSucceeds,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { readFileSync } from "node:fs";

const env = await initializeTestEnvironment({
  projectId: "demo-nightdesk",
  firestore: { rules: readFileSync("../firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 },
});

const alice = env.authenticatedContext("alice").firestore();
const mallory = env.authenticatedContext("mallory").firestore();
const stranger = env.unauthenticatedContext().firestore();

const goodEntry = {
  title: "A hard week", summary: "You were stretched thin.", mood: "flat",
  energy: 2, themes: ["work"], openQuestion: "What would rest look like?",
  vector: new Array(768).fill(0.01), turnCount: 4, createdAt: serverTimestamp(),
};

await env.withSecurityRulesDisabled(async (ctx) => {
  await setDoc(doc(ctx.firestore(), "users/alice/entries/e1"), goodEntry);
});

let pass = 0, fail = 0;
async function check(name, promise) {
  try { await promise; console.log(`  pass  ${name}`); pass++; }
  catch (e) { console.log(`  FAIL  ${name} — ${e.message}`); fail++; }
}

console.log("\nFirestore isolation");

await check("Alice reads her own entry",
  assertSucceeds(getDoc(doc(alice, "users/alice/entries/e1"))));

await check("Mallory cannot read Alice's entry",
  assertFails(getDoc(doc(mallory, "users/alice/entries/e1"))));

await check("Signed-out visitor cannot read anything",
  assertFails(getDoc(doc(stranger, "users/alice/entries/e1"))));

await check("Mallory cannot write into Alice's collection",
  assertFails(setDoc(doc(mallory, "users/alice/entries/forged"), goodEntry)));

await check("Alice can create a well-formed entry of her own",
  assertSucceeds(setDoc(doc(alice, "users/alice/entries/e2"), goodEntry)));

await check("Alice cannot write a malformed entry (schema enforced)",
  assertFails(setDoc(doc(alice, "users/alice/entries/e3"), { title: "x", evil: "payload" })));

await check("Alice cannot forge an energy score outside 1-5",
  assertFails(setDoc(doc(alice, "users/alice/entries/e4"), { ...goodEntry, energy: 99 })));

await check("Entries are immutable once written",
  assertFails(setDoc(doc(alice, "users/alice/entries/e1"), { ...goodEntry, title: "rewritten" })));

await env.cleanup();
console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
