import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import PageHeader from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import NumberInput from "@/components/NumberInput";
import SessionInfoDialog from "@/components/SessionInfoDialog";
import { Wallet, Info, Search, Clock, IndianRupee } from "lucide-react";
import { toast } from "sonner";

type Row = {
  id: string;
  customer_name: string | null;
  started_at: string;
  ended_at: string | null;
  created_at: string;
  total_amount: number | null;
  override_amount: number | null;
  game_amount: number | null;
  items_amount: number | null;
  assets?: { name?: string; category?: string } | null;
};

const shortId = (id: string) => String(id).replace(/-/g, "").slice(0, 8).toUpperCase();
const fmtDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString() : "—");
const fmtAgo = (iso?: string | null) => {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ${mins % 60}m ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ${hrs % 24}h ago`;
};

const PendingPayments = () => {
  const { cafeId, user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [advMap, setAdvMap] = useState<Record<string, number>>({});
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);

  // dialogs
  const [infoId, setInfoId] = useState<string | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [collect, setCollect] = useState<Row | null>(null);
  const [payMethod, setPayMethod] = useState<"cash" | "upi" | "split">("cash");
  const [cashAmt, setCashAmt] = useState(0);
  const [upiAmt, setUpiAmt] = useState(0);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!cafeId) return;
    setLoading(true);
    const { data } = await supabase
      .from("sessions")
      .select("id, customer_name, started_at, ended_at, created_at, total_amount, override_amount, game_amount, items_amount, assets(name, category)")
      .eq("cafe_id", cafeId)
      .eq("status", "pending_payment")
      .order("ended_at", { ascending: false });
    const list = (data || []) as any as Row[];
    setRows(list);
    const ids = list.map((r) => r.id);
    if (ids.length) {
      const { data: advs } = await supabase.from("session_advances").select("session_id, amount").in("session_id", ids);
      const m: Record<string, number> = {};
      (advs || []).forEach((a: any) => { m[a.session_id] = (m[a.session_id] || 0) + Number(a.amount || 0); });
      setAdvMap(m);
    } else setAdvMap({});
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [cafeId]);

  const dueOf = (r: Row) => {
    const base = r.override_amount != null ? Number(r.override_amount) : Number(r.total_amount || 0);
    return Math.max(0, +(base - (advMap[r.id] || 0)).toFixed(2));
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      (r.customer_name || "").toLowerCase().includes(q) ||
      (r.assets?.name || "").toLowerCase().includes(q) ||
      shortId(r.id).toLowerCase().includes(q)
    );
  }, [rows, search]);

  const totalPending = useMemo(() => rows.reduce((s, r) => s + dueOf(r), 0), [rows, advMap]);

  const openCollect = (r: Row) => {
    const due = dueOf(r);
    setCollect(r);
    setPayMethod("cash");
    setCashAmt(due);
    setUpiAmt(0);
  };

  const due = collect ? dueOf(collect) : 0;

  const confirmCollect = async () => {
    if (!collect) return;
    let cash = 0, upi = 0;
    if (payMethod === "cash") { cash = due; upi = 0; }
    else if (payMethod === "upi") { upi = due; cash = 0; }
    else {
      cash = cashAmt; upi = upiAmt;
      if (Math.abs(cash + upi - due) > 0.01) return toast.error("Cash + UPI must equal amount due");
    }
    setSaving(true);
    const { error } = await supabase.from("sessions").update({
      status: "completed",
      payment_method: payMethod,
      cash_amount: cash,
      upi_amount: upi,
      payment_collected_at: new Date().toISOString(),
      payment_collected_by: user?.id || null,
    }).eq("id", collect.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(`Payment collected: ₹${due.toFixed(2)}`);
    setCollect(null);
    load();
  };

  return (
    <>
      <PageHeader title="Pending Payments" description="Sessions closed without payment — collect later" />

      <div className="grid grid-cols-2 gap-3 mb-4">
        <Card className="glass-card p-4">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground flex items-center gap-1">
            <IndianRupee className="w-3 h-3" /> Total Pending
          </div>
          <div className="text-2xl font-extrabold neon-text">₹{totalPending.toFixed(2)}</div>
        </Card>
        <Card className="glass-card p-4">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground flex items-center gap-1">
            <Clock className="w-3 h-3" /> Pending Sessions
          </div>
          <div className="text-2xl font-extrabold">{rows.length}</div>
        </Card>
      </div>

      <div className="relative mb-3 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Search customer, asset or ID…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <Card className="glass-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Session ID</TableHead>
              <TableHead>Asset</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Session Date</TableHead>
              <TableHead className="text-right">Amount Due</TableHead>
              <TableHead>Pending Since</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                  {loading ? "Loading…" : "No pending payments."}
                </TableCell>
              </TableRow>
            ) : filtered.map((r) => (
              <TableRow key={r.id} className="cursor-pointer" onClick={() => openCollect(r)}>
                <TableCell className="font-mono text-xs">{shortId(r.id)}</TableCell>
                <TableCell>{r.assets?.name || "—"}</TableCell>
                <TableCell>{r.customer_name || "Walk-in"}</TableCell>
                <TableCell>{fmtDate(r.ended_at || r.created_at)}</TableCell>
                <TableCell className="text-right font-semibold">₹{dueOf(r).toFixed(2)}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{fmtAgo(r.ended_at || r.created_at)}</TableCell>
                <TableCell><span className="text-[10px] uppercase tracking-wider text-orange-500 font-bold">Pending</span></TableCell>
                <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                  <div className="flex gap-1 justify-end">
                    <Button size="icon" variant="ghost" title="View details"
                      onClick={() => { setInfoId(r.id); setInfoOpen(true); }}>
                      <Info className="w-4 h-4" />
                    </Button>
                    <Button size="sm" className="bg-gradient-primary text-primary-foreground"
                      onClick={() => openCollect(r)}>
                      <Wallet className="w-4 h-4 mr-1" /> Collect
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <SessionInfoDialog sessionId={infoId} open={infoOpen} onOpenChange={setInfoOpen} />

      {/* Collect Payment dialog */}
      <Dialog open={!!collect} onOpenChange={(o) => !o && setCollect(null)}>
        <DialogContent className="glass-card">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Wallet className="w-4 h-4 text-primary" /> Collect Payment</DialogTitle>
          </DialogHeader>
          {collect && (
            <div className="space-y-4">
              <div className="rounded-xl border border-border bg-card/40 p-3 space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Session</span><span className="font-mono">{shortId(collect.id)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Asset</span><span>{collect.assets?.name || "—"}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Customer</span><span>{collect.customer_name || "Walk-in"}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Session Charges</span><span>₹{Number(collect.game_amount || 0).toFixed(2)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Product Charges</span><span>₹{Number(collect.items_amount || 0).toFixed(2)}</span></div>
                {!!(advMap[collect.id]) && <div className="flex justify-between"><span className="text-muted-foreground">Advance Paid</span><span>₹{(advMap[collect.id] || 0).toFixed(2)}</span></div>}
                {collect.override_amount != null && <div className="flex justify-between"><span className="text-muted-foreground">Override</span><span>₹{Number(collect.override_amount).toFixed(2)}</span></div>}
              </div>

              <div className="rounded-xl border border-border bg-card/40 p-3 space-y-2">
                <div className="grid grid-cols-3 gap-2">
                  {(["cash", "upi", "split"] as const).map((m) => (
                    <Button key={m} type="button" size="sm"
                      variant={payMethod === m ? "default" : "outline"}
                      className={payMethod === m ? "bg-gradient-primary text-primary-foreground" : ""}
                      onClick={() => {
                        setPayMethod(m);
                        if (m === "cash") { setCashAmt(due); setUpiAmt(0); }
                        else if (m === "upi") { setUpiAmt(due); setCashAmt(0); }
                        else { setCashAmt(0); setUpiAmt(due); }
                      }}>
                      {m === "cash" ? "Cash" : m === "upi" ? "UPI" : "Split"}
                    </Button>
                  ))}
                </div>
                {payMethod === "split" && (
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <NumberInput value={cashAmt} placeholder="Cash"
                      onChange={(v) => { const c = Math.max(0, Math.min(due, v)); setCashAmt(c); setUpiAmt(+(due - c).toFixed(2)); }} />
                    <NumberInput value={upiAmt} placeholder="UPI"
                      onChange={(v) => { const u = Math.max(0, Math.min(due, v)); setUpiAmt(u); setCashAmt(+(due - u).toFixed(2)); }} />
                    <div className="col-span-2 text-[10px] text-muted-foreground">
                      Sum: ₹{(cashAmt + upiAmt).toFixed(2)} / ₹{due.toFixed(2)}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Amount Due</div>
                  <div className="text-2xl font-extrabold neon-text">₹{due.toFixed(2)}</div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setCollect(null)}>Cancel</Button>
                  <Button onClick={confirmCollect} disabled={saving}
                    className="bg-gradient-primary text-primary-foreground">
                    {saving ? "Saving…" : "Mark as Paid"}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default PendingPayments;
