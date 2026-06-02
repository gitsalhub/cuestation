import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { priceWithSegments } from "@/lib/pricing";
import {
  Info, Gamepad2, Wallet, Tag, ShoppingBag, MoveRight, Clock,
  Users, Play, Square, BadgePercent,
} from "lucide-react";

type Props = {
  sessionId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const fmtTime = (iso?: string | null) => (iso ? new Date(iso).toLocaleString() : "—");
const fmtClock = (iso?: string | null) => (iso ? new Date(iso).toLocaleTimeString() : "—");
const fmtDuration = (ms: number) => {
  if (ms < 0) ms = 0;
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `${h}h ${m}m`;
};

const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="flex justify-between gap-3 py-1 text-sm">
    <span className="text-muted-foreground">{label}</span>
    <span className="font-medium text-right break-words">{value}</span>
  </div>
);

const SectionTitle = ({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) => (
  <div className="flex items-center gap-2 mb-1 text-muted-foreground text-[11px] uppercase tracking-wider">
    {icon} {children}
  </div>
);

const SessionInfoDialog = ({ sessionId, open, onOpenChange }: Props) => {
  const [loading, setLoading] = useState(false);
  const [session, setSession] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [advances, setAdvances] = useState<any[]>([]);
  const [rate, setRate] = useState<any>(null);
  const [offer, setOffer] = useState<any>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!open || !sessionId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: s } = await supabase
        .from("sessions")
        .select("*, assets(name, category, rate_profile_id)")
        .eq("id", sessionId)
        .maybeSingle();
      if (cancelled) return;
      setSession(s);
      const rid = (s as any)?.rate_profile_id || (s as any)?.assets?.rate_profile_id || null;
      const offerId = (s as any)?.applied_offer_id || (s as any)?.offer_id || null;
      const [{ data: it }, { data: adv }, rateRes, offerRes] = await Promise.all([
        supabase.from("session_items").select("*").eq("session_id", sessionId),
        supabase.from("session_advances").select("*").eq("session_id", sessionId).order("created_at"),
        rid ? supabase.from("rate_profiles").select("*").eq("id", rid).maybeSingle() : Promise.resolve({ data: null } as any),
        offerId ? supabase.from("offers").select("*").eq("id", offerId).maybeSingle() : Promise.resolve({ data: null } as any),
      ]);
      if (cancelled) return;
      setItems(it || []);
      setAdvances(adv || []);
      setRate(rateRes?.data || null);
      setOffer(offerRes?.data || null);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [open, sessionId]);

  // Live updates for active sessions.
  useEffect(() => {
    if (!open || session?.status !== "active") return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [open, session?.status]);

  if (!session) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="glass-card">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Info className="w-4 h-4" /> Session Information</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{loading ? "Loading…" : "No session selected."}</p>
        </DialogContent>
      </Dialog>
    );
  }

  const isActive = session.status === "active";
  const endTime = isActive ? now : (session.ended_at ? new Date(session.ended_at).getTime() : now);
  const startMs = new Date(session.started_at).getTime();
  const totalMs = endTime - startMs;

  const segments: any[] = Array.isArray(session.player_segments) && session.player_segments.length
    ? session.player_segments
    : [{ players: session.player_count || 1, started_at: session.started_at, ended_at: session.ended_at || null }];

  const transferHistory: any[] = Array.isArray(session.transfer_history) ? session.transfer_history : [];

  const itemsTotal = items.reduce((s, i) => s + Number(i.qty) * Number(i.price), 0);
  const advancesTotal = advances.reduce((s, a) => s + Number(a.amount || 0), 0);

  // Predicted bill (live) for active sessions; final stored amount otherwise.
  let predicted = 0;
  try {
    const segs = segments.map((s) => ({ players: Number(s.players), started_at: s.started_at, ended_at: s.ended_at || null }));
    predicted = priceWithSegments(rate as any, segs, session.player_count || 1, session.started_at, endTime, offer as any).game + itemsTotal;
  } catch { predicted = 0; }

  const grace = Math.max(0, Number(rate?.grace_minutes || 0));
  const coolMin = Math.max(0, Number(rate?.cooling_minutes || 0));
  const totalMinutes = Math.max(0, Math.round(totalMs / 60000));
  const coolingTriggered = coolMin > 0 && totalMinutes <= coolMin;

  // Build chronological events timeline.
  type Ev = { type: string; time: number | null; detail?: string; icon: React.ReactNode };
  const events: Ev[] = [];
  events.push({ type: "Session Started", time: startMs, detail: `${segments[0]?.players || session.player_count || 1} player(s)`, icon: <Play className="w-3.5 h-3.5 text-success" /> });
  for (let i = 1; i < segments.length; i++) {
    const seg = segments[i];
    events.push({ type: "Player Count Changed", time: seg.started_at ? new Date(seg.started_at).getTime() : null, detail: `Now ${seg.players} player(s)`, icon: <Users className="w-3.5 h-3.5 text-orange-500" /> });
  }
  transferHistory.forEach((h) => {
    events.push({ type: "Asset Shifted", time: h.time ? new Date(h.time).getTime() : null, detail: `${h.from || "?"} → ${h.to || "?"}`, icon: <MoveRight className="w-3.5 h-3.5 text-primary" /> });
  });
  if (offer) {
    events.push({ type: "Offer Applied", time: session.ended_at ? new Date(session.ended_at).getTime() : null, detail: offer.name, icon: <Tag className="w-3.5 h-3.5 text-success" /> });
  }
  if (session.override_amount != null) {
    events.push({ type: "Override Applied", time: session.ended_at ? new Date(session.ended_at).getTime() : null, detail: session.override_reason || undefined, icon: <BadgePercent className="w-3.5 h-3.5 text-orange-500" /> });
  }
  if (!isActive && session.ended_at) {
    events.push({ type: session.status === "transferred" ? "Session Transferred" : "Session Closed", time: new Date(session.ended_at).getTime(), detail: session.payment_method ? session.payment_method.toUpperCase() : undefined, icon: <Square className="w-3.5 h-3.5 text-destructive" /> });
  }
  events.sort((a, b) => (a.time || 0) - (b.time || 0));

  const shortId = String(session.id).replace(/-/g, "").slice(0, 8).toUpperCase();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-card max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Info className="w-4 h-4 text-primary" /> Session Information
            {isActive && <span className="text-[10px] uppercase tracking-widest text-success animate-pulse">live</span>}
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid grid-cols-4 w-full">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="billing">Billing</TabsTrigger>
            <TabsTrigger value="items">Items</TabsTrigger>
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
          </TabsList>

          {/* OVERVIEW */}
          <TabsContent value="overview" className="space-y-3">
            <div className="rounded-xl border border-border bg-card/40 p-3">
              <SectionTitle icon={<Gamepad2 className="w-3.5 h-3.5" />}>Basic Information</SectionTitle>
              <Row label="Session ID" value={<span className="font-mono">{shortId}</span>} />
              <Row label="Asset Name" value={session.assets?.name || "—"} />
              <Row label="Asset Category" value={<span className="capitalize">{session.assets?.category || "—"}</span>} />
              <Row label="Customer Name" value={session.customer_name || "Walk-in"} />
              <Row label="Start Time" value={fmtTime(session.started_at)} />
              <Row label="End Time" value={isActive ? "In progress" : fmtTime(session.ended_at)} />
              <Row label="Total Duration" value={fmtDuration(totalMs)} />
              <Row label="Closing Time Selected" value={session.planned_minutes ? `${session.planned_minutes} min` : "Open"} />
              <Row label="Current Status" value={<span className="uppercase">{session.status}</span>} />
            </div>
          </TabsContent>

          {/* BILLING */}
          <TabsContent value="billing" className="space-y-3">
            <div className="rounded-xl border border-border bg-card/40 p-3">
              <SectionTitle icon={<Wallet className="w-3.5 h-3.5" />}>Billing</SectionTitle>
              <Row label="Rate Profile Used" value={rate?.name || "—"} />
              <Row label={isActive ? "Predicted Bill Amount" : "Final Bill Amount"} value={`₹${(isActive ? predicted : Number(session.total_amount || 0)).toFixed(2)}`} />
              {!isActive && <Row label="Predicted (recomputed)" value={`₹${predicted.toFixed(2)}`} />}
              <Row label="Grace Period Applied" value={grace > 0 ? `${grace} min` : "No"} />
              <Row label="Cooling Startup Applied" value={coolMin > 0 ? `${coolMin} min ${coolingTriggered ? "(active)" : "(not triggered)"}` : "No"} />
              <Row label="Advance Amount" value={`₹${advancesTotal.toFixed(2)}`} />
              <Row label="Override Amount" value={session.override_amount != null ? `₹${Number(session.override_amount).toFixed(2)}` : "—"} />
              <Row label="Final Amount Collected" value={isActive ? "—" : `₹${(Number(session.cash_amount || 0) + Number(session.upi_amount || 0) + advancesTotal).toFixed(2)}`} />
              <Row label="Payment Method" value={session.payment_method ? session.payment_method.toUpperCase() : "—"} />
            </div>

            <div className="rounded-xl border border-border bg-card/40 p-3">
              <SectionTitle icon={<Users className="w-3.5 h-3.5" />}>Player Count History</SectionTitle>
              <div className="space-y-1 text-sm">
                {segments.map((s, i) => (
                  <div key={i} className="flex justify-between gap-2">
                    <span>{s.players} player(s)</span>
                    <span className="font-mono text-muted-foreground">{fmtClock(s.started_at)} — {s.ended_at ? fmtClock(s.ended_at) : "now"}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card/40 p-3">
              <SectionTitle icon={<Tag className="w-3.5 h-3.5" />}>Discount & Offer</SectionTitle>
              {offer ? (
                <>
                  <Row label="Offer Applied" value={offer.name} />
                  <Row label="Offer Type" value={<span className="capitalize">{String(offer.offer_type).replace("_", " ")}</span>} />
                  {offer.offer_type === "percentage" && <Row label="Percentage Discount" value={`${offer.value}%`} />}
                  {offer.offer_type === "fixed" && <Row label="Fixed Discount" value={`₹${Number(offer.value).toFixed(2)}`} />}
                  {offer.offer_type === "time_based" && <Row label="Free Minutes" value={`${offer.free_minutes || 0} min`} />}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">No offer applied.</p>
              )}
              <Row label="Discount Amount" value={`₹${Number(session.discount_amount || 0).toFixed(2)}`} />
            </div>
          </TabsContent>

          {/* ITEMS */}
          <TabsContent value="items" className="space-y-3">
            <div className="rounded-xl border border-border bg-card/40 p-3">
              <SectionTitle icon={<ShoppingBag className="w-3.5 h-3.5" />}>Products Purchased</SectionTitle>
              {items.length === 0 ? (
                <p className="text-sm text-muted-foreground">No products purchased.</p>
              ) : (
                <div className="space-y-1 text-sm">
                  {items.map((it, i) => (
                    <div key={i} className="flex justify-between gap-2">
                      <span className="truncate">{it.product_name} × {it.qty}</span>
                      <span className="font-mono">₹{Number(it.price).toFixed(2)} → ₹{(Number(it.qty) * Number(it.price)).toFixed(2)}</span>
                    </div>
                  ))}
                  <div className="border-t border-border/60 mt-1 pt-1 flex justify-between font-semibold">
                    <span>Total Product Value</span>
                    <span className="font-mono">₹{itemsTotal.toFixed(2)}</span>
                  </div>
                </div>
              )}
            </div>
          </TabsContent>

          {/* TIMELINE */}
          <TabsContent value="timeline" className="space-y-3">
            <div className="rounded-xl border border-border bg-card/40 p-3">
              <SectionTitle icon={<MoveRight className="w-3.5 h-3.5" />}>Asset Shift / Transfer History</SectionTitle>
              {transferHistory.length === 0 ? (
                <p className="text-sm text-muted-foreground">No transfers.</p>
              ) : (
                <div className="space-y-1 text-sm">
                  {transferHistory.map((h, i) => (
                    <div key={i} className="flex justify-between gap-2">
                      <span className="truncate">{h.from || "?"} → {h.to || "?"}</span>
                      <span className="font-mono text-muted-foreground">{fmtClock(h.time)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-border bg-card/40 p-3">
              <SectionTitle icon={<Clock className="w-3.5 h-3.5" />}>Session Events Timeline</SectionTitle>
              <div className="space-y-2">
                {events.map((ev, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm">
                    <div className="mt-0.5">{ev.icon}</div>
                    <div className="flex-1">
                      <div className="font-medium">{ev.type}</div>
                      {ev.detail && <div className="text-xs text-muted-foreground">{ev.detail}</div>}
                    </div>
                    <div className="font-mono text-xs text-muted-foreground shrink-0">{ev.time ? fmtClock(new Date(ev.time).toISOString()) : "—"}</div>
                  </div>
                ))}
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <p className="text-[10px] text-muted-foreground text-center">This panel is read-only.</p>
      </DialogContent>
    </Dialog>
  );
};

export default SessionInfoDialog;
