import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import PageHeader from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const TABLES = [
  "cafes","profiles","user_roles","assets","sessions","session_items",
  "bills","bill_items","products","rate_profiles","offers","expenses",
  "bookings","transfer_logs","activity_logs",
];

const DbBrowser = () => {
  const [table, setTable] = useState("cafes");
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(100);

  const load = async () => {
    setLoading(true);
    const { data, error } = await (supabase.from(table as any) as any).select("*").limit(limit);
    setRows(error ? [] : data || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, [table, limit]);

  const filtered = !search ? rows : rows.filter((r) =>
    JSON.stringify(r).toLowerCase().includes(search.toLowerCase())
  );

  const cols = filtered[0] ? Object.keys(filtered[0]) : [];

  return (
    <>
      <PageHeader title="Database Browser" description="Read-only view of all tables (super admin)" />
      <div className="flex gap-2 flex-wrap mb-4">
        <Select value={table} onValueChange={setTable}>
          <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            {TABLES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input placeholder="Search rows..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
        <Select value={String(limit)} onValueChange={(v) => setLimit(Number(v))}>
          <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
          <SelectContent>
            {[50, 100, 250, 500, 1000].map((n) => <SelectItem key={n} value={String(n)}>{n} rows</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={load}>Reload</Button>
        <span className="text-xs text-muted-foreground self-center">{filtered.length} rows</span>
      </div>
      <Card className="glass-card overflow-auto max-h-[70vh]">
        {loading ? <div className="p-8 text-center text-muted-foreground">Loading...</div> :
         filtered.length === 0 ? <div className="p-8 text-center text-muted-foreground">No rows</div> :
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-card">
            <tr className="border-b border-border">
              {cols.map((c) => <th key={c} className="text-left p-2 uppercase text-[10px] text-muted-foreground">{c}</th>)}
            </tr>
          </thead>
          <tbody>
            {filtered.map((r, i) => (
              <tr key={i} className="border-b border-border/50 hover:bg-muted/20">
                {cols.map((c) => {
                  const v = r[c];
                  const s = v === null ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v);
                  return <td key={c} className="p-2 max-w-[280px] truncate" title={s}>{s}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>}
      </Card>
    </>
  );
};
export default DbBrowser;
