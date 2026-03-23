// Thin API client — points at a simple REST layer you can add later,
// or swap for direct DB queries via a Bun HTTP server.
const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

export async function fetchSnapshots() {
  const res = await fetch(`${BASE}/snapshots`);
  return res.json();
}

export async function fetchInvocations() {
  const res = await fetch(`${BASE}/invocations`);
  return res.json();
}
