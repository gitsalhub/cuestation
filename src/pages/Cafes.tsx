import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import PageHeader from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Calendar, UserPlus, Copy, Trash2, KeyRound, LogIn, Undo2 } from "lucide-react";
import { toast } from "sonner";

const Cafes = () => {
  const [cafes, setCafes] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [name, setName] = useState("");
  const [expires, setExpires] = useState("");
  const [active, setActive] = useState(true);
  const [logoUrl, setLogoUrl] = useState("");
  const [uploadingLogo, setUploadingLogo] = useState(false);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [iEmail, setIEmail] = useState("");
  const [iFullName, setIFullName] = useState("");
  const [iCafeName, setICafeName] = useState("");
  const [iPassword, setIPassword] = useState("");
  const [iExpires, setIExpires] = useState("");
  const [iLoading, setILoading] = useState(false);
  const [createdCreds, setCreatedCreds] = useState<{ email: string; tempPassword: string } | null>(null);

  const [credsOpen, setCredsOpen] = useState<any>(null); // selected cafe for credentials dialog
  const [confirmDel, setConfirmDel] = useState<any>(null);
  const [resetOutput, setResetOutput] = useState<{ email: string; tempPassword: string } | null>(null);
  const [impersonating, setImpersonating] = useState(false);
  const [customPwd, setCustomPwd] = useState<Record<string, string>>({});

  // Detect saved super admin session for "Return to Super Admin"
  const [savedSuper, setSavedSuper] = useState<any>(null);
  useEffect(() => {
    const raw = localStorage.getItem("super_admin_session");
    if (raw) try { setSavedSuper(JSON.parse(raw)); } catch (_) {}
  }, []);

  const load = async () => {
    const { data: cafeRows } = await supabase.from("cafes").select("*").order("created_at", { ascending: false });
    const cafeList = cafeRows || [];
    const ids = cafeList.map((c: any) => c.id);
    let adminMap: Record<string, { id: string; email: string; full_name: string | null }[]> = {};
    if (ids.length) {
      const { data: profs } = await supabase.from("profiles").select("id, email, full_name, cafe_id").in("cafe_id", ids);
      const profIds = (profs || []).map((p: any) => p.id);
      const { data: roles } = profIds.length
        ? await supabase.from("user_roles").select("user_id, role").in("user_id", profIds)
        : { data: [] as any[] };
      const adminUserIds = new Set((roles || []).filter((r: any) => r.role === "admin").map((r: any) => r.user_id));
      for (const p of (profs || []) as any[]) {
        if (!adminUserIds.has(p.id)) continue;
        adminMap[p.cafe_id] = [...(adminMap[p.cafe_id] || []), { id: p.id, email: p.email, full_name: p.full_name }];
      }
    }
    setCafes(cafeList.map((c: any) => ({ ...c, admins: adminMap[c.id] || [] })));
  };
  useEffect(() => { load(); }, []);

  const totalCafes = cafes.length;
  const activeCafes = cafes.filter((c) => c.active && (!c.subscription_expires_at || new Date(c.subscription_expires_at) > new Date())).length;
  const expiringSoon = cafes.filter((c) => c.subscription_expires_at && new Date(c.subscription_expires_at) > new Date() && (new Date(c.subscription_expires_at).getTime() - Date.now()) < 7 * 86400000).length;

  const save = async () => {
    const payload: any = { name, active, subscription_expires_at: expires ? new Date(expires).toISOString() : null, logo_url: logoUrl || null };
    const { error } = editing
      ? await supabase.from("cafes").update(payload).eq("id", editing.id)
      : await supabase.from("cafes").insert(payload);
    if (error) return toast.error(error.message);
    toast.success("Saved"); setOpen(false); load();
  };

  const onLogoFile = async (file: File) => {
    if (!file) return;
    setUploadingLogo(true);
    try {
      const ext = file.name.split(".").pop() || "png";
      const path = `${editing?.id || "new"}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("cafe-logos").upload(path, file, { upsert: true });
      if (error) throw error;
      const { data } = supabase.storage.from("cafe-logos").getPublicUrl(path);
      setLogoUrl(data.publicUrl);
      toast.success("Logo uploaded");
    } catch (e: any) { toast.error(e.message || "Upload failed"); }
    finally { setUploadingLogo(false); }
  };

  const inviteAdmin = async () => {
    if (!iEmail || !iCafeName) return toast.error("Email and cafe name required");
    setILoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-cafe-admin", {
        body: {
          email: iEmail, fullName: iFullName, cafeName: iCafeName,
          password: iPassword || undefined,
          subscriptionExpiresAt: iExpires ? new Date(iExpires).toISOString() : null,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setCreatedCreds({ email: data.email, tempPassword: data.tempPassword });
      toast.success("Cafe admin created");
      setIEmail(""); setIFullName(""); setICafeName(""); setIPassword(""); setIExpires("");
      load();
    } catch (e: any) {
      toast.error(e.message || "Failed");
    } finally { setILoading(false); }
  };

  const deleteCafe = async () => {
    if (!confirmDel) return;
    const { data, error } = await supabase.functions.invoke("delete-cafe", { body: { cafeId: confirmDel.id } });
    if (error || data?.error) return toast.error(error?.message || data?.error || "Failed");
    toast.success("Cafe deleted");
    setConfirmDel(null); load();
  };

  const resetPassword = async (userId: string, email: string, password?: string) => {
    if (password && password.length < 8) return toast.error("Password must be at least 8 characters");
    const { data, error } = await supabase.functions.invoke("reset-cafe-admin-password", { body: { userId, password } });
    if (error || data?.error) return toast.error(error?.message || data?.error);
    setResetOutput({ email, tempPassword: data.tempPassword });
    setCustomPwd((m) => ({ ...m, [userId]: "" }));
    toast.success(password ? "Password set" : "Password reset");
  };

  const loginAsCafe = async (email: string) => {
    setImpersonating(true);
    try {
      // Save current super-admin session first
      const { data: sess } = await supabase.auth.getSession();
      if (sess?.session) {
        localStorage.setItem("super_admin_session", JSON.stringify({
          access_token: sess.session.access_token,
          refresh_token: sess.session.refresh_token,
        }));
      }
      const { data, error } = await supabase.functions.invoke("impersonate-cafe-admin", {
        body: { email, redirectTo: window.location.origin + "/" },
      });
      if (error || data?.error) {
        localStorage.removeItem("super_admin_session");
        throw new Error(error?.message || data?.error);
      }
      // Magic link will sign us in as the cafe admin
      window.location.href = data.actionLink;
    } catch (e: any) {
      toast.error(e.message || "Failed to impersonate");
    } finally { setImpersonating(false); }
  };

  const returnToSuperAdmin = async () => {
    const raw = localStorage.getItem("super_admin_session");
    if (!raw) return toast.error("No saved super admin session");
    const tokens = JSON.parse(raw);
    const { error } = await supabase.auth.setSession({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
    });
    if (error) return toast.error(error.message);
    localStorage.removeItem("super_admin_session");
    setSavedSuper(null);
    window.location.href = "/cafes";
  };

  const copy = (text: string) => { navigator.clipboard.writeText(text); toast.success("Copied"); };

  return (
    <>
      <PageHeader title="Cafes (Super Admin)" description="Manage all cafes and subscriptions"
        actions={
          <div className="flex gap-2 flex-wrap">
            {savedSuper && (
              <Button variant="outline" onClick={returnToSuperAdmin}>
                <Undo2 className="w-4 h-4 mr-1" />Return to Super Admin
              </Button>
            )}
            <Button variant="outline" onClick={() => { setCreatedCreds(null); setInviteOpen(true); }}>
              <UserPlus className="w-4 h-4 mr-1" />Create cafe admin
            </Button>
            <Button onClick={() => { setEditing(null); setName(""); setExpires(""); setActive(true); setLogoUrl(""); setOpen(true); }} className="bg-gradient-primary text-primary-foreground">
              <Plus className="w-4 h-4 mr-1" />Add cafe
            </Button>
          </div>
        } />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
        <Card className="glass-card p-4"><div className="text-xs text-muted-foreground">Total cafes</div><div className="text-2xl font-bold">{totalCafes}</div></Card>
        <Card className="glass-card p-4"><div className="text-xs text-muted-foreground">Active</div><div className="text-2xl font-bold text-success">{activeCafes}</div></Card>
        <Card className="glass-card p-4"><div className="text-xs text-muted-foreground">Expiring within 7 days</div><div className="text-2xl font-bold text-orange-500">{expiringSoon}</div></Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {cafes.map((c) => {
          const exp = c.subscription_expires_at ? new Date(c.subscription_expires_at) : null;
          const expired = exp && exp.getTime() < Date.now();
          return (
            <Card key={c.id} className="glass-card p-5">
              <div className="flex items-center justify-between mb-1">
                <div className="font-bold">{c.name}</div>
                <span className={`text-[10px] px-2 py-0.5 rounded ${c.active && !expired ? "bg-success/20 text-success" : "bg-destructive/20 text-destructive"}`}>
                  {c.active && !expired ? "Active" : "Inactive"}
                </span>
              </div>
              <div className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                <Calendar className="w-3 h-3" />
                {exp ? `Expires ${exp.toLocaleDateString()}` : "No expiry set"}
              </div>
              <div className="text-xs text-muted-foreground mb-3 truncate">
                Admin: {c.admins?.length ? c.admins.map((a: any) => a.email).join(", ") : "—"}
              </div>
              <div className="flex flex-wrap gap-1">
                <Button size="sm" variant="outline" onClick={() => {
                  setEditing(c); setName(c.name); setActive(c.active); setLogoUrl(c.logo_url || "");
                  setExpires(c.subscription_expires_at ? new Date(c.subscription_expires_at).toISOString().slice(0, 10) : "");
                  setOpen(true);
                }}>Edit</Button>
                <Button size="sm" variant="outline" onClick={() => { setResetOutput(null); setCredsOpen(c); }}>
                  <KeyRound className="w-3 h-3 mr-1" />Credentials
                </Button>
                <Button size="sm" variant="destructive" onClick={() => setConfirmDel(c)}>
                  <Trash2 className="w-3 h-3 mr-1" />Delete
                </Button>
              </div>
            </Card>
          );
        })}
        {cafes.length === 0 && <p className="text-muted-foreground">No cafes yet</p>}
      </div>

      {/* Create/Edit cafe */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="glass-card">
          <DialogHeader><DialogTitle>{editing ? "Edit" : "New"} cafe</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div><Label>Subscription expires</Label><Input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} /></div>
            <div className="flex items-center justify-between p-2 rounded border border-border">
              <Label>Active</Label>
              <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="w-5 h-5" />
            </div>
            <div className="space-y-2">
              <Label>Logo</Label>
              <div className="flex items-center gap-3">
                {logoUrl && <img src={logoUrl} alt="logo" className="w-14 h-14 rounded object-cover border border-border" />}
                <Input type="file" accept="image/*" disabled={uploadingLogo}
                  onChange={(e) => e.target.files?.[0] && onLogoFile(e.target.files[0])} />
                {logoUrl && <Button size="sm" variant="ghost" onClick={() => setLogoUrl("")}>Clear</Button>}
              </div>
            </div>
            <Button onClick={save} className="w-full bg-gradient-primary text-primary-foreground">Save</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Invite admin */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="glass-card">
          <DialogHeader><DialogTitle>Create cafe admin</DialogTitle></DialogHeader>
          {createdCreds ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Share these credentials with the new admin.</p>
              <div className="p-3 rounded border border-border bg-muted/30 text-sm font-mono">
                <div>Email: {createdCreds.email}</div>
                <div>Password: {createdCreds.tempPassword}</div>
              </div>
              <Button onClick={() => copy(`Email: ${createdCreds.email}\nPassword: ${createdCreds.tempPassword}`)} variant="outline" className="w-full"><Copy className="w-4 h-4 mr-1" />Copy</Button>
              <Button onClick={() => { setCreatedCreds(null); setInviteOpen(false); }} className="w-full bg-gradient-primary text-primary-foreground">Done</Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div><Label>Cafe name *</Label><Input value={iCafeName} onChange={(e) => setICafeName(e.target.value)} /></div>
              <div><Label>Admin full name</Label><Input value={iFullName} onChange={(e) => setIFullName(e.target.value)} /></div>
              <div><Label>Admin email *</Label><Input type="email" value={iEmail} onChange={(e) => setIEmail(e.target.value)} /></div>
              <div><Label>Temporary password (optional)</Label><Input value={iPassword} onChange={(e) => setIPassword(e.target.value)} placeholder="auto-generated if blank" /></div>
              <div><Label>Subscription expires</Label><Input type="date" value={iExpires} onChange={(e) => setIExpires(e.target.value)} /></div>
              <Button onClick={inviteAdmin} disabled={iLoading} className="w-full bg-gradient-primary text-primary-foreground">
                {iLoading ? "Creating..." : "Create admin & cafe"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Credentials view */}
      <Dialog open={!!credsOpen} onOpenChange={(o) => !o && (setCredsOpen(null), setResetOutput(null))}>
        <DialogContent className="glass-card max-w-lg">
          <DialogHeader><DialogTitle>Credentials — {credsOpen?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {(credsOpen?.admins || []).length === 0 && <p className="text-sm text-muted-foreground">No admins linked to this cafe.</p>}
            {(credsOpen?.admins || []).map((a: any) => (
              <div key={a.id} className="p-3 rounded border border-border space-y-2">
                <div className="text-sm font-mono">{a.email}</div>
                {a.full_name && <div className="text-xs text-muted-foreground">{a.full_name}</div>}
                <div className="flex flex-wrap gap-2 items-center">
                  <Input
                    type="text"
                    placeholder="New password (min 8 chars)"
                    value={customPwd[a.id] || ""}
                    onChange={(e) => setCustomPwd((m) => ({ ...m, [a.id]: e.target.value }))}
                    className="h-8 flex-1 min-w-[180px]"
                  />
                  <Button size="sm" variant="outline" onClick={() => resetPassword(a.id, a.email, customPwd[a.id])} disabled={!customPwd[a.id]}>
                    Set password
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => resetPassword(a.id, a.email)}>
                    <KeyRound className="w-3 h-3 mr-1" />Auto-reset
                  </Button>
                  <Button size="sm" disabled={impersonating} onClick={() => loginAsCafe(a.email)} className="bg-gradient-primary text-primary-foreground">
                    <LogIn className="w-3 h-3 mr-1" />Login as cafe
                  </Button>
                </div>
              </div>
            ))}
            {resetOutput && (
              <div className="p-3 rounded border border-success/40 bg-success/10 text-sm font-mono">
                <div>Email: {resetOutput.email}</div>
                <div>New password: {resetOutput.tempPassword}</div>
                <Button onClick={() => copy(`Email: ${resetOutput.email}\nPassword: ${resetOutput.tempPassword}`)} size="sm" variant="outline" className="mt-2"><Copy className="w-3 h-3 mr-1" />Copy</Button>
              </div>
            )}
            <p className="text-[10px] text-muted-foreground">
              Subscription: {credsOpen?.subscription_expires_at ? new Date(credsOpen.subscription_expires_at).toLocaleDateString() : "no expiry"} · {credsOpen?.active ? "Active" : "Inactive"}
            </p>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmDel} onOpenChange={(o) => !o && setConfirmDel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Permanently delete {confirmDel?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the cafe and ALL related data: assets, sessions, bills, products, expenses, bookings, staff, analytics, and admin accounts.
              <br /><br />
              <span className="text-destructive font-semibold">This action cannot be undone.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={deleteCafe} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default Cafes;
