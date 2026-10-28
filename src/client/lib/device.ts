const KEY = "htc-device-id";

export function getDeviceId(): string {
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(KEY, id);
  }
  return id;
}

export async function api(path: string, init?: RequestInit) {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", "X-Device-Id": getDeviceId(), ...(init?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json();
}
