import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import PageHeader from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Gamepad2, Lock, Play, Square, Move, Clock, ShoppingBag, Plus, Minus, Trash2, ArrowLeftRight, Wallet, Tag, Users, X, MoveRight, Volume2, VolumeX, Info } from "lucide-react";
import { toast } from "sonner";
import NumberInput from "@/components/NumberInput";
import { priceWithSegments } from "@/lib/pricing";
import { applyTuyaForAsset } from "@/lib/tuya";
import SessionInfoDialog from "@/components/SessionInfoDialog";

type Slab = { minutes: number; players: number; price: number };
type Asset = {
  id: string; name: string; category: string; status: string;
  rate_profile_id: string | null;
  position_x: number; position_y: number; width: number; height: number;
  tuya_device_id?: string | null;
  tuya_device_name?: string | null;
  tuya_server_url?: string | null;
  tuya_state?: string | null;
  cafe_id?: string;
  alert_enabled?: boolean | null;
  alert_minutes?: number | null;
};
type Session = {
  id: string; asset_id: string; started_at: string; customer_name: string | null;
  player_count: number; planned_minutes: number | null;
  parent_session_id?: string | null;
  player_segments?: { players: number; started_at: string; ended_at?: string | null }[] | null;
  transfer_history?: { from?: string; to?: string; from_id?: string; to_id?: string; time?: string }[] | null;
  rate_profile_id?: string | null;
};
type Rate = {
  id: string;
  hourly_rate: number;
  slabs: Slab[];
  grace_minutes?: number | null;
  cooling_minutes?: number | null;
  cooling_amount?: number | null;
};
type Product = { id: string; name: string; price: number; stock: number; stock_threshold?: number };
type SessionItem = { id: string; session_id: string; product_id: string | null; product_name: string; qty: number; price: number };

const DURATIONS: { label: string; minutes: number | null }[] = [
  { label: "30 min", minutes: 30 },
  { label: "1 hr", minutes: 60 },
  { label: "1.5 hr", minutes: 90 },
  { label: "2 hr", minutes: 120 },
  { label: "2.5 hr", minutes: 150 },
  { label: "3 hr", minutes: 180 },
  { label: "Custom", minutes: -1 },
  { label: "Open", minutes: null },
];

const EXTEND_OPTIONS = [15, 30, 45, 60, 90, 120];

export const computePrice = (rate: Rate | undefined, players: number, elapsedMinutes: number): number => {
  if (!rate) return 0;
  const grace = Math.max(0, Number(rate.grace_minutes || 0));
  const slabs = (rate.slabs || []).filter((s) => Number(s.players) === players);
  if (slabs.length) {
    const sorted = [...slabs].sort((a, b) => a.minutes - b.minutes);
    // "₹price up to X minutes" with global grace delaying every slab transition.
    const band = sorted.find((s) => elapsedMinutes <= Number(s.minutes) + grace);
    if (band) return Number(band.price);
    return Number(sorted[sorted.length - 1].price);
  }
  return +(((rate.hourly_rate || 0) * (elapsedMinutes / 60)) * Math.max(1, players)).toFixed(2);
};

