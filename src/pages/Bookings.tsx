import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import PageHeader from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

const Bookings = () => {
  const { cafeId } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [assets, setAssets] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ asset_id: "", customer_name: "", customer_phone: "", booking_time: "", duration_minutes: 60, notes: "" });

  const load = async () => {
    if (!cafeId) return;
    const [{ data: bookings, error: be }, { data: a }] = await Promise.all([
      supabase.from("bookings").select("*").eq("cafe_id", cafeId).order("booking_time", { ascending: true }),
      supabase.from("assets").select("id, name, category").eq("cafe_id", cafeId).order("name"),
    ]);
    if (be) console.error("Bookings load error:", be);
    const assetMap = new Map((a || []).map((x: any) => [x.id, x]));
    setRows((bookings || []).map((b: any) => ({ ...b, assets: b.asset_id ? assetMap.get(b.asset_id) : null })));
    setAssets(a || []);
  };
  useEffect(() => { load(); }, [cafeId]);
  useEffect(() => {
    if (!cafeId) return;
    const ch = supabase.channel("bookings-page")
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [cafeId]);

  const save = async () => {
    if (!form.customer_name || !form.booking_time) return toast.error("Customer name & time required");
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("bookings").insert({
      cafe_id: cafeId,
      asset_id: form.asset_id || null,
      customer_name: form.customer_name,
      customer_phone: form.customer_phone || null,
      booking_time: new Date(form.booking_time).toISOString(),
      duration_minutes: Number(form.duration_minutes),
      notes: form.notes || null,
      created_by: user?.id,
    });
    if (error) return toast.error(error.message);
    toast.success("Booking created");
    setForm({ asset_id: "", customer_name: "", customer_phone: "", booking_time: "", duration_minutes: 60, notes: "" });
    setOpen(false); load();
  };

  const del = async (id: string) => {
    if (!confirm("Cancel booking?")) return;
    await supabase.from("bookings").delete().eq("id", id);
    load();
  };

  const updateStatus = async (id: string, status: string) => {
    await supabase.from("bookings").update({ status }).eq("id", id);
    load();
  };

  return (
    <>
      <PageHeader title="Bookings" description="Customer reservations"
        actions={<Button onClick={() => setOpen(true)} className="bg-gradient-primary text-primary-foreground"><Plus className="w-4 h-4 mr-1" />New booking</Button>} />
      <div className="grid gap-3">
        {rows.map((b) => {
          const time = new Date(b.booking_time);
          const past = time.getTime() < Date.now();
          return (
            <Card key={b.id} className="glass-card p-4 flex flex-wrap items-center gap-3">
              <div className="flex-1 min-w-[200px]">
                <div className="font-semibold">{b.customer_name} {b.customer_phone && <span className="text-xs text-muted-foreground">· {b.customer_phone}</span>}</div>
                <div className="text-xs text-muted-foreground">
                  {time.toLocaleString()} · {b.duration_minutes}min · {b.assets?.name || "Any asset"}
                </div>
                {b.notes && <div className="text-xs mt-1">{b.notes}</div>}
              </div>
              <Select value={b.status} onValueChange={(v) => updateStatus(b.id, v)}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="confirmed">Confirmed</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
              <span className={`text-[10px] px-2 py-1 rounded ${past ? "bg-muted/40 text-muted-foreground" : "bg-primary/20 text-primary"}`}>
                {past ? "Past" : "Upcoming"}
              </span>
              <Button size="icon" variant="ghost" onClick={() => del(b.id)}><Trash2 className="w-4 h-4" /></Button>
            </Card>
          );
        })}
        {rows.length === 0 && <p className="text-muted-foreground text-center py-8">No bookings yet</p>}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="glass-card">
          <DialogHeader><DialogTitle>New booking</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Customer name *</Label><Input value={form.customer_name} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} /></div>
            <div><Label>Phone</Label><Input value={form.customer_phone} onChange={(e) => setForm({ ...form, customer_phone: e.target.value })} /></div>
            <div>
              <Label>Asset</Label>
              <Select value={form.asset_id} onValueChange={(v) => setForm({ ...form, asset_id: v })}>
                <SelectTrigger><SelectValue placeholder="Any asset" /></SelectTrigger>
                <SelectContent>
                  {assets.map((a) => <SelectItem key={a.id} value={a.id}>{a.name} ({a.category})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Time *</Label><Input type="datetime-local" value={form.booking_time} onChange={(e) => setForm({ ...form, booking_time: e.target.value })} /></div>
            <div><Label>Duration (minutes)</Label><Input type="number" value={form.duration_minutes} onChange={(e) => setForm({ ...form, duration_minutes: Number(e.target.value) })} /></div>
            <div><Label>Notes</Label><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
            <Button onClick={save} className="w-full bg-gradient-primary text-primary-foreground">Create booking</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
export default Bookings;
