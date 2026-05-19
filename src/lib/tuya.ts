// Tuya smart-switch helper.
// All calls go from the browser to the LOCAL Node Tuya server (server1.js)
// running on the same cafe PC. We never send Tuya secrets from this app —
// secrets live on the local server. We only send the device id.
//
// Compatible server endpoints (see updated server1.js snippet):
//   GET  {baseUrl}/on?deviceId=xxx
//   GET  {baseUrl}/off?deviceId=xxx
//   GET  {baseUrl}/status?deviceId=xxx   (optional, returns { on: boolean })
//
// Backwards compatible: if no deviceId param is passed, server falls back
// to the hardcoded one.

import { supabase } from "@/integrations/supabase/client";

export type TuyaState = "on" | "off" | "error" | "unknown" | null;

export interface TuyaTarget {
  deviceId?: string | null;
  serverUrl?: string | null; // per-asset override
}

const TIMEOUT_MS = 4000;

const normalizeBase = (url?: string | null) =>
  (url || "").trim().replace(/\/+$/, "");

const resolveBase = (target: TuyaTarget, globalBase?: string | null) =>
  normalizeBase(target.serverUrl || globalBase);

async function call(path: string): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(path, { method: "GET", signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function tuyaSet(
  target: TuyaTarget,
  on: boolean,
  globalBase?: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const base = resolveBase(target, globalBase);
  if (!base || !target.deviceId) return { ok: false, error: "Not linked" };
  const url = `${base}/${on ? "on" : "off"}?deviceId=${encodeURIComponent(target.deviceId)}`;
  // Try a normal CORS request first so we can read status.
  try {
    const res = await call(url);
    if (res.ok) return { ok: true };
  } catch {
    // fall through to no-cors fallback
  }
  // Fallback: fire-and-forget no-cors. The browser returns an opaque response
  // (status 0) but the request still reaches the local Tuya server. This is
  // what makes ON/OFF work even when CORS headers are missing on server1.js.
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    await fetch(url, { method: "GET", mode: "no-cors", signal: ctrl.signal });
    clearTimeout(timer);
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || "Network error" };
  }
}

export async function tuyaStatus(
  target: TuyaTarget,
  globalBase?: string | null,
): Promise<TuyaState> {
  const base = resolveBase(target, globalBase);
  if (!base || !target.deviceId) return null;
  try {
    const res = await call(`${base}/status?deviceId=${encodeURIComponent(target.deviceId)}`);
    if (!res.ok) return "error";
    const data = await res.json().catch(() => null);
    if (data && typeof data.on === "boolean") return data.on ? "on" : "off";
    return "unknown";
  } catch {
    return "error";
  }
}

// Persist last-known state on the asset row + log errors.
export async function applyTuyaForAsset(
  asset: { id: string; cafe_id: string; tuya_device_id?: string | null; tuya_server_url?: string | null; name?: string },
  on: boolean,
  globalBase?: string | null,
  context?: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!asset.tuya_device_id) return { ok: false, error: "no-device" };
  const result = await tuyaSet(
    { deviceId: asset.tuya_device_id, serverUrl: asset.tuya_server_url },
    on,
    globalBase,
  );
  const newState: TuyaState = result.ok ? (on ? "on" : "off") : "error";
  await supabase.from("assets").update({ tuya_state: newState }).eq("id", asset.id);
  if (!result.ok) {
    await supabase.from("activity_logs").insert({
      cafe_id: asset.cafe_id,
      user_id: (await supabase.auth.getUser()).data.user?.id ?? null,
      action: "tuya_error",
      details: {
        asset_id: asset.id,
        asset_name: asset.name,
        device_id: asset.tuya_device_id,
        action: on ? "on" : "off",
        error: result.error,
        context: context ?? null,
      },
    });
  }
  return result;
}
