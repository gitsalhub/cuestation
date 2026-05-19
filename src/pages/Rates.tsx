import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import PageHeader from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Edit2, Trash2, ChevronDown, ChevronRight, Users } from "lucide-react";
import { toast } from "sonner";

type Slab = { minutes: number; players: number; price: number };
type Rate = { id: string; name: string; hourly_rate: number; slabs: Slab[] };

const empty = { name: "", hourly_rate: 0, slabs: [] as Slab[] };

const Rates = () => {
  const { cafeId } = useAuth();
  const [rows, setRows] = useState<Rate[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Rate | null>(null);
  const [form, setForm] = useState<typeof empty>(empty);

  const load = async () => {
    if (!cafeId) return;
    const { data } = await supabase.from("rate_profiles").select("*").eq("cafe_id", cafeId).order("created_at", { ascending: false });
    setRows((data || []).map((r: any) => ({ ...r, slabs: Array.isArray(r.slabs) ? r.slabs : [] })));
  };
  useEffect(() => { load(); }, [cafeId]);

  const openNew = () => { setForm(empty); setEditing(null); setOpen(true); };
  const openEdit = (r: Rate) => {
    setForm({ name: r.name, hourly_rate: Number(r.hourly_rate || 0), slabs: r.slabs || [] });
    setEditing(r); setOpen(true);
  };

  // Group slabs by player
  const groupedPlayers = (() => {
    const ps = new Set<number>(form.slabs.map((s) => Number(s.players)));
    if (ps.size === 0) ps.add(1);
    return Array.from(ps).sort((a, b) => a - b);
  })();

  const addPlayerGroup = (players: number) => {
    if (form.slabs.some((s) => s.players === players)) return;
    setForm((f) => ({ ...f, slabs: [...f.slabs, { players, minutes: 60, price: 0 }] }));
  };
  const removePlayerGroup = (players: number) => {
    setForm((f) => ({ ...f, slabs: f.slabs.filter((s) => s.players !== players) }));
  };
  const addSlabToPlayer = (players: number) =>
    setForm((f) => ({ ...f, slabs: [...f.slabs, { players, minutes: 30, price: 0 }] }));
  const updateSlab = (idx: number, patch: Partial<Slab>) =>
    setForm((f) => ({ ...f, slabs: f.slabs.map((s, i) => i === idx ? { ...s, ...patch } : s) }));
  const removeSlab = (idx: number) =>
    setForm((f) => ({ ...f, slabs: f.slabs.filter((_, i) => i !== idx) }));

  const save = async () => {
    if (!cafeId || !form.name) return toast.error("Name required");
    const payload: any = {
      cafe_id: cafeId, name: form.name, pricing_type: "hourly",
      hourly_rate: Number(form.hourly_rate || 0),
      slabs: form.slabs.map((s) => ({ minutes: Number(s.minutes), players: Number(s.players), price: Number(s.price) })),
    };
    const { error } = editing
      ? await supabase.from("rate_profiles").update(payload).eq("id", editing.id)
      : await supabase.from("rate_profiles").insert(payload);
    if (error) return toast.error(error.message);
    toast.success("Saved"); setOpen(false); load();
  };

  const remove = async (id: string) => {
    if (!confirm("Delete?")) return;
    await supabase.from("rate_profiles").delete().eq("id", id);
    load();
  };

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const toggle = (id: string) => setExpanded((e) => ({ ...e, [id]: !e[id] }));

  return (
    <>
      <PageHeader title="Rate Profiles" description="Set time + price for each player count"
        actions={<Button onClick={openNew} className="bg-gradient-primary text-primary-foreground"><Plus className="w-4 h-4 mr-1" />Add</Button>} />

      {rows.length === 0 ? (
        <Card className="glass-card p-8 text-center text-muted-foreground">No rate profiles yet</Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {rows.map((r) => {
            const grouped: Record<number, Slab[]> = {};
            (r.slabs || []).forEach((s) => { (grouped[s.players] = grouped[s.players] || []).push(s); });
            const playerKeys = Object.keys(grouped).map(Number).sort((a, b) => a - b);
            const isOpen = !!expanded[r.id];
            return (
              <Card key={r.id} className="glass-card p-4 hover:border-primary/40 transition-colors">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold neon-text truncate">{r.name}</div>
                    {playerKeys.length === 0 && (
                      <div className="text-xs text-muted-foreground mt-1">Hourly: ₹{Number(r.hourly_rate).toFixed(2)}/hr</div>
                    )}
                  </div>
                  <div className="flex shrink-0">
                    <Button size="icon" variant="ghost" onClick={() => openEdit(r)}><Edit2 className="w-3.5 h-3.5" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => remove(r.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                  </div>
                </div>

                {playerKeys.length > 0 && (
                  <div className="mt-3 space-y-1.5">
                    {playerKeys.map((p) => {
                      const ss = [...grouped[p]].sort((a, b) => a.minutes - b.minutes);
                      const first = ss[0], last = ss[ss.length - 1];
                      return (
                        <div key={p} className="flex items-center justify-between text-sm bg-muted/20 rounded px-2.5 py-1.5">
                          <span className="flex items-center gap-1.5 text-muted-foreground">
                            <Users className="w-3 h-3" />{p}p
                          </span>
                          <span className="font-mono">
                            {first.minutes}m ₹{first.price}
                            {ss.length > 1 && <span className="text-muted-foreground"> → </span>}
                            {ss.length > 1 && <span>{last.minutes}m ₹{last.price}</span>}
                          </span>
                        </div>
                      );
                    })}
                    {(r.slabs || []).length > playerKeys.length && (
                      <button onClick={() => toggle(r.id)}
                        className="w-full flex items-center justify-center gap-1 text-xs text-primary hover:underline pt-1">
                        {isOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                        {isOpen ? "Hide all slabs" : `Show all ${(r.slabs || []).length} slabs`}
                      </button>
                    )}
                    {isOpen && (
                      <div className="mt-2 pt-2 border-t border-border space-y-1">
                        {playerKeys.map((p) => (
                          <div key={p}>
                            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">{p} player{p > 1 ? "s" : ""}</div>
                            <div className="flex flex-wrap gap-1">
                              {[...grouped[p]].sort((a, b) => a.minutes - b.minutes).map((s, i) => (
                                <span key={i} className="text-xs px-2 py-0.5 rounded bg-primary/10 border border-primary/20 font-mono">
                                  {s.minutes}m · ₹{s.price}
                                </span>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="glass-card max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Edit" : "New"} rate profile</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div>
              <Label>Hourly fallback (₹/hr)</Label>
              <Input type="number" step="0.01" value={form.hourly_rate} onChange={(e) => setForm({ ...form, hourly_rate: Number(e.target.value) })} />
              <p className="text-xs text-muted-foreground mt-1">Used only if no slab matches this player count.</p>
            </div>

            <div>
              <Label className="mb-2 block">Player counts</Label>
              <div className="flex gap-2 flex-wrap">
                {[1, 2, 3, 4].map((n) => (
                  <Button key={n} size="sm"
                    variant={groupedPlayers.includes(n) ? "default" : "outline"}
                    className={groupedPlayers.includes(n) ? "bg-gradient-primary text-primary-foreground" : ""}
                    onClick={() => groupedPlayers.includes(n) && form.slabs.some((s) => s.players === n) ? removePlayerGroup(n) : addPlayerGroup(n)}>
                    {n} player{n > 1 ? "s" : ""}
                  </Button>
                ))}
              </div>
            </div>

            {groupedPlayers.map((p) => (
              <div key={p} className="border border-border rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <Label className="font-semibold">{p} player{p > 1 ? "s" : ""}</Label>
                  <Button size="sm" variant="outline" onClick={() => addSlabToPlayer(p)}><Plus className="w-3 h-3 mr-1" />Add time slab</Button>
                </div>
                <div className="space-y-2">
                  {form.slabs.map((s, idx) => s.players !== p ? null : (
                    <div key={idx} className="grid grid-cols-12 gap-2 items-end">
                      <div className="col-span-5"><Label className="text-xs">Minutes</Label><Input type="number" value={s.minutes} onChange={(e) => updateSlab(idx, { minutes: Number(e.target.value) })} /></div>
                      <div className="col-span-6"><Label className="text-xs">Price (₹)</Label><Input type="number" step="0.01" value={s.price} onChange={(e) => updateSlab(idx, { price: Number(e.target.value) })} /></div>
                      <Button size="icon" variant="ghost" className="col-span-1" onClick={() => removeSlab(idx)}><Trash2 className="w-3 h-3" /></Button>
                    </div>
                  ))}
                  {!form.slabs.some((s) => s.players === p) && <p className="text-xs text-muted-foreground">No slabs yet</p>}
                </div>
              </div>
            ))}

            <Button onClick={save} className="w-full bg-gradient-primary text-primary-foreground">Save</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
export default Rates;
