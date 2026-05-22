// Tuya smart-switch helper.
// All calls go from the browser to the LOCAL Node Tuya server (server2.js)
// running on the same cafe PC. Secrets live on the local server. We only
// send the device id of the asset being controlled, so multiple assets
// each with their own Tuya device can be controlled independently.
//
// Server endpoint (server2.js):
//   POST {baseUrl}/device/control
//   Body: { deviceId: string, deviceName?: string, code: "switch_1", value: boolean }

import { supabase } from "@/integrations/supabase/client";

export type TuyaState = "on" | "off" | "error" | "unknown" | null;

export interface TuyaTarget {
  deviceId?: string | null;
  deviceName?: string | null;
  serverUrl?: string | null; // per-asset override
}

const TIMEOUT_MS = 4000;

const normalizeBase = (url?: string | null) =>
  (url || "").trim().replace(/\/+$/, "");

const resolveBase = (target: TuyaTarget, globalBase?: string | null) =>
  normalizeBase(target.serverUrl || globalBase);

const SWITCH_CODE = "switch_1";

export async function tuyaSet(
  target: TuyaTarget,
  on: boolean,
  globalBase?: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const base = resolveBase(target, globalBase);
  if (!base || !target.deviceId) return { ok: false, error: "Not linked" };
  const url = `${base}/device/control`;
  const body = JSON.stringify({
    deviceId: target.deviceId,
    deviceName: target.deviceName || target.deviceId,
    code: SWITCH_CODE,
    value: on,
  });
  // Try normal CORS POST so we can read the response.
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (res.ok) {
      const data = await res.json().catch(() => null);
      if (data && data.success === false) {
        return { ok: false, error: data.message || "Device error" };
      }
      return { ok: true };
    }
  } catch {
    // fall through to no-cors fallback
  }
  // Fallback: fire-and-forget no-cors POST. Opaque response (status 0) but
  // the request still reaches the local Tuya server even without CORS headers.
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    await fetch(url, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "application/json" },
      body,
      signal: ctrl.signal,
    });
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
  // server2.js does not expose a status endpoint — state is tracked locally
  // on the asset row after each ON/OFF command.
  const base = resolveBase(target, globalBase);
  if (!base || !target.deviceId) return null;
  return "unknown";
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
