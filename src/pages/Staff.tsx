import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import PageHeader from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Copy, Trash2, Edit2 } from "lucide-react";
import { toast } from "sonner";

const PERMS = [
  { key: "dashboard", label: "Dashboard" },
  { key: "floor_map", label: "Floor Map" },
  { key: "sessions", label: "Sessions" },
  { key: "pending_payments", label: "Pending Payments" },
  { key: "bookings", label: "Bookings" },
  { key: "counter_sale", label: "Counter Sale" },
  { key: "expenses", label: "Expenses" },
  { key: "offers", label: "Offers" },
  { key: "transfers", label: "Transfers" },
  { key: "products", label: "Products" },
  { key: "assets", label: "Assets" },
  { key: "rate_profiles", label: "Rate Profiles" },
  { key: "analytics", label: "Analytics" },
  { key: "cash_drawer", label: "Cash Drawer" },
  { key: "bill_override", label: "Bill Override" },
] as const;

const Staff = () => {
  const { cafeId } = useAuth();
  const [staff, setStaff] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [perms, setPerms] = useState<Record<string, boolean>>({ floor_map: true, sessions: true, counter_sale: true });
  const [loading, setLoading] = useState(false);
  const [creds, setCreds] = useState<{ email: string; tempPassword: string } | null>(null);

  const load = async () => {
    if (!cafeId) return;
    const { data: profiles } = await supabase.from("profiles").select("id, full_name, email, cafe_id").eq("cafe_id", cafeId);
    if (!profiles) return setStaff([]);
    const ids = profiles.map((p) => p.id);
    if (ids.length === 0) return setStaff([]);
    const { data: roles } = await supabase.from("user_roles").select("user_id, role, permissions").in("user_id", ids);
    setStaff(profiles.map((p) => ({ ...p, role: roles?.find((r) => r.user_id === p.id) })));
  };
  useEffect(() => { load(); }, [cafeId]);

  const openNew = () => {
    setEditing(null); setEmail(""); setFullName(""); setPassword("");
    setPerms({ floor_map: true, sessions: true, counter_sale: true });
    setCreds(null); setOpen(true);
  };
  const openEdit = (s: any) => {
    setEditing(s); setFullName(s.full_name || ""); setEmail(s.email);
    setPerms(s.role?.permissions || {});
    setCreds(null); setOpen(true);
  };

  const submit = async () => {
    if (editing) {
      // update name + perms
      await supabase.from("profiles").update({ full_name: fullName }).eq("id", editing.id);
      await supabase.from("user_roles").update({ permissions: perms }).eq("user_id", editing.id).eq("role", "staff");
      toast.success("Staff updated");
      setOpen(false); load();
      return;
    }
    if (!email) return toast.error("Email required");
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-staff", {
        body: { email, fullName, password: password || undefined, permissions: perms },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setCreds({ email: data.email, tempPassword: data.tempPassword });
      setEmail(""); setFullName(""); setPassword("");
      load();
    } catch (e: any) {
      toast.error(e.message || "Failed");
    } finally { setLoading(false); }
  };

  const deleteStaff = async (s: any) => {
    if (!confirm(`Delete ${s.full_name || s.email}? This removes their access.`)) return;
    try {
      const { data, error } = await supabase.functions.invoke("delete-staff", { body: { userId: s.id } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success("Staff removed");
      load();
    } catch (e: any) { toast.error(e.message || "Failed to delete"); }
  };

  const togglePerm = async (s: any, key: string, value: boolean) => {
    const next = { ...(s.role?.permissions || {}), [key]: value };
    await supabase.from("user_roles").update({ permissions: next }).eq("user_id", s.id).eq("role", "staff");
    load();
  };

  const copyCreds = () => {
    if (!creds) return;
    navigator.clipboard.writeText(`Email: ${creds.email}\nPassword: ${creds.tempPassword}`);
    toast.success("Copied");
  };

  return (
    <>
      <PageHeader title="Staff" description="Manage staff accounts and permissions"
        actions={<Button onClick={openNew} className="bg-gradient-primary text-primary-foreground"><Plus className="w-4 h-4 mr-1" />Add staff</Button>} />
      <div className="space-y-3">
        {staff.map((s) => (
          <Card key={s.id} className="glass-card p-4">
            <div className="flex items-center justify-between mb-3 gap-2">
              <div>
                <div className="font-semibold">{s.full_name || s.email}</div>
                <div className="text-xs text-muted-foreground">{s.email} — {s.role?.role || "no role"}</div>
              </div>
              {s.role?.role === "staff" && (
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" onClick={() => openEdit(s)}><Edit2 className="w-4 h-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => deleteStaff(s)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                </div>
              )}
            </div>
            {s.role?.role === "staff" && (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {PERMS.map((p) => (
                  <div key={p.key} className="flex items-center justify-between gap-2 p-2 rounded border border-border">
                    <span className="text-xs">{p.label}</span>
                    <Switch checked={!!s.role?.permissions?.[p.key]} onCheckedChange={(v) => togglePerm(s, p.key, v)} />
                  </div>
                ))}
              </div>
            )}
          </Card>
        ))}
        {staff.length === 0 && <p className="text-muted-foreground">No staff yet</p>}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="glass-card">
          <DialogHeader><DialogTitle>{editing ? "Edit staff" : "Create staff account"}</DialogTitle></DialogHeader>
          {creds ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Share these credentials. They can change the password after signing in.</p>
              <div className="p-3 rounded border border-border bg-muted/30 text-sm font-mono">
                <div>Email: {creds.email}</div><div>Password: {creds.tempPassword}</div>
              </div>
              <Button onClick={copyCreds} variant="outline" className="w-full"><Copy className="w-4 h-4 mr-1" />Copy</Button>
              <Button onClick={() => { setCreds(null); setOpen(false); }} className="w-full bg-gradient-primary text-primary-foreground">Done</Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div><Label>Full name</Label><Input value={fullName} onChange={(e) => setFullName(e.target.value)} /></div>
              <div><Label>Email *</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={!!editing} /></div>
              {!editing && <div><Label>Temporary password (leave blank to auto-generate)</Label><Input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="min 8 chars" /></div>}
              <div>
                <Label className="mb-2 block">Permissions</Label>
                <div className="grid grid-cols-2 gap-2">
                  {PERMS.map((p) => (
                    <div key={p.key} className="flex items-center justify-between gap-2 p-2 rounded border border-border">
                      <span className="text-xs">{p.label}</span>
                      <Switch checked={!!perms[p.key]} onCheckedChange={(v) => setPerms((x) => ({ ...x, [p.key]: v }))} />
                    </div>
                  ))}
                </div>
              </div>
              <Button onClick={submit} disabled={loading} className="w-full bg-gradient-primary text-primary-foreground">
                {loading ? "Saving..." : editing ? "Update" : "Create staff"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default Staff;
