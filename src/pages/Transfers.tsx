import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import PageHeader from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { ArrowRight } from "lucide-react";
import { toast } from "sonner";

const Transfers = () => {
  const { cafeId } = useAuth();
  const [sessions, setSessions] = useState<any[]>([]);
  const [assets, setAssets] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [sessionId, setSessionId] = useState("");
  const [toAsset, setToAsset] = useState("");

  const load = async () => {
    if (!cafeId) return;
    const [{ data: s }, { data: a }, { data: l }] = await Promise.all([
      supabase.from("sessions").select("id, asset_id, customer_name, assets(name)").eq("cafe_id", cafeId).eq("status", "active"),
      supabase.from("assets").select("id, name, status").eq("cafe_id", cafeId),
      supabase.from("transfer_logs").select("*, from_asset:assets!transfer_logs_from_asset_id_fkey(name), to_asset:assets!transfer_logs_to_asset_id_fkey(name)").eq("cafe_id", cafeId).order("created_at", { ascending: false }).limit(20),
    ]);
    setSessions(s || []); setAssets(a || []); setLogs(l || []);
  };
  useEffect(() => { load(); }, [cafeId]);

  const transfer = async () => {
    if (!cafeId || !sessionId || !toAsset) return;
    const sess = sessions.find((s) => s.id === sessionId);
    if (!sess) return;
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("sessions").update({ asset_id: toAsset }).eq("id", sessionId);
    await supabase.from("assets").update({ status: "available" }).eq("id", sess.asset_id);
    await supabase.from("assets").update({ status: "occupied" }).eq("id", toAsset);
    await supabase.from("transfer_logs").insert({
      cafe_id: cafeId, session_id: sessionId,
      from_asset_id: sess.asset_id, to_asset_id: toAsset, transferred_by: user?.id,
    });
    toast.success("Session transferred");
    setSessionId(""); setToAsset(""); load();
  };

  return (
    <>
      <PageHeader title="Transfers" description="Move active sessions between units" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="glass-card p-5">
          <h3 className="font-semibold mb-4">New Transfer</h3>
          <div className="space-y-3">
            <div>
              <Label>Active Session</Label>
              <Select value={sessionId} onValueChange={setSessionId}>
                <SelectTrigger><SelectValue placeholder="Pick a session" /></SelectTrigger>
                <SelectContent>
                  {sessions.map((s) => <SelectItem key={s.id} value={s.id}>{s.assets?.name} — {s.customer_name || "Walk-in"}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Target Asset</Label>
              <Select value={toAsset} onValueChange={setToAsset}>
                <SelectTrigger><SelectValue placeholder="Pick a free asset" /></SelectTrigger>
                <SelectContent>
                  {assets.filter((a) => a.status === "available").map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={transfer} disabled={!sessionId || !toAsset} className="w-full bg-gradient-primary text-primary-foreground">
              Transfer <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </Card>

        <Card className="glass-card p-5">
          <h3 className="font-semibold mb-4">Recent Transfers</h3>
          <div className="space-y-2">
            {logs.map((l) => (
              <div key={l.id} className="flex items-center justify-between text-sm p-2 rounded border border-border">
                <span>{l.from_asset?.name || "?"} → {l.to_asset?.name || "?"}</span>
                <span className="text-xs text-muted-foreground">{new Date(l.created_at).toLocaleString()}</span>
              </div>
            ))}
            {logs.length === 0 && <p className="text-sm text-muted-foreground">No transfers yet</p>}
          </div>
        </Card>
      </div>
    </>
  );
};

export default Transfers;
