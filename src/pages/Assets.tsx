import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import PageHeader from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Edit2, Trash2, AlertTriangle, Power, PowerOff, Activity, Save, Zap, EyeOff, Wrench } from "lucide-react";
import { toast } from "sonner";
import { applyTuyaForAsset, tuyaSet, type TuyaState } from "@/lib/tuya";

const CATEGORIES = [
  { value: "pool", label: "Pool" }, { value: "carrom", label: "Carrom" },
  { value: "ps5", label: "PS5 / Console" }, { value: "pc", label: "PC" }, { value: "other", label: "Other" },
];

const StatusDot = ({ state }: { state?: TuyaState | string | null }) => {
  if (!state) return null;
  const map: Record<string, string> = {
    on: "bg-success shadow-[0_0_8px_hsl(var(--success))] animate-pulse",
    off: "bg-muted-foreground/40",
    error: "bg-destructive shadow-[0_0_8px_hsl(var(--destructive))]",
    unknown: "bg-warning",
  };
  const cls = map[state as string] || "bg-muted-foreground/30";
  return <span title={`Smart switch: ${state}`} className={`inline-block w-2 h-2 rounded-full ${cls}`} />;
};

const Assets = () => {
  const { cafeId, role } = useAuth();
  const canDelete = role === "admin" || role === "super_admin";
  const isAdmin = role === "admin" || role === "super_admin";
  const [rows, setRows] = useState<any[]>([]);
  const [rates, setRates] = useState<any[]>([]);
  const [activeSessions, setActiveSessions] = useState<Record<string, string>>({});
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState<any>({
    name: "", category: "console", rate_profile_id: "",
    tuya_enabled: false, tuya_device_id: "", tuya_device_name: "", tuya_server_url: "",
    alert_enabled: false, alert_minutes: 0,
    availability: "available", is_hidden: false,
  });
  const [confirmDel, setConfirmDel] = useState<any | null>(null);
  const [confirmReset, setConfirmReset] = useState<any | null>(null);
  const [globalTuyaUrl, setGlobalTuyaUrl] = useState("");
  const [savedGlobal, setSavedGlobal] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    if (!cafeId) return;
    const [{ data: a }, { data: r }, { data: s }, { data: c }] = await Promise.all([
      supabase.from("assets").select("*").eq("cafe_id", cafeId).order("name"),
      supabase.from("rate_profiles").select("id, name").eq("cafe_id", cafeId),
      supabase.from("sessions").select("id, asset_id").eq("cafe_id", cafeId).eq("status", "active"),
      supabase.from("cafes").select("tuya_server_url").eq("id", cafeId).maybeSingle(),
    ]);
    setRows(a || []); setRates(r || []);
    const m: Record<string, string> = {};
    (s || []).forEach((x: any) => { m[x.asset_id] = x.id; });
    setActiveSessions(m);
    const url = c?.tuya_server_url || "";
    setGlobalTuyaUrl(url); setSavedGlobal(url);
  };
  useEffect(() => { load(); }, [cafeId]);

  const saveGlobal = async () => {
    if (!cafeId) return;
    const url = globalTuyaUrl.trim();
    const { error } = await supabase.from("cafes").update({ tuya_server_url: url || null }).eq("id", cafeId);
    if (error) return toast.error(error.message);
    setSavedGlobal(url); toast.success("Global Tuya server saved");
  };

  const save = async () => {
    if (!cafeId || !form.name) return toast.error("Name required");
    // Active sessions cannot be hidden
    if (form.is_hidden && editing && activeSessions[editing.id]) {
      return toast.error("Asset cannot be hidden while a session is active.");
    }
    const payload: any = {
      cafe_id: cafeId, name: form.name, category: form.category,
      rate_profile_id: form.rate_profile_id || null,
      tuya_enabled: !!form.tuya_enabled,
      tuya_device_id: form.tuya_device_id?.trim() || null,
      tuya_device_name: form.tuya_device_name?.trim() || null,
      tuya_server_url: form.tuya_server_url?.trim() || null,
      alert_enabled: !!form.alert_enabled,
      alert_minutes: Number(form.alert_minutes || 0),
      availability: form.availability === "unavailable" ? "unavailable" : "available",
      is_hidden: !!form.is_hidden,
    };
    const { error } = editing
      ? await supabase.from("assets").update(payload).eq("id", editing.id)
      : await supabase.from("assets").insert(payload);
    if (error) return toast.error(error.message);
    toast.success(editing ? "Updated" : "Created");
    setOpen(false); load();
  };

  const del = async () => {
    if (!confirmDel) return;
    const { error } = await supabase.rpc("force_delete_asset", { _asset_id: confirmDel.id });
    if (error) return toast.error(error.message);
    toast.success("Asset deleted");
    setConfirmDel(null); load();
  };

  const unhide = async (asset: any) => {
    const { error } = await supabase.from("assets").update({ is_hidden: false }).eq("id", asset.id);
    if (error) return toast.error(error.message);
    toast.success("Asset unhidden");
    load();
  };

  const forceReset = async () => {
    if (!confirmReset) return;
    const sid = activeSessions[confirmReset.id];
    if (!sid) { toast.info("No active session on this asset"); setConfirmReset(null); return; }
    const { error } = await supabase.rpc("force_reset_session", { _session_id: sid, _reason: "Admin emergency reset from Assets page" });
    if (error) return toast.error(error.message);
    // Best-effort OFF on the linked smart switch
    if (confirmReset.tuya_enabled === true && confirmReset.tuya_device_id) {
      const r = await applyTuyaForAsset(confirmReset, false, savedGlobal, "force_reset");
      if (!r.ok) toast.warning(`Session reset, but smart switch OFF failed: ${r.error}`);
    }
    toast.success("Session reset");
    setConfirmReset(null); load();
  };

  const manual = async (asset: any, on: boolean) => {
    if (asset.is_hidden) return;
    if (asset.tuya_enabled !== true) return toast.error("Smart switch is disabled for this asset");
    if (!asset.tuya_device_id) return toast.error("Asset not linked to a smart switch");
    setBusyId(asset.id);
    const r = await applyTuyaForAsset(asset, on, savedGlobal, "manual");
    setBusyId(null);
    if (r.ok) { toast.success(`Smart switch turned ${on ? "ON" : "OFF"}`); load(); }
    else toast.error(`Failed: ${r.error}`);
  };

  const test = async (asset: any) => {
    if (asset.tuya_enabled !== true) return toast.error("Smart switch is disabled for this asset");
    if (!asset.tuya_device_id) return toast.error("Asset not linked");
    setBusyId(asset.id);
    const r = await tuyaSet(
      { deviceId: asset.tuya_device_id, deviceName: asset.tuya_device_name, serverUrl: asset.tuya_server_url },
      true, savedGlobal,
    );
    if (r.ok) {
      await new Promise((res) => setTimeout(res, 800));
      await tuyaSet({ deviceId: asset.tuya_device_id, deviceName: asset.tuya_device_name, serverUrl: asset.tuya_server_url }, false, savedGlobal);
      toast.success("Device responded — test OK");
    } else {
      toast.error(`Test failed: ${r.error}`);
    }
    setBusyId(null);
  };

  return (
    <>
      <PageHeader title="Assets" description="Pool tables, consoles, PCs"
        actions={
          <Button onClick={() => { setEditing(null); setForm({ name: "", category: "console", rate_profile_id: "", tuya_enabled: false, tuya_device_id: "", tuya_device_name: "", tuya_server_url: "", alert_enabled: false, alert_minutes: 0, availability: "available", is_hidden: false }); setOpen(true); }}
            className="bg-gradient-primary text-primary-foreground"><Plus className="w-4 h-4 mr-1" />Add asset</Button>
        } />

      {isAdmin && (
        <Card className="glass-card p-4 mb-4">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="w-4 h-4 text-primary" />
            <Label className="text-sm font-semibold">Global Tuya smart-switch server</Label>
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            URL of the local Node Tuya server (server1.js) running on this cafe's PC. Used by all assets unless they override below. Example: <code>http://localhost:3000</code>
          </p>
          <div className="flex gap-2">
            <Input value={globalTuyaUrl} onChange={(e) => setGlobalTuyaUrl(e.target.value)} placeholder="http://localhost:3000" />
            <Button onClick={saveGlobal} disabled={globalTuyaUrl === savedGlobal} className="bg-gradient-primary text-primary-foreground">
              <Save className="w-4 h-4 mr-1" />Save
            </Button>
          </div>
        </Card>
      )}

      <Card className="glass-card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left p-3 text-xs uppercase text-muted-foreground">Name</th>
              <th className="text-left p-3 text-xs uppercase text-muted-foreground">Category</th>
              <th className="text-left p-3 text-xs uppercase text-muted-foreground">Status</th>
              <th className="text-left p-3 text-xs uppercase text-muted-foreground">Smart switch</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-border/50 hover:bg-muted/20">
                <td className="p-3 text-sm">
                  <div className="flex items-center gap-2">
                    <span className={r.is_hidden ? "text-muted-foreground" : ""}>{r.name}</span>
                    {r.is_hidden && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                        <EyeOff className="w-3 h-3" />Hidden
                      </span>
                    )}
                    {!r.is_hidden && r.availability === "unavailable" && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-warning/20 px-2 py-0.5 text-[10px] font-semibold text-warning">
                        <Wrench className="w-3 h-3" />Unavailable
                      </span>
                    )}
                  </div>
                </td>
                <td className="p-3 text-sm capitalize">{r.category}</td>
                <td className="p-3 text-xs uppercase">{r.status}</td>
                <td className="p-3 text-xs">
                  {r.tuya_enabled && r.tuya_device_id ? (
                    <div className="flex items-center gap-2">
                      <StatusDot state={r.tuya_state || "unknown"} />
                      <span className="text-muted-foreground truncate max-w-[140px]" title={r.tuya_device_id}>
                        {r.tuya_device_name || r.tuya_device_id}
                      </span>
                    </div>
                  ) : (
                    <span className="text-muted-foreground/60">{r.tuya_device_id ? "Disabled" : "Not linked"}</span>
                  )}
                </td>
                <td className="p-3 text-right whitespace-nowrap">
                  {isAdmin && r.tuya_enabled && r.tuya_device_id && (
                    <>
                      <Button size="icon" variant="ghost" disabled={busyId === r.id} title="Turn ON" onClick={() => manual(r, true)}>
                        <Power className="w-3 h-3 text-success" />
                      </Button>
                      <Button size="icon" variant="ghost" disabled={busyId === r.id} title="Turn OFF" onClick={() => manual(r, false)}>
                        <PowerOff className="w-3 h-3 text-muted-foreground" />
                      </Button>
                      <Button size="icon" variant="ghost" disabled={busyId === r.id} title="Test device" onClick={() => test(r)}>
                        <Activity className="w-3 h-3 text-primary" />
                      </Button>
                    </>
                  )}
                  {canDelete && activeSessions[r.id] && (
                    <Button size="icon" variant="ghost" className="text-warning" title="Force reset active session"
                      onClick={() => setConfirmReset(r)}>
                      <AlertTriangle className="w-3 h-3" />
                    </Button>
                  )}
                  {isAdmin && r.is_hidden && (
                    <Button size="icon" variant="ghost" className="text-primary" title="Unhide asset" onClick={() => unhide(r)}>
                      <EyeOff className="w-3 h-3" />
                    </Button>
                  )}
                  <Button size="icon" variant="ghost" onClick={() => {
                    setEditing(r);
                    setForm({
                      name: r.name, category: r.category, rate_profile_id: r.rate_profile_id || "",
                      tuya_enabled: r.tuya_enabled ?? !!r.tuya_device_id,
                      tuya_device_id: r.tuya_device_id || "", tuya_device_name: r.tuya_device_name || "",
                      tuya_server_url: r.tuya_server_url || "",
                      alert_enabled: !!r.alert_enabled, alert_minutes: Number(r.alert_minutes || 0),
                      availability: r.availability === "unavailable" ? "unavailable" : "available",
                      is_hidden: !!r.is_hidden,
                    });
                    setOpen(true);
                  }}><Edit2 className="w-3 h-3" /></Button>
                  {canDelete && (
                    <Button size="icon" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setConfirmDel(r)}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">No assets yet</td></tr>}
          </tbody>
        </table>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="glass-card max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Edit" : "New"} asset</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div>
              <Label>Category</Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Rate profile</Label>
              <Select value={form.rate_profile_id || "none"} onValueChange={(v) => setForm({ ...form, rate_profile_id: v === "none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {rates.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="border-t border-border pt-3 space-y-3">
              <Label className="text-sm font-semibold">Asset availability</Label>
              <RadioGroup value={form.availability} onValueChange={(v) => setForm({ ...form, availability: v })} className="gap-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <RadioGroupItem value="available" id="avail-available" />
                  <span className="text-sm">Available</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <RadioGroupItem value="unavailable" id="avail-unavailable" />
                  <span className="text-sm">Unavailable</span>
                </label>
              </RadioGroup>
              <p className="text-[11px] text-muted-foreground">
                Unavailable assets stay visible on the floor map but can't start, receive, or be selected for new sessions. Active sessions keep running.
              </p>
            </div>

            <div className="border-t border-border pt-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <EyeOff className="w-4 h-4 text-primary" />
                  <Label className="text-sm font-semibold">Hide asset</Label>
                </div>
                <Switch
                  checked={!!form.is_hidden}
                  onCheckedChange={(v) => {
                    if (v && editing && activeSessions[editing.id]) {
                      return toast.error("Asset cannot be hidden while a session is active.");
                    }
                    setForm({ ...form, is_hidden: v });
                  }}
                />
              </div>
              <p className="text-[11px] text-muted-foreground">
                Hidden assets are removed from the floor map and all selection lists, but stay here in Asset Management with their full history. Can't hide an asset with an active session.
              </p>
            </div>

            {isAdmin && (
              <div className="border-t border-border pt-3 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-primary" />
                    <Label className="text-sm font-semibold">Enable smart switch</Label>
                  </div>
                  <Switch checked={!!form.tuya_enabled} onCheckedChange={(v) => setForm({ ...form, tuya_enabled: v })} />
                </div>
                <p className="text-[11px] text-muted-foreground -mt-2">
                  Turn on only for assets controlled by a Tuya smart switch. Turning it off just hides these fields — saved values are kept.
                </p>
                {form.tuya_enabled && (
                  <>
                    <p className="text-[11px] text-muted-foreground">
                      Tuya secrets stay on the local Node server (server1.js). Here we only store the device id and a friendly name.
                    </p>
                    <div>
                      <Label className="text-xs">Device name (switch code)</Label>
                      <Input value={form.tuya_device_name} onChange={(e) => setForm({ ...form, tuya_device_name: e.target.value })} placeholder="e.g. switch_1" />
                    </div>
                    <div>
                      <Label className="text-xs">Tuya device ID</Label>
                      <Input value={form.tuya_device_id} onChange={(e) => setForm({ ...form, tuya_device_id: e.target.value })} placeholder="e.g. d72c845dc44b44912634yj" />
                    </div>
                    <div>
                      <Label className="text-xs">Local server URL override (optional)</Label>
                      <Input value={form.tuya_server_url} onChange={(e) => setForm({ ...form, tuya_server_url: e.target.value })} placeholder={savedGlobal || "uses global"} />
                    </div>
                  </>
                )}
              </div>
            )}

            <div className="border-t border-border pt-3 space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">Session time alert</Label>
                <Switch checked={!!form.alert_enabled} onCheckedChange={(v) => setForm({ ...form, alert_enabled: v })} />
              </div>
              <p className="text-[11px] text-muted-foreground -mt-2">
                Plays a beep when a session reaches its closing time. Uses the session's planned duration, or the fallback minutes below for open sessions.
              </p>
              {form.alert_enabled && (
                <div>
                  <Label className="text-xs">Alert time (minutes, fallback for open sessions)</Label>
                  <Input type="number" min={0} value={form.alert_minutes}
                    onChange={(e) => setForm({ ...form, alert_minutes: Number(e.target.value) })} placeholder="e.g. 60" />
                </div>
              )}
            </div>

            <Button onClick={save} className="w-full bg-gradient-primary text-primary-foreground">Save</Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmDel} onOpenChange={(o) => !o && setConfirmDel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure you want to permanently delete this asset?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove <b>{confirmDel?.name}</b> along with any active sessions, session items, transfer logs, and bookings linked to it.
              <br /><br />
              <span className="text-destructive font-semibold">This action cannot be undone.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={del} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!confirmReset} onOpenChange={(o) => !o && setConfirmReset(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Force reset session on {confirmReset?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Use this only if a session is stuck. The active session will be marked as <b>reset</b> (no payment recorded), the asset becomes available again, and the linked smart switch will be turned OFF.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={forceReset} className="bg-warning text-warning-foreground hover:bg-warning/90">
              Force reset
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default Assets;