const FloorMap = () => {
  const { cafeId, role } = useAuth();
  const isAdmin = role === "admin" || role === "super_admin";
  const [assets, setAssets] = useState<Asset[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [rates, setRates] = useState<Rate[]>([]);
  const hasMultiPlayerRate = (rateId: string | null | undefined) => {
    const r = rates.find((x) => x.id === rateId);
    if (!r) return false;
    const set = new Set((r.slabs || []).map((s) => Number(s.players)));
    return set.size > 1;
  };
  // A session keeps its original rate profile even after it is shifted to
  // another asset; fall back to the asset's rate for older sessions.
  const rateForSession = (session: Session | null | undefined, asset: Asset | null | undefined) => {
    const rid = session?.rate_profile_id || asset?.rate_profile_id || null;
    return rates.find((r) => r.id === rid);
  };
  const [activeOffers, setActiveOffers] = useState<any[]>([]);
  const [now, setNow] = useState(Date.now());
  const [editMode, setEditMode] = useState(false);

  // Start
  const [startAsset, setStartAsset] = useState<Asset | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [players, setPlayers] = useState(1);
  const [durationLabel, setDurationLabel] = useState("1 hr");
  const [customMinutes, setCustomMinutes] = useState(60);

  // Extend
  const [extendAsset, setExtendAsset] = useState<Asset | null>(null);
  const [extendMinutes, setExtendMinutes] = useState(30);

  // Items
  const [productsAsset, setProductsAsset] = useState<Asset | null>(null);
  const [productsSession, setProductsSession] = useState<Session | null>(null);
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [sessionItems, setSessionItems] = useState<SessionItem[]>([]);

  // Transfer to other asset
  const [transferAsset, setTransferAsset] = useState<Asset | null>(null);
  const [transferSession, setTransferSession] = useState<Session | null>(null);
  const [transferTo, setTransferTo] = useState<string>("");
  const [transferPlayers, setTransferPlayers] = useState(1);
  const [transferDuration, setTransferDuration] = useState("1 hr");
  const [transferCustom, setTransferCustom] = useState(60);

  // End
  const [endingAsset, setEndingAsset] = useState<Asset | null>(null);
  const [endingSession, setEndingSession] = useState<Session | null>(null);
  const [endGame, setEndGame] = useState(0);
  const [endItems, setEndItems] = useState(0);
  const [endComputed, setEndComputed] = useState(0);
  const [endAmount, setEndAmount] = useState(0);
  const [overrideOn, setOverrideOn] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  const [endOfferId, setEndOfferId] = useState<string>("none");
  const [endOffers, setEndOffers] = useState<any[]>([]);
  const [payMethod, setPayMethod] = useState<"cash" | "upi" | "split">("cash");
  const [payChosen, setPayChosen] = useState(false);
  const [cashAmt, setCashAmt] = useState(0);
  const [upiAmt, setUpiAmt] = useState(0);
  const [chainSessionIds, setChainSessionIds] = useState<string[]>([]);
  const [chainAssetIds, setChainAssetIds] = useState<string[]>([]);
  const [endAdvances, setEndAdvances] = useState(0);
  const [endItemsList, setEndItemsList] = useState<{ name: string; qty: number; price: number }[]>([]);
  // Frozen context so an offer chosen at end re-computes against the same data.
  const [endCtx, setEndCtx] = useState<any>(null);
  const [endHistory, setEndHistory] = useState<{ from?: string; to?: string; time?: string }[]>([]);

  // Shift asset (move the live session to another asset without losing data)
  const [shiftAsset, setShiftAsset] = useState<Asset | null>(null);
  const [shiftSession, setShiftSession] = useState<Session | null>(null);
  const [shiftTo, setShiftTo] = useState<string>("");

  // ── Session time alerts ──
  const [mutedAlerts, setMutedAlerts] = useState<Record<string, number>>({});
  const audioCtxRef = useRef<AudioContext | null>(null);
  const beepTimerRef = useRef<any>(null);
  // Tracks which alert target we've already shown a background notification for.
  const notifiedRef = useRef<Record<string, number>>({});
  // Closing time the alert fires at: the session's planned end, else the asset default.
  const alertTarget = (a: Asset, session?: Session | null) =>
    Number(session?.planned_minutes || a.alert_minutes || 0);
  const isAlerting = (a: Asset, session?: Session | null) => {
    if (!a.alert_enabled || !session) return false;
    const target = alertTarget(a, session);
    if (target <= 0) return false;
    const elapsedMin = (now - new Date(session.started_at).getTime()) / 60000;
    // Re-fires when extended (target grows) because the muted threshold no longer matches.
    return elapsedMin >= target && mutedAlerts[a.id] !== target;
  };
  const toggleMuteAlert = (a: Asset, session?: Session | null) => {
    const target = alertTarget(a, session);
    setMutedAlerts((m) => {
      const next = { ...m };
      if (next[a.id] === target) delete next[a.id]; else next[a.id] = target;
      return next;
    });
  };

  // Details popup (clicking an active tile)
  const [detailsAsset, setDetailsAsset] = useState<Asset | null>(null);

  // Change players
  const [cpAsset, setCpAsset] = useState<Asset | null>(null);
  const [cpSession, setCpSession] = useState<Session | null>(null);
  const [cpPlayers, setCpPlayers] = useState(1);

  // Advance payment
  const [advAsset, setAdvAsset] = useState<Asset | null>(null);
  const [advSession, setAdvSession] = useState<Session | null>(null);
  const [advAmount, setAdvAmount] = useState(0);
  const [advMethod, setAdvMethod] = useState<"cash" | "upi">("cash");
  const [advCash, setAdvCash] = useState(0);
  const [advUpi, setAdvUpi] = useState(0);
  const [advExisting, setAdvExisting] = useState<any[]>([]);

  const containerRef = useRef<HTMLDivElement>(null);
  const [globalTuyaUrl, setGlobalTuyaUrl] = useState<string>("");
  const reconciledRef = useRef(false);

  const load = async () => {
    if (!cafeId) return;
    const [{ data: a }, { data: s }, { data: r }, { data: o }, { data: c }] = await Promise.all([
      supabase.from("assets").select("*").eq("cafe_id", cafeId).order("name"),
      supabase.from("sessions").select("id, asset_id, started_at, customer_name, player_count, planned_minutes, parent_session_id, player_segments, transfer_history, rate_profile_id").eq("cafe_id", cafeId).eq("status", "active"),
      supabase.from("rate_profiles").select("id, hourly_rate, slabs, grace_minutes, cooling_minutes, cooling_amount").eq("cafe_id", cafeId),
      supabase.from("offers").select("id, name, offer_type, value, min_minutes, free_minutes, conditions").eq("cafe_id", cafeId).eq("active", true),
      supabase.from("cafes").select("tuya_server_url").eq("id", cafeId).maybeSingle(),
    ]);
    const assetList = (a || []) as any[];
    const sessList = (s || []) as any[];
    setAssets(assetList as any);
    setSessions(sessList as any);
    setRates(((r || []) as any[]).map((x) => ({ ...x, slabs: Array.isArray(x.slabs) ? x.slabs : [] })));
    setActiveOffers((o || []) as any[]);
    const tuyaUrl = c?.tuya_server_url || "";
    setGlobalTuyaUrl(tuyaUrl);

    // One-time reconciliation: ensure linked devices for active sessions are ON
    if (!reconciledRef.current && assetList.length) {
      reconciledRef.current = true;
      const activeAssetIds = new Set(sessList.map((x: any) => x.asset_id));
      assetList
        .filter((as: any) => as.tuya_device_id && activeAssetIds.has(as.id) && as.tuya_state !== "on")
        .forEach((as: any) => { applyTuyaForAsset(as, true, tuyaUrl, "reconcile"); });
    }
  };

  useEffect(() => { load(); }, [cafeId]);

  // Beep continuously while any asset is alerting (and not muted); stop otherwise.
  useEffect(() => {
    const anyAlert = assets.some((a) => isAlerting(a, sessions.find((s) => s.asset_id === a.id)));
    if (anyAlert && !beepTimerRef.current) {
      const play = () => {
        try {
          const Ctx = (window.AudioContext || (window as any).webkitAudioContext);
          const ctx = audioCtxRef.current || new Ctx();
          audioCtxRef.current = ctx;
          const o = ctx.createOscillator(); const g = ctx.createGain();
          o.type = "square"; o.frequency.value = 880;
          o.connect(g); g.connect(ctx.destination);
          g.gain.setValueAtTime(0.0001, ctx.currentTime);
          g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02);
          g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
          o.start(); o.stop(ctx.currentTime + 0.37);
        } catch { /* audio not available */ }
      };
      play();
      beepTimerRef.current = setInterval(play, 1000);
    } else if (!anyAlert && beepTimerRef.current) {
      clearInterval(beepTimerRef.current); beepTimerRef.current = null;
    }
  }, [now, assets, sessions, mutedAlerts]);
  useEffect(() => () => { if (beepTimerRef.current) clearInterval(beepTimerRef.current); }, []);
  useEffect(() => {
    const ch = supabase.channel("floor")
      .on("postgres_changes", { event: "*", schema: "public", table: "assets" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "sessions" }, load)
      .subscribe();
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => { supabase.removeChannel(ch); clearInterval(t); };
  }, [cafeId]);

  const openStart = (a: Asset) => {
    setStartAsset(a); setCustomerName(""); setPlayers(1);
    setDurationLabel("1 hr"); setCustomMinutes(60);
  };

  const startSession = async () => {
    if (!startAsset || !cafeId) return;
    const { data: { user } } = await supabase.auth.getUser();
    const sel = DURATIONS.find((d) => d.label === durationLabel);
    let planned: number | null = sel?.minutes ?? null;
    if (planned === -1) planned = customMinutes > 0 ? customMinutes : null;
    const { error } = await supabase.from("sessions").insert({
      cafe_id: cafeId, asset_id: startAsset.id, customer_name: customerName || null,
      started_by: user?.id, status: "active",
      player_count: startAsset.category === "ps5" ? players : 1,
      planned_minutes: planned,
      rate_profile_id: startAsset.rate_profile_id || null,
    });
    if (error) return toast.error(error.message);
    await supabase.from("assets").update({ status: "occupied" }).eq("id", startAsset.id);
    // Smart switch ON (best-effort)
    {
      const { data: fresh } = await supabase.from("assets")
        .select("id, cafe_id, name, tuya_device_id, tuya_device_name, tuya_server_url")
        .eq("id", startAsset.id).maybeSingle();
      console.log("[tuya] session_start", fresh, "globalUrl:", globalTuyaUrl);
      if (fresh?.tuya_device_id) {
        const r = await applyTuyaForAsset(fresh as any, true, globalTuyaUrl, "session_start");
        if (!r.ok) toast.warning(`Smart switch ON failed: ${r.error}`);
      } else {
        toast.info("No smart switch linked to this asset");
      }
    }
    toast.success("Session started");
    setStartAsset(null); load();
  };

  const openChangePlayers = (a: Asset) => {
    const session = sessions.find((s) => s.asset_id === a.id);
    if (!session) return;
    setDetailsAsset(null);
    setCpAsset(a); setCpSession(session); setCpPlayers(session.player_count || 1);
  };
  const confirmChangePlayers = async () => {
    if (!cpSession) return;
    if (cpPlayers < 1) return toast.error("At least 1 player");
    if (cpPlayers === cpSession.player_count) { setCpAsset(null); return; }
    const nowIso = new Date().toISOString();
    const existing = (cpSession.player_segments || []) as any[];
    let segs = existing.length
      ? existing.map((s) => ({ ...s }))
      : [{ players: cpSession.player_count || 1, started_at: cpSession.started_at, ended_at: null }];
    // Close last open segment
    for (let i = segs.length - 1; i >= 0; i--) { if (!segs[i].ended_at) { segs[i].ended_at = nowIso; break; } }
    segs.push({ players: cpPlayers, started_at: nowIso, ended_at: null });
    const { error } = await supabase.from("sessions").update({ player_count: cpPlayers, player_segments: segs }).eq("id", cpSession.id);
    if (error) return toast.error(error.message);
    toast.success(`Players updated to ${cpPlayers}`);
    setCpAsset(null); setCpSession(null); load();
  };

  const openExtend = (a: Asset) => { setDetailsAsset(null); setExtendAsset(a); setExtendMinutes(30); };
  const confirmExtend = async () => {
    if (!extendAsset) return;
    const session = sessions.find((s) => s.asset_id === extendAsset.id);
    if (!session) return;
    // Always read the latest planned_minutes from DB so we add to the
    // originally selected/extended duration — never to the current elapsed time.
    const { data: fresh, error: fetchErr } = await supabase
      .from("sessions").select("planned_minutes").eq("id", session.id).maybeSingle();
    if (fetchErr) return toast.error(fetchErr.message);
    const basePlanned = Number(fresh?.planned_minutes ?? session.planned_minutes ?? 0);
    const newPlanned = basePlanned + extendMinutes;
    const { error } = await supabase.from("sessions").update({ planned_minutes: newPlanned }).eq("id", session.id);
    if (error) return toast.error(error.message);
    toast.success(`Extended by ${extendMinutes} min — total ${newPlanned} min`);
    setExtendAsset(null);
    load();
  };

  const openAdvance = async (a: Asset) => {
    const session = sessions.find((s) => s.asset_id === a.id);
    if (!session) return;
    setDetailsAsset(null);
    setAdvAsset(a); setAdvSession(session);
    setAdvAmount(0); setAdvMethod("cash"); setAdvCash(0); setAdvUpi(0);
    const { data } = await supabase.from("session_advances").select("*").eq("session_id", session.id).order("created_at");
    setAdvExisting(data || []);
  };
  const confirmAdvance = async () => {
    if (!advSession || !cafeId || advAmount <= 0) return toast.error("Enter an amount");
    const cash = advMethod === "cash" ? advAmount : 0;
    const upi = advMethod === "upi" ? advAmount : 0;
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("session_advances").insert({
      cafe_id: cafeId, session_id: advSession.id, amount: advAmount,
      payment_method: advMethod, cash_amount: cash, upi_amount: upi, created_by: user?.id,
    });
    if (error) return toast.error(error.message);
    toast.success(`Advance ₹${advAmount.toFixed(2)} recorded`);
    setAdvAsset(null); setAdvSession(null);
  };

  const [originalItemIds, setOriginalItemIds] = useState<string[]>([]);

  const openProducts = async (a: Asset) => {
    const session = sessions.find((s) => s.asset_id === a.id);
    if (!session || !cafeId) return;
    setDetailsAsset(null);
    setProductsAsset(a); setProductsSession(session);
    const [{ data: prods }, { data: items }] = await Promise.all([
      supabase.from("products").select("id, name, price, stock, stock_threshold").eq("cafe_id", cafeId).order("name"),
      supabase.from("session_items").select("*").eq("session_id", session.id),
    ]);
    setAllProducts((prods || []) as any);
    setSessionItems((items || []) as any);
    setOriginalItemIds((items || []).map((i: any) => i.id));
  };
  const addProduct = (p: Product) => {
    setSessionItems((cur) => {
      const existing = cur.find((i) => i.product_id === p.id);
      if (existing) {
        if (existing.qty + 1 > p.stock) { toast.error(`Only ${p.stock} in stock`); return cur; }
        return cur.map((i) => i.id === existing.id ? { ...i, qty: i.qty + 1 } : i);
      }
      if (p.stock < 1) { toast.error("Out of stock"); return cur; }
      return [...cur, { id: `tmp_${Date.now()}_${Math.random()}`, session_id: productsSession?.id || "", product_id: p.id, product_name: p.name, qty: 1, price: p.price } as SessionItem];
    });
  };
  const setItemQty = (item: SessionItem, qty: number) => {
    if (qty <= 0) {
      setSessionItems((cur) => cur.filter((i) => i.id !== item.id));
      return;
    }
    const prod = allProducts.find((p) => p.id === item.product_id);
    if (prod && qty > prod.stock) { toast.error(`Only ${prod.stock} in stock`); return; }
    setSessionItems((cur) => cur.map((i) => i.id === item.id ? { ...i, qty } : i));
  };
  const saveSessionItems = async () => {
    if (!productsSession) return;
    const sid = productsSession.id;
    const currentIds = sessionItems.filter((i) => !i.id.startsWith("tmp_")).map((i) => i.id);
    const toDelete = originalItemIds.filter((id) => !currentIds.includes(id));
    if (toDelete.length) await supabase.from("session_items").delete().in("id", toDelete);
    for (const i of sessionItems) {
      if (i.id.startsWith("tmp_")) {
        await supabase.from("session_items").insert({ session_id: sid, product_id: i.product_id, product_name: i.product_name, qty: i.qty, price: i.price });
      } else {
        await supabase.from("session_items").update({ qty: i.qty }).eq("id", i.id);
      }
    }
    toast.success("Items saved");
    setProductsAsset(null); setProductsSession(null);
  };

  // Transfer = continue current session on a new asset, defer payment
  const openTransfer = (a: Asset) => {
    const session = sessions.find((s) => s.asset_id === a.id);
    if (!session) return;
    setDetailsAsset(null);
    setTransferAsset(a); setTransferSession(session);
    setTransferTo(""); setTransferPlayers(1);
    setTransferDuration("1 hr"); setTransferCustom(60);
  };
  const confirmTransfer = async () => {
    if (!transferAsset || !transferSession || !transferTo || !cafeId) return;
    const target = assets.find((x) => x.id === transferTo);
    if (!target) return;
    const { data: { user } } = await supabase.auth.getUser();
    const sel = DURATIONS.find((d) => d.label === transferDuration);
    let planned: number | null = sel?.minutes ?? null;
    if (planned === -1) planned = transferCustom > 0 ? transferCustom : null;

    // 1. Mark current session as "transferred" — keep prices computed for its game time, items remain
    const rate = rates.find((r) => r.id === transferAsset.rate_profile_id);
    const elapsedMin = Math.max(1, Math.ceil((Date.now() - new Date(transferSession.started_at).getTime()) / 60000));
    const game = computePrice(rate, transferSession.player_count || 1, elapsedMin);
    const { data: items } = await supabase.from("session_items").select("qty, price").eq("session_id", transferSession.id);
    const itemsTotal = (items || []).reduce((s: number, i: any) => s + Number(i.qty) * Number(i.price), 0);

    await supabase.from("sessions").update({
      ended_at: new Date().toISOString(), status: "transferred",
      game_amount: game, items_amount: itemsTotal, total_amount: +(game + itemsTotal).toFixed(2),
      payment_method: "transfer",
    }).eq("id", transferSession.id);
    await supabase.from("assets").update({ status: "available" }).eq("id", transferAsset.id);

    // 2. Start new session linked to original
    await supabase.from("sessions").insert({
      cafe_id: cafeId, asset_id: target.id, customer_name: transferSession.customer_name,
      started_by: user?.id, status: "active",
      player_count: target.category === "ps5" ? transferPlayers : 1,
      planned_minutes: planned,
      parent_session_id: transferSession.id,
    });
    await supabase.from("assets").update({ status: "occupied" }).eq("id", target.id);

    await supabase.from("transfer_logs").insert({
      cafe_id: cafeId, session_id: transferSession.id,
      from_asset_id: transferAsset.id, to_asset_id: target.id, transferred_by: user?.id,
    });

    // Smart switch: OFF on source, ON on target (best-effort)
    if (transferAsset.tuya_device_id) {
      await applyTuyaForAsset(transferAsset as any, false, globalTuyaUrl, "transfer_out");
    }
    if (target.tuya_device_id) {
      const r = await applyTuyaForAsset(target as any, true, globalTuyaUrl, "transfer_in");
      if (!r.ok) toast.warning(`Smart switch ON failed on ${target.name}: ${r.error}`);
    }

    toast.success("Session transferred — bill carries forward");
    setTransferAsset(null); setTransferSession(null); load();
  };

  // ── Shift Asset: move the SAME live session to another asset (no data loss) ──
  const openShift = (a: Asset) => {
    const session = sessions.find((s) => s.asset_id === a.id);
    if (!session) return;
    setDetailsAsset(null);
    setShiftAsset(a); setShiftSession(session); setShiftTo("");
  };
  const confirmShift = async () => {
    if (!shiftAsset || !shiftSession || !shiftTo || !cafeId) return;
    const target = assets.find((x) => x.id === shiftTo);
    if (!target) return;
    if (target.id === shiftAsset.id) return toast.error("Pick a different asset");
    if (target.status !== "available") return toast.error("Destination asset is not available");
    const { data: { user } } = await supabase.auth.getUser();
    const hist = ((shiftSession.transfer_history || []) as any[]).map((h) => ({ ...h }));
    hist.push({ from: shiftAsset.name, to: target.name, from_id: shiftAsset.id, to_id: target.id, time: new Date().toISOString() });
    // Same session id, started_at, segments, items, advances — only the asset changes.
    const { error } = await supabase.from("sessions").update({ asset_id: target.id, transfer_history: hist }).eq("id", shiftSession.id);
    if (error) return toast.error(error.message);
    await supabase.from("assets").update({ status: "available" }).eq("id", shiftAsset.id);
    await supabase.from("assets").update({ status: "occupied" }).eq("id", target.id);
    await supabase.from("transfer_logs").insert({
      cafe_id: cafeId, session_id: shiftSession.id,
      from_asset_id: shiftAsset.id, to_asset_id: target.id, transferred_by: user?.id,
    });
    // Smart switch OFF on source, ON on target (best-effort)
    if (shiftAsset.tuya_device_id) await applyTuyaForAsset(shiftAsset as any, false, globalTuyaUrl, "shift_out");
    if (target.tuya_device_id) {
      const r = await applyTuyaForAsset(target as any, true, globalTuyaUrl, "shift_in");
      if (!r.ok) toast.warning(`Smart switch ON failed on ${target.name}: ${r.error}`);
    }
    toast.success(`Session shifted to ${target.name}`);
    setShiftAsset(null); setShiftSession(null); setShiftTo(""); load();
  };

  const beginEnd = async (asset: Asset) => {
    const session = sessions.find((s) => s.asset_id === asset.id);
    if (!session) return;
    setDetailsAsset(null);

    // Walk parent chain to collect all linked sessions for combined billing
    const chainIds: string[] = [session.id];
    const chainAssets: string[] = [asset.id];
    let parentId: string | null | undefined = session.parent_session_id;
    while (parentId) {
      const { data: parent } = await supabase.from("sessions").select("id, parent_session_id, asset_id").eq("id", parentId).maybeSingle();
      if (!parent) break;
      chainIds.push(parent.id);
      chainAssets.push(parent.asset_id);
      parentId = (parent as any).parent_session_id;
    }

    // Game amount for current (active) session — uses player segments if any
    const rate = rateForSession(session, asset);
    const endTime = Date.now();
    const segs = (session.player_segments || []).map((s) => ({ players: Number(s.players), started_at: s.started_at, ended_at: s.ended_at || null }));
    const { game: currentGame } = priceWithSegments(rate as any, segs, session.player_count || 1, session.started_at, endTime, null);

    // Pull all items for chain + parent transferred sessions' game/items totals
    const { data: items } = await supabase.from("session_items").select("product_name, qty, price, session_id").in("session_id", chainIds);
    const allItemsTotal = (items || []).reduce((s: number, i: any) => s + Number(i.qty) * Number(i.price), 0);
    setEndItemsList(((items || []) as any[]).map((i) => ({ name: i.product_name, qty: Number(i.qty), price: Number(i.price) })));

    let parentsGame = 0;
    if (chainIds.length > 1) {
      const parentIds = chainIds.slice(1);
      const { data: parents } = await supabase.from("sessions").select("game_amount").in("id", parentIds);
      parentsGame = (parents || []).reduce((s: number, p: any) => s + Number(p.game_amount || 0), 0);
    }

    const game = +(currentGame + parentsGame).toFixed(2);
    const total = +(game + allItemsTotal).toFixed(2);

    // Sum advances paid against this chain
    const { data: advs } = await supabase.from("session_advances").select("amount").in("session_id", chainIds);
    const advancesTotal = (advs || []).reduce((s: number, a: any) => s + Number(a.amount || 0), 0);
    const due = Math.max(0, +(total - advancesTotal).toFixed(2));

    setChainSessionIds(chainIds);
    setChainAssetIds(chainAssets);
    setEndingAsset(asset); setEndingSession(session);
    setEndGame(game); setEndItems(+allItemsTotal.toFixed(2));
    setEndAdvances(+advancesTotal.toFixed(2));
    setEndComputed(due); setEndAmount(due);
    setOverrideOn(false); setOverrideReason("");
    setEndOfferId("none");
    // Keep everything needed to re-price when an offer is picked at end.
    setEndCtx({ rate, segs, startedAt: session.started_at, endTime, players: session.player_count || 1, parentsGame, baseGame: game });
    setEndHistory(((session.transfer_history || []) as any[]).map((h) => ({ from: h.from, to: h.to, time: h.time })));
    if (cafeId) {
      const { data: offs } = await supabase.from("offers").select("id, name, offer_type, value, min_minutes, free_minutes").eq("cafe_id", cafeId).eq("active", true);
      const totalMin = Math.ceil((endTime - new Date(session.started_at).getTime()) / 60000);
      setEndOffers((offs || []).filter((o: any) => {
        if (o.offer_type === "time_based") {
          const m = Number(o.min_minutes || 0), f = Number(o.free_minutes || 0);
          // Free-minutes offer becomes selectable only after (playFor + free) minutes.
          return f > 0 && totalMin >= m + f;
        }
        return true;
      }));
    }
    setPayMethod("cash"); setPayChosen(false); setCashAmt(0); setUpiAmt(0);
  };

  const confirmEnd = async () => {
    if (!endingAsset || !endingSession) return;
    const grossTotal = +(endGame + endItems).toFixed(2);
    if (overrideOn) {
      const totalPaid = +(endAmount + endAdvances).toFixed(2);
      if (endAmount < 0) return toast.error("Override amount cannot be negative");
      if (totalPaid > grossTotal + 0.01) return toast.error(`Override (₹${totalPaid.toFixed(2)}) cannot exceed bill ₹${grossTotal.toFixed(2)}`);
    }
    let cash = 0, upi = 0;
    if (payMethod === "cash") cash = endAmount;
    else if (payMethod === "upi") upi = endAmount;
    else { cash = cashAmt; upi = upiAmt;
      if (Math.abs(cash + upi - endAmount) > 0.01) return toast.error("Cash + UPI must equal total");
    }

    // total_amount = gross bill (game + items), unaffected by override or advances.
    // override_amount (when set) = effective amount the customer paid in total
    //   (= what they pay at end + any advances already paid).
    // cash_amount / upi_amount = what was collected at end-of-session only.
    // Advances are tracked in session_advances and added on top in analytics.
    const effectivePaid = overrideOn ? +(endAmount + endAdvances).toFixed(2) : null;
    const { error: updErr } = await supabase.from("sessions").update({
      ended_at: new Date().toISOString(), status: "completed",
      game_amount: endGame, items_amount: endItems, total_amount: grossTotal,
      override_amount: effectivePaid,
      override_reason: overrideOn ? (overrideReason || null) : null,
      applied_offer_id: endOfferId !== "none" ? endOfferId : null,
      payment_method: payMethod, cash_amount: cash, upi_amount: upi,
    }).eq("id", endingSession.id);
    if (updErr) return toast.error(updErr.message);

    // Deduct stock for all items in chain
    const { data: items } = await supabase.from("session_items").select("product_id, qty").in("session_id", chainSessionIds);
    for (const it of (items || []) as any[]) {
      if (!it.product_id) continue;
      const { data: p } = await supabase.from("products").select("stock").eq("id", it.product_id).single();
      if (p) await supabase.from("products").update({ stock: Math.max(0, Number(p.stock) - Number(it.qty)) }).eq("id", it.product_id);
    }
    // Free all assets in chain
    await supabase.from("assets").update({ status: "available" }).in("id", chainAssetIds);

    // Smart switch OFF for every asset in the chain (best-effort)
    {
      const { data: freshAssets } = await supabase.from("assets")
        .select("id, cafe_id, name, tuya_device_id, tuya_device_name, tuya_server_url")
        .in("id", chainAssetIds);
      console.log("[tuya] session_end chain", freshAssets, "globalUrl:", globalTuyaUrl);
      for (const a of (freshAssets || []) as any[]) {
        if (!a.tuya_device_id) continue;
        const r = await applyTuyaForAsset(a, false, globalTuyaUrl, "session_end");
        if (!r.ok) toast.warning(`Smart switch OFF failed for ${a.name}: ${r.error}`);
      }
    }

    toast.success(`Session ended: ₹${endAmount.toFixed(2)}`);
    setEndingAsset(null); setEndingSession(null);
    setChainSessionIds([]); setChainAssetIds([]);
    load();
  };

  const toggleLock = async (asset: Asset) => {
    if (asset.status === "occupied") return toast.error("End session first");
    const next = asset.status === "locked" ? "available" : "locked";
    await supabase.from("assets").update({ status: next }).eq("id", asset.id);
  };

  const GRID = 20;
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [dragInfo, setDragInfo] = useState<{ id: string; mode: "move" | "resize"; x: number; y: number; w: number; h: number } | null>(null);
  const tileRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const dragRef = useRef<{
    id: string; mode: "move" | "resize"; startX: number; startY: number;
    origX: number; origY: number; origW: number; origH: number; el: HTMLDivElement; snap: boolean;
  } | null>(null);

  const snap = (v: number, on: boolean) => on ? Math.round(v / GRID) * GRID : Math.round(v);

  const onPointerDown = (e: React.PointerEvent, a: Asset, mode: "move" | "resize") => {
    if (!editMode || !isAdmin) return;
    e.preventDefault(); e.stopPropagation();
    const el = tileRefs.current[a.id];
    if (!el) return;
    dragRef.current = {
      id: a.id, mode, startX: e.clientX, startY: e.clientY,
      origX: a.position_x, origY: a.position_y, origW: a.width, origH: a.height, el, snap: snapToGrid,
    };
    el.style.transition = "none";
    el.style.zIndex = "50";
    setDragInfo({ id: a.id, mode, x: a.position_x, y: a.position_y, w: a.width, h: a.height });

    const move = (ev: PointerEvent) => {
      const d = dragRef.current; if (!d) return;
      const dx = ev.clientX - d.startX, dy = ev.clientY - d.startY;
      if (d.mode === "move") {
        const nx = Math.max(0, snap(d.origX + dx, d.snap));
        const ny = Math.max(0, snap(d.origY + dy, d.snap));
        d.el.style.left = `${nx}px`;
        d.el.style.top = `${ny}px`;
        setDragInfo({ id: d.id, mode: d.mode, x: nx, y: ny, w: d.origW, h: d.origH });
      } else {
        const nw = Math.max(80, snap(d.origW + dx, d.snap));
        const nh = Math.max(80, snap(d.origH + dy, d.snap));
        d.el.style.width = `${nw}px`;
        d.el.style.height = `${nh}px`;
        setDragInfo({ id: d.id, mode: d.mode, x: d.origX, y: d.origY, w: nw, h: nh });
      }
    };
    const up = async (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      const d = dragRef.current;
      dragRef.current = null;
      setDragInfo(null);
      if (!d) return;
      d.el.style.zIndex = "";
      const dx = ev.clientX - d.startX, dy = ev.clientY - d.startY;
      const next = d.mode === "move"
        ? { position_x: Math.max(0, snap(d.origX + dx, d.snap)), position_y: Math.max(0, snap(d.origY + dy, d.snap)), width: d.origW, height: d.origH }
        : { position_x: d.origX, position_y: d.origY, width: Math.max(80, snap(d.origW + dx, d.snap)), height: Math.max(80, snap(d.origH + dy, d.snap)) };
      setAssets((arr) => arr.map((a) => a.id === d.id ? { ...a, ...next } : a));
      const { error } = await supabase.from("assets").update(next).eq("id", d.id);
      if (error) toast.error(`Save failed: ${error.message}`);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };
  const onPointerMove = (_e: React.PointerEvent) => {};
  const onPointerUp = async (_e: React.PointerEvent) => {};

  const equalizeAssets = async () => {
    if (!assets.length) return;
    // Make all assets the same size as the first (or default 140), then auto-arrange in a grid.
    const W = assets[0].width || 140;
    const H = assets[0].height || 140;
    const GAP = GRID;
    const container = containerRef.current;
    const containerWidth = container?.clientWidth || 800;
    const cols = Math.max(1, Math.floor((containerWidth + GAP) / (W + GAP)));
    const updates = assets.map((a, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      return { id: a.id, position_x: col * (W + GAP), position_y: row * (H + GAP), width: W, height: H };
    });
    setAssets((arr) => arr.map((a) => {
      const u = updates.find((x) => x.id === a.id);
      return u ? { ...a, ...u } : a;
    }));
    for (const u of updates) {
      await supabase.from("assets").update({ position_x: u.position_x, position_y: u.position_y, width: u.width, height: u.height }).eq("id", u.id);
    }
    toast.success("Assets equalized and arranged on grid");
  };

  const formatElapsed = (started: string) => {
    const ms = now - new Date(started).getTime();
    const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), s = Math.floor((ms % 60000) / 1000);
    return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
  };

  const tileClass = (a: Asset) => {
    if (a.status === "locked") return "border-muted bg-muted/20 opacity-60";
    if (a.status === "available") return "border-success/50 bg-success/10 shadow-[0_0_18px_hsl(var(--success)/0.35)]";
    const session = sessions.find((s) => s.asset_id === a.id);
    if (session?.planned_minutes) {
      const elapsedMin = (now - new Date(session.started_at).getTime()) / 60000;
      const remaining = session.planned_minutes - elapsedMin;
      if (remaining <= 0) return "border-destructive bg-destructive/20 shadow-[0_0_28px_hsl(var(--destructive)/0.6)] animate-pulse";
      if (remaining <= 5) return "border-orange-500 bg-orange-500/15 shadow-[0_0_22px_hsl(25_95%_55%/0.55)]";
    }
    return "border-primary bg-primary/10 shadow-[0_0_22px_hsl(var(--primary)/0.5)]";
  };

  const eligibleOffers = (a: Asset, session: Session) => {
    const rate = rateForSession(session, a);
    const elapsedMin = Math.max(0, (now - new Date(session.started_at).getTime()) / 60000);
    const game = computePrice(rate, session.player_count || 1, Math.ceil(elapsedMin));
    return activeOffers.filter((o: any) => {
      if (o.offer_type === "time_based") {
        const m = Number(o.min_minutes || 0), f = Number(o.free_minutes || 0);
        // Available only after (playFor + free) minutes.
        return f > 0 && elapsedMin >= m + f;
      }
      const minMin = Number(o.min_minutes || 0);
      const minAmt = Number(o?.conditions?.min_amount || 0);
      if (minMin > 0 && elapsedMin < minMin) return false;
      if (minAmt > 0 && game < minAmt) return false;
      return minMin > 0 || minAmt > 0;
    });
  };

  const itemsCartTotal = sessionItems.reduce((s, i) => s + Number(i.qty) * Number(i.price), 0);

  return (
    <>
      <PageHeader title="Floor Map" description="Live status of all gaming assets"
        actions={isAdmin ? (
          <Button variant={editMode ? "default" : "outline"} onClick={() => setEditMode(!editMode)}>
            <Move className="w-4 h-4 mr-1" />{editMode ? "Done" : "Arrange"}
          </Button>
        ) : undefined} />

      {assets.length === 0 ? (
        <Card className="glass-card p-8 text-center text-muted-foreground">
          No assets yet. Go to Assets to add pool tables, consoles, PCs and more.
        </Card>
      ) : editMode ? (
        <Card className="glass-card p-4">
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <p className="text-xs text-muted-foreground flex-1 min-w-[200px]">Drag tiles to move. Drag bottom-right corner to resize. Tile size is shown live.</p>
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <Switch checked={snapToGrid} onCheckedChange={setSnapToGrid} />
              <span>Snap to {GRID}px grid</span>
            </label>
            <Button size="sm" variant="outline" onClick={equalizeAssets}>Equalize & arrange</Button>
          </div>
          <div ref={containerRef}
            className="relative bg-muted/10 rounded-lg overflow-hidden touch-none"
            style={{
              height: 600,
              backgroundImage: snapToGrid
                ? `linear-gradient(to right, hsl(var(--border) / 0.4) 1px, transparent 1px), linear-gradient(to bottom, hsl(var(--border) / 0.4) 1px, transparent 1px)`
                : undefined,
              backgroundSize: snapToGrid ? `${GRID}px ${GRID}px` : undefined,
            }}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}>
            {assets.map((a) => {
              const live = dragInfo?.id === a.id ? dragInfo : null;
              const w = live ? live.w : a.width;
              const h = live ? live.h : a.height;
              return (
                <div key={a.id}
                  ref={(el) => { tileRefs.current[a.id] = el; }}
                  onPointerDown={(e) => onPointerDown(e, a, "move")}
                  className={`absolute select-none cursor-move rounded-lg border-2 p-3 touch-none ${tileClass(a)}`}
                  style={{ left: a.position_x, top: a.position_y, width: a.width, height: a.height, willChange: "left, top, width, height" }}>
                  <div className="flex items-center justify-between">
                    <Gamepad2 className="w-5 h-5 text-primary" />
                    <span className="text-[10px] uppercase tracking-widest font-bold">{a.status}</span>
                  </div>
                  <div className="font-bold mt-2 text-sm">{a.name}</div>
                  <div className="text-xs text-muted-foreground capitalize">{a.category}</div>
                  <div className="absolute top-1 left-1/2 -translate-x-1/2 -translate-y-full bg-background/90 border border-primary/40 text-[10px] font-mono px-2 py-0.5 rounded shadow pointer-events-none whitespace-nowrap">
                    {live ? `${w} × ${h} px` : `${a.width} × ${a.height}`}
                  </div>
                  <div onPointerDown={(e) => onPointerDown(e, a, "resize")}
                    className="absolute bottom-0 right-0 w-5 h-5 cursor-nwse-resize bg-primary/40 rounded-tl touch-none" />
                </div>
              );
            })}
          </div>
        </Card>
      ) : (
        (() => {
          const maxBottom = assets.reduce((m, a) => Math.max(m, (a.position_y || 0) + (a.height || 140)), 0);
          return (
            <Card className="glass-card p-4">
              <div className="relative bg-muted/10 rounded-lg overflow-auto" style={{ minHeight: Math.max(600, maxBottom + 40) }}>
                {assets.map((a) => {
                  const session = sessions.find((s) => s.asset_id === a.id);
                  const isOccupied = a.status === "occupied" && !!session;
                  const onTileClick = () => {
                    if (a.status === "available") openStart(a);
                    else if (isOccupied) beginEnd(a);
                    else toggleLock(a);
                  };
                  return (
                    <button key={a.id} onClick={onTileClick} type="button"
                      className={`absolute text-left rounded-lg border-2 p-2 transition-all flex flex-col overflow-hidden hover:scale-[1.02] hover:shadow-[0_0_28px_hsl(var(--primary)/0.4)] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${tileClass(a)}`}
                      style={{ left: a.position_x || 0, top: a.position_y || 0, width: a.width || 200, height: a.height || 200 }}>
                      <div className="flex items-center justify-between mb-1 shrink-0">
                        <Gamepad2 className="w-5 h-5 text-primary" />
                        <span className="text-[10px] uppercase tracking-widest font-bold">{a.status}</span>
                      </div>
                      <div className="font-bold text-sm truncate shrink-0">{a.name}</div>
                      <div className="text-xs text-muted-foreground capitalize mb-1 truncate shrink-0">{a.category}</div>
                      {isAlerting(a, session) && (
                        <span role="button" tabIndex={0}
                          onClick={(e) => { e.stopPropagation(); toggleMuteAlert(a, session); }}
                          className="absolute top-1 right-1 z-10 text-destructive animate-pulse" title="Mute alert">
                          <Volume2 className="w-4 h-4" />
                        </span>
                      )}
                      {!isAlerting(a, session) && session && a.alert_enabled && mutedAlerts[a.id] === alertTarget(a, session) && (
                        <span role="button" tabIndex={0}
                          onClick={(e) => { e.stopPropagation(); toggleMuteAlert(a, session); }}
                          className="absolute top-1 right-1 z-10 text-muted-foreground" title="Unmute alert">
                          <VolumeX className="w-4 h-4" />
                        </span>
                      )}
                      {session && (() => {
                        const elapsedMin = (now - new Date(session.started_at).getTime()) / 60000;
                        const remaining = session.planned_minutes ? session.planned_minutes - elapsedMin : null;
                        return (
                          <div className="mb-1 p-1.5 rounded bg-background/50 flex-1 min-h-0 overflow-hidden">
                            <div className="text-xs text-muted-foreground flex justify-between gap-2">
                              <span className="truncate">{session.customer_name || "Walk-in"}</span>
                              <span className="flex items-center gap-1 shrink-0"><Users className="w-3 h-3" />{session.player_count}</span>
                            </div>
                            <div className="font-mono text-sm neon-text truncate">{formatElapsed(session.started_at)}</div>
                            {remaining !== null && (
                              <div className={`text-[10px] font-semibold ${remaining <= 0 ? "text-destructive" : remaining <= 5 ? "text-orange-500" : "text-muted-foreground"}`}>
                                {remaining > 0 ? `${Math.ceil(remaining)}m left` : `+${Math.ceil(-remaining)}m over`}
                              </div>
                            )}
                            {session.parent_session_id && (
                              <div className="text-[10px] text-accent truncate">↳ Continued bill</div>
                            )}
                            {(() => {
                              const offs = eligibleOffers(a, session);
                              if (!offs.length) return null;
                              return (
                                <div className="mt-0.5 flex items-center gap-1 text-[10px] text-success font-semibold animate-pulse">
                                  <Tag className="w-3 h-3" />
                                  <span className="truncate">{offs[0].name}{offs.length > 1 ? ` +${offs.length - 1}` : ""}</span>
                                </div>
                              );
                            })()}
                          </div>
                        );
                      })()}
                      {a.status === "available" && (
                        <div className="mt-auto text-[11px] text-success font-semibold flex items-center gap-1 shrink-0">
                          <Play className="w-3 h-3" /> Click to start
                        </div>
                      )}
                      {a.status === "locked" && (
                        <div className="mt-auto text-[11px] text-muted-foreground flex items-center gap-1 shrink-0">
                          <Lock className="w-3 h-3" /> Click to unlock
                        </div>
                      )}
                      {isOccupied && (
                        <div className="mt-auto text-[10px] text-primary/80 italic shrink-0 truncate">Tap for actions</div>
                      )}
                    </button>
                  );
                })}
              </div>
            </Card>
          );
        })()
      )}

      {/* Start session dialog */}
      <Dialog open={!!startAsset} onOpenChange={(o) => !o && setStartAsset(null)}>
        <DialogContent className="glass-card">
          <DialogHeader><DialogTitle>Start session — {startAsset?.name}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Customer name (optional)</Label>
              <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Walk-in" />
            </div>
            {startAsset?.category === "ps5" && hasMultiPlayerRate(startAsset?.rate_profile_id) && (
              <div>
                <Label>Number of players</Label>
                <div className="grid grid-cols-4 gap-2 mt-1">
                  {[1, 2, 3, 4].map((n) => (
                    <Button key={n} type="button" variant={players === n ? "default" : "outline"}
                      className={players === n ? "bg-gradient-primary text-primary-foreground" : ""}
                      onClick={() => setPlayers(n)}>{n}</Button>
                  ))}
                </div>
              </div>
            )}
            <div>
              <Label>Duration</Label>
              <div className="grid grid-cols-4 gap-2 mt-1">
                {DURATIONS.map((d) => (
                  <Button key={d.label} type="button" variant={durationLabel === d.label ? "default" : "outline"}
                    className={durationLabel === d.label ? "bg-gradient-primary text-primary-foreground" : ""}
                    onClick={() => setDurationLabel(d.label)}>{d.label}</Button>
                ))}
              </div>
              {durationLabel === "Custom" && (
                <Input type="number" min={1} className="mt-2" value={customMinutes}
                  onChange={(e) => setCustomMinutes(Number(e.target.value))} placeholder="Minutes" />
              )}
            </div>
            <Button onClick={startSession} className="w-full bg-gradient-primary text-primary-foreground">Start session</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Extend dialog */}
      <Dialog open={!!extendAsset} onOpenChange={(o) => !o && setExtendAsset(null)}>
        <DialogContent className="glass-card">
          <DialogHeader><DialogTitle>Extend session — {extendAsset?.name}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Add time (minutes)</Label>
              <div className="grid grid-cols-3 gap-2 mt-1">
                {EXTEND_OPTIONS.map((m) => (
                  <Button key={m} type="button" variant={extendMinutes === m ? "default" : "outline"}
                    className={extendMinutes === m ? "bg-gradient-primary text-primary-foreground" : ""}
                    onClick={() => setExtendMinutes(m)}>+{m}m</Button>
                ))}
              </div>
              <Input type="number" min={1} className="mt-2" value={extendMinutes}
                onChange={(e) => setExtendMinutes(Number(e.target.value))} placeholder="Custom minutes" />
            </div>
            <Button onClick={confirmExtend} className="w-full bg-gradient-primary text-primary-foreground">Extend</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Items dialog */}
      <Dialog open={!!productsAsset} onOpenChange={(o) => !o && (setProductsAsset(null), setProductsSession(null))}>
        <DialogContent className="glass-card max-w-2xl">
          <DialogHeader><DialogTitle>Items — {productsAsset?.name}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h4 className="text-sm font-semibold mb-2">Products</h4>
              <div className="grid grid-cols-2 gap-2 max-h-80 overflow-auto">
                {allProducts.filter((p) => p.stock > 0).map((p) => {
                  const lowStock = p.stock_threshold != null && p.stock <= p.stock_threshold;
                  return (
                    <button key={p.id} onClick={() => addProduct(p)}
                      className="text-left p-2 rounded-lg border border-border hover:border-primary/50 hover:bg-primary/5">
                      <div className="text-sm font-medium truncate">{p.name}</div>
                      <div className={`text-xs ${lowStock ? "text-orange-500 font-semibold" : "text-muted-foreground"}`}>
                        {lowStock ? `LOW STOCK (${p.stock})` : `Stock: ${p.stock}`}
                      </div>
                      <div className="text-primary font-bold text-sm">₹{Number(p.price).toFixed(2)}</div>
                    </button>
                  );
                })}
                {allProducts.filter((p) => p.stock > 0).length === 0 && <p className="text-xs text-muted-foreground col-span-2">No products in stock.</p>}
              </div>
            </div>
            <div>
              <h4 className="text-sm font-semibold mb-2">Added to session</h4>
              <div className="space-y-2 max-h-72 overflow-auto">
                {sessionItems.map((i) => (
                  <div key={i.id} className="flex items-center gap-2 text-sm">
                    <span className="flex-1 truncate">{i.product_name}</span>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setItemQty(i, i.qty - 1)}><Minus className="w-3 h-3" /></Button>
                    <span className="w-6 text-center">{i.qty}</span>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setItemQty(i, i.qty + 1)}><Plus className="w-3 h-3" /></Button>
                    <span className="w-16 text-right">₹{(i.qty * Number(i.price)).toFixed(2)}</span>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setItemQty(i, 0)}><Trash2 className="w-3 h-3" /></Button>
                  </div>
                ))}
                {sessionItems.length === 0 && <p className="text-xs text-muted-foreground">No items added.</p>}
              </div>
              <div className="mt-3 pt-3 border-t border-border flex justify-between font-semibold">
                <span>Items total</span>
                <span className="neon-text">₹{itemsCartTotal.toFixed(2)}</span>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">Items are billed when the session ends. Click <b>OK</b> to save changes.</p>
              <div className="flex gap-2 mt-3">
                <Button variant="outline" className="flex-1" onClick={() => { setProductsAsset(null); setProductsSession(null); }}>Cancel</Button>
                <Button className="flex-1 bg-gradient-primary text-primary-foreground" onClick={saveSessionItems}>OK</Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Transfer dialog */}
      <Dialog open={!!transferAsset} onOpenChange={(o) => !o && (setTransferAsset(null), setTransferSession(null))}>
        <DialogContent className="glass-card">
          <DialogHeader><DialogTitle>Transfer to another asset — {transferAsset?.name}</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground">Customer continues on a new asset. Bill carries forward and is paid when the next session ends.</p>
          <div className="space-y-3 mt-2">
            <div>
              <Label>Target asset</Label>
              <Select value={transferTo} onValueChange={setTransferTo}>
                <SelectTrigger><SelectValue placeholder="Pick an available asset" /></SelectTrigger>
                <SelectContent>
                  {assets.filter((a) => a.status === "available" && a.id !== transferAsset?.id).map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name} ({a.category})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {(() => {
              const target = assets.find((x) => x.id === transferTo);
              if (target?.category === "ps5") {
                return (
                  <div>
                    <Label>Players</Label>
                    <div className="grid grid-cols-4 gap-2 mt-1">
                      {[1,2,3,4].map((n) => (
                        <Button key={n} type="button" variant={transferPlayers === n ? "default" : "outline"}
                          className={transferPlayers === n ? "bg-gradient-primary text-primary-foreground" : ""}
                          onClick={() => setTransferPlayers(n)}>{n}</Button>
                      ))}
                    </div>
                  </div>
                );
              }
              return null;
            })()}
            <div>
              <Label>Duration</Label>
              <div className="grid grid-cols-4 gap-2 mt-1">
                {DURATIONS.map((d) => (
                  <Button key={d.label} type="button" variant={transferDuration === d.label ? "default" : "outline"}
                    className={transferDuration === d.label ? "bg-gradient-primary text-primary-foreground" : ""}
                    onClick={() => setTransferDuration(d.label)}>{d.label}</Button>
                ))}
              </div>
              {transferDuration === "Custom" && (
                <Input type="number" min={1} className="mt-2" value={transferCustom}
                  onChange={(e) => setTransferCustom(Number(e.target.value))} />
              )}
            </div>
            <Button onClick={confirmTransfer} disabled={!transferTo} className="w-full bg-gradient-primary text-primary-foreground">
              Transfer
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* End session dialog */}
      <Dialog open={!!endingAsset} onOpenChange={(o) => !o && setEndingAsset(null)}>
        <DialogContent className="glass-card max-h-[92vh] flex flex-col p-0 sm:max-w-2xl">
          {endingAsset && endingSession && (() => {
            const shortId = endingSession.id.replace(/-/g, "").slice(0, 8).toUpperCase();
            const gross = +(endGame + endItems).toFixed(2);
            const payable = endAmount;
            const tile = (icon: any, label: string, sub: string, accent: string, onClick: () => void, disabled = false) => (
              <button type="button" onClick={onClick} disabled={disabled}
                className="rounded-lg border border-border bg-card/40 hover:bg-card/70 hover:border-primary/50 transition-all p-2 flex flex-col items-center justify-center gap-0.5 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-card/40 disabled:hover:border-border">
                <div className={accent}>{icon}</div>
                <div className="text-xs font-semibold">{label}</div>
                <div className="text-[9px] text-muted-foreground">{sub}</div>
              </button>
            );
            return (
              <>
                {/* Header */}
                <DialogHeader className="p-3 pb-2 border-b border-border shrink-0">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center">
                        <Gamepad2 className="w-4 h-4 text-primary" />
                      </div>
                      <div>
                        <DialogTitle className="text-base">{endingAsset.name}</DialogTitle>
                        <div className="text-[10px] text-muted-foreground font-mono">{shortId}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[9px] uppercase tracking-widest text-muted-foreground">Duration</div>
                      <div className="text-xl font-mono neon-text">{formatElapsed(endingSession.started_at)}</div>
                    </div>
                  </div>
                </DialogHeader>

                <div className="overflow-y-auto px-3 py-3 flex-1 space-y-3">
                  {/* Bill details + Ordered items */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <div className="rounded-xl border border-border bg-card/40 p-3">
                      <div className="flex items-center gap-2 mb-2 text-muted-foreground text-[11px] uppercase tracking-wider">
                        <Wallet className="w-3.5 h-3.5" /> Bill Details
                      </div>
                      <div className="flex justify-between py-1 text-sm">
                        <span className="font-semibold">Session Cost</span>
                        <span className="font-mono">₹{endGame.toFixed(2)}</span>
                      </div>
                      <div className="h-px bg-border/60 my-1" />
                      {endAdvances > 0 && (
                        <div className="flex justify-between py-1 text-sm text-success">
                          <span>Advance paid</span>
                          <span className="font-mono">− ₹{endAdvances.toFixed(2)}</span>
                        </div>
                      )}
                      <div className="flex justify-between py-1 text-sm">
                        <span className="font-semibold">Original Total</span>
                        <span className="font-mono">₹{gross.toFixed(2)}</span>
                      </div>
                      {chainSessionIds.length > 1 && (
                        <p className="text-[10px] text-accent mt-1">Combined across {chainSessionIds.length} sessions (transfer).</p>
                      )}
                    </div>
                    <div className="rounded-xl border border-border bg-card/40 p-3 flex flex-col">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2 text-muted-foreground text-[11px] uppercase tracking-wider">
                          <ShoppingBag className="w-3.5 h-3.5" /> Ordered Items
                        </div>
                        <Button size="sm" variant="outline" className="h-6 px-2 text-xs"
                          onClick={() => { const a = endingAsset; setEndingAsset(null); openProducts(a); }}>
                          <Plus className="w-3 h-3 mr-1" /> Add
                        </Button>
                      </div>
                      {endItemsList.length === 0 ? (
                        <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground py-2">
                          <ShoppingBag className="w-6 h-6 opacity-30 mb-1" />
                          <p className="text-[11px]">No items added</p>
                        </div>
                      ) : (
                        <div className="flex-1 max-h-24 overflow-auto space-y-1 text-xs">
                          {endItemsList.map((it, i) => (
                            <div key={i} className="flex justify-between">
                              <span className="truncate">{it.name} × {it.qty}</span>
                              <span className="font-mono">₹{(it.qty * it.price).toFixed(2)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="border-t border-border/60 mt-1 pt-1 flex justify-between text-sm">
                        <span className="text-muted-foreground">Items Total</span>
                        <span className="font-mono">₹{endItems.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Action tiles */}
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                    {tile(<Clock className="w-4 h-4" />, "Extend", "Session Timer", "text-primary",
                      () => { const a = endingAsset; setEndingAsset(null); openExtend(a); })}
                    {tile(<ArrowLeftRight className="w-4 h-4" />, "Transfer", "Move Asset", "text-accent",
                      () => { const a = endingAsset; setEndingAsset(null); openTransfer(a); })}
                    {tile(<MoveRight className="w-4 h-4" />, "Shift", "Same Session", "text-primary",
                      () => { const a = endingAsset; setEndingAsset(null); openShift(a); })}
                    {tile(<Users className="w-4 h-4" />, `Players (${endingSession.player_count})`, "Change Count", "text-orange-500",
                      () => { const a = endingAsset; setEndingAsset(null); openChangePlayers(a); }, !hasMultiPlayerRate(endingAsset?.rate_profile_id))}
                    {tile(<Wallet className="w-4 h-4" />, "Advance", "Add Payment", "text-success",
                      () => { const a = endingAsset; setEndingAsset(null); openAdvance(a); })}
                  </div>

                  {/* Transfer history */}
                  {endHistory.length > 0 && (
                    <div className="rounded-xl border border-border bg-card/40 p-3">
                      <div className="flex items-center gap-2 mb-1 text-muted-foreground text-[11px] uppercase tracking-wider">
                        <MoveRight className="w-3.5 h-3.5" /> Transfer History
                      </div>
                      <div className="space-y-1 text-xs">
                        {endHistory.map((h, i) => (
                          <div key={i} className="flex justify-between gap-2">
                            <span className="truncate">{h.from || "?"} → {h.to || "?"}</span>
                            <span className="font-mono text-muted-foreground shrink-0">{h.time ? new Date(h.time).toLocaleTimeString() : ""}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Offer (optional) */}
                  {endOffers.length > 0 && (
                    <div className="rounded-xl border border-border bg-card/40 p-3">
                      <Label className="text-xs flex items-center gap-1"><Tag className="w-3 h-3" /> Offer (optional)</Label>
                      <Select value={endOfferId} onValueChange={(v) => {
                        setEndOfferId(v);
                        const off = endOffers.find((o: any) => o.id === v);
                        // Free-minutes offers reduce billable DURATION → recompute the
                        // game cost from scratch. Fixed / percentage discount the total.
                        let game = endCtx?.baseGame ?? endGame;
                        if (off?.offer_type === "time_based" && endCtx) {
                          const cg = priceWithSegments(endCtx.rate, endCtx.segs, endCtx.players, endCtx.startedAt, endCtx.endTime, off).game;
                          game = +(cg + (endCtx.parentsGame || 0)).toFixed(2);
                        }
                        setEndGame(game);
                        let total = game + endItems;
                        if (off) {
                          if (off.offer_type === "percentage") total = total - (total * Number(off.value) / 100);
                          else if (off.offer_type === "fixed") total = Math.max(0, total - Number(off.value));
                        }
                        const final = +Math.max(0, total - endAdvances).toFixed(2);
                        setEndComputed(final);
                        if (!overrideOn) {
                          setEndAmount(final);
                          if (payMethod === "cash") setCashAmt(final);
                          else if (payMethod === "upi") setUpiAmt(final);
                        }
                      }}>
                        <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No offer</SelectItem>
                          {endOffers.map((o: any) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* Override + Payment Method */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="rounded-xl border border-border bg-card/40 p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm font-semibold">Bill Override</Label>
                        <Switch checked={overrideOn} onCheckedChange={(v) => {
                          setOverrideOn(v);
                          if (!v) { setEndAmount(endComputed); setCashAmt(payMethod === "cash" ? endComputed : 0); setUpiAmt(payMethod === "upi" ? endComputed : 0); setOverrideReason(""); }
                        }} />
                      </div>
                      <Input type="number" step="0.01" placeholder="₹ New Amount" value={overrideOn ? endAmount : ""}
                        disabled={!overrideOn}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          setEndAmount(v);
                          if (payChosen) {
                            if (payMethod === "cash") setCashAmt(v);
                            if (payMethod === "upi") setUpiAmt(v);
                          }
                        }}
                        className="bg-background/60" />
                      {overrideOn && (
                        <Input value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)}
                          placeholder="Reason (optional)" className="bg-background/60 text-xs" />
                      )}
                    </div>
                    <div className="rounded-xl border border-border bg-card/40 p-3 space-y-2">
                      <Label className="text-sm font-semibold">Payment Method <span className="text-destructive">*</span></Label>
                      <div className="grid grid-cols-3 gap-2">
                        {(["cash", "upi", "split"] as const).map((m) => (
                          <Button key={m} type="button" size="sm"
                            variant={payChosen && payMethod === m ? "default" : "outline"}
                            className={payChosen && payMethod === m ? "bg-gradient-primary text-primary-foreground" : ""}
                            onClick={() => {
                              setPayMethod(m); setPayChosen(true);
                              if (m === "cash") { setCashAmt(endAmount); setUpiAmt(0); }
                              else if (m === "upi") { setUpiAmt(endAmount); setCashAmt(0); }
                              else { setCashAmt(0); setUpiAmt(endAmount); }
                            }}>
                            {m === "cash" ? "Cash" : m === "upi" ? "UPI" : "Split"}
                          </Button>
                        ))}
                      </div>
                      {payChosen && payMethod === "split" && (
                        <div className="grid grid-cols-2 gap-2 pt-1">
                          <NumberInput value={cashAmt} placeholder="Cash"
                            onChange={(v) => { const c = Math.max(0, Math.min(endAmount, v)); setCashAmt(c); setUpiAmt(+(endAmount - c).toFixed(2)); }} />
                          <NumberInput value={upiAmt} placeholder="UPI"
                            onChange={(v) => { const u = Math.max(0, Math.min(endAmount, v)); setUpiAmt(u); setCashAmt(+(endAmount - u).toFixed(2)); }} />
                          <div className="col-span-2 text-[10px] text-muted-foreground">
                            Sum: ₹{(cashAmt + upiAmt).toFixed(2)} / ₹{endAmount.toFixed(2)}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Footer */}
                <div className="border-t border-border p-4 shrink-0 flex flex-wrap items-center justify-between gap-3 bg-card/60">
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Total Payable</div>
                    <div className="text-3xl font-extrabold neon-text">₹{payable.toFixed(2)}</div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setEndingAsset(null)}>Keep Open</Button>
                    <Button onClick={confirmEnd} disabled={!payChosen}
                      className="bg-gradient-primary text-primary-foreground disabled:opacity-50">
                      Complete Session
                    </Button>
                  </div>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
      {/* Advance payment dialog */}
      <Dialog open={!!advAsset} onOpenChange={(o) => !o && (setAdvAsset(null), setAdvSession(null))}>
        <DialogContent className="glass-card">
          <DialogHeader><DialogTitle>Advance payment — {advAsset?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {advExisting.length > 0 && (
              <div className="p-2 rounded border border-border text-xs space-y-1">
                <div className="text-muted-foreground">Previous advances</div>
                {advExisting.map((a) => (
                  <div key={a.id} className="flex justify-between">
                    <span className="uppercase">{a.payment_method}</span>
                    <span className="font-mono">₹{Number(a.amount).toFixed(2)}</span>
                  </div>
                ))}
                <div className="flex justify-between pt-1 border-t border-border font-semibold">
                  <span>Total paid</span>
                  <span className="text-success">₹{advExisting.reduce((s, a) => s + Number(a.amount), 0).toFixed(2)}</span>
                </div>
              </div>
            )}
            <div>
              <Label>Amount to collect now</Label>
              <Input type="number" step="0.01" min={0} value={advAmount}
                onChange={(e) => {
                  const v = Math.max(0, Number(e.target.value) || 0);
                  setAdvAmount(v);
                  if (advMethod === "cash") setAdvCash(v);
                  else if (advMethod === "upi") setAdvUpi(v);
                  else { setAdvCash(v); setAdvUpi(0); }
                }} />
            </div>
            <div>
              <Label>Payment method</Label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                {(["cash", "upi"] as const).map((m) => (
                  <Button key={m} type="button" variant={advMethod === m ? "default" : "outline"}
                    className={advMethod === m ? "bg-gradient-primary text-primary-foreground" : ""}
                    onClick={() => {
                      setAdvMethod(m);
                      if (m === "cash") { setAdvCash(advAmount); setAdvUpi(0); }
                      else { setAdvUpi(advAmount); setAdvCash(0); }
                    }}>{m.toUpperCase()}</Button>
                ))}
              </div>
            </div>
            <Button onClick={confirmAdvance} className="w-full bg-gradient-primary text-primary-foreground">
              Record advance
            </Button>
            <p className="text-[10px] text-muted-foreground">Advances are deducted automatically when the session ends.</p>
          </div>
        </DialogContent>
      </Dialog>
      {/* Change players dialog */}
      <Dialog open={!!cpAsset} onOpenChange={(o) => !o && setCpAsset(null)}>
        <DialogContent className="glass-card">
          <DialogHeader><DialogTitle>Change players — {cpAsset?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Pricing recalculates live based on each player-count segment.</p>
            <div className="grid grid-cols-4 gap-2">
              {[1, 2, 3, 4].map((n) => (
                <Button key={n} type="button" variant={cpPlayers === n ? "default" : "outline"}
                  className={cpPlayers === n ? "bg-gradient-primary text-primary-foreground" : ""}
                  onClick={() => setCpPlayers(n)}>{n}</Button>
              ))}
            </div>
            <Button onClick={confirmChangePlayers} className="w-full bg-gradient-primary text-primary-foreground">Update players</Button>
          </div>
        </DialogContent>
      </Dialog>
      {/* Shift asset dialog — moves the SAME session to another asset */}
      <Dialog open={!!shiftAsset} onOpenChange={(o) => !o && (setShiftAsset(null), setShiftSession(null))}>
        <DialogContent className="glass-card">
          <DialogHeader><DialogTitle>Shift session — {shiftAsset?.name}</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground">The session continues exactly where it is — same timer, bill, items and players — just on another asset.</p>
          <div className="space-y-3 mt-2">
            <div>
              <Label>Destination asset</Label>
              <Select value={shiftTo} onValueChange={setShiftTo}>
                <SelectTrigger><SelectValue placeholder="Pick an available asset" /></SelectTrigger>
                <SelectContent>
                  {assets.filter((a) => a.status === "available" && a.id !== shiftAsset?.id).map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name} ({a.category})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={confirmShift} disabled={!shiftTo} className="w-full bg-gradient-primary text-primary-foreground">
              Shift session
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default FloorMap;
