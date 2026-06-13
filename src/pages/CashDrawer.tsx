import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import PageHeader from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Search, Wallet } from "lucide-react";

type Shift = {
  id: string;
  user_id: string;
  user_name: string | null;
  user_role: string | null;
  opened_at: string;
  opening_cash: number | null;
  opening_notes: string | null;
  closed_at: string | null;
  closing_cash: number | null;
  closing_notes: string | null;
  status: string;
};

const shortId = (id: string) => String(id).replace(/-/g, "").slice(0, 8).toUpperCase();
const fmtDateTime = (iso?: string | null) => (iso ? new Date(iso).toLocaleString() : "—");
const fmtMoney = (n?: number | null) => (n === null || n === undefined ? "—" : `₹${Number(n).toLocaleString()}`);
const fmtDuration = (a?: string | null, b?: string | null) => {
  if (!a || !b) return "—";
  const ms = new Date(b).getTime() - new Date(a).getTime();
  if (ms < 0) return "—";
  const mins = Math.floor(ms / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

const CashDrawer = () => {
  const { cafeId } = useAuth();
  const [rows, setRows] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(false);

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");

  const load = async () => {
    if (!cafeId) return;
    setLoading(true);
    const { data } = await supabase
      .from("cash_drawer_shifts")
      .select("*")
      .eq("cafe_id", cafeId)
      .order("opened_at", { ascending: false });
    setRows((data || []) as Shift[]);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [cafeId]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (roleFilter !== "all" && (r.user_role || "") !== roleFilter) return false;
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (fromDate && new Date(r.opened_at) < new Date(fromDate + "T00:00:00")) return false;
      if (toDate && new Date(r.opened_at) > new Date(toDate + "T23:59:59")) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const hay = `${r.user_name || ""} ${shortId(r.user_id)} ${r.user_id}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, roleFilter, statusFilter, fromDate, toDate, search]);

  const summary = useMemo(() => {
    const count = filtered.length;
    const totalOpening = filtered.reduce((s, r) => s + Number(r.opening_cash || 0), 0);
    const closedRows = filtered.filter((r) => r.closing_cash !== null && r.closing_cash !== undefined);
    const totalClosing = closedRows.reduce((s, r) => s + Number(r.closing_cash || 0), 0);
    return {
      count,
      totalOpening,
      totalClosing,
      avgOpening: count ? totalOpening / count : 0,
      avgClosing: closedRows.length ? totalClosing / closedRows.length : 0,
    };
  }, [filtered]);

  const roles = useMemo(() => Array.from(new Set(rows.map((r) => r.user_role).filter(Boolean))) as string[], [rows]);

  return (
    <div>
      <PageHeader
        title="Cash Drawer Analytics"
        description="Shift cash records for opening and closing drawer accountability. This data is separate from revenue analytics."
      />

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Number of Shifts</div>
          <div className="text-2xl font-bold">{summary.count}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Total Opening Cash</div>
          <div className="text-2xl font-bold">{fmtMoney(summary.totalOpening)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Total Closing Cash</div>
          <div className="text-2xl font-bold">{fmtMoney(summary.totalClosing)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Avg Opening Cash</div>
          <div className="text-2xl font-bold">{fmtMoney(Math.round(summary.avgOpening))}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Avg Closing Cash</div>
          <div className="text-2xl font-bold">{fmtMoney(Math.round(summary.avgClosing))}</div>
        </Card>
      </div>

      <Card className="p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <div className="md:col-span-1">
            <Label className="text-xs">Search</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input className="pl-8" placeholder="Name or ID" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
          <div>
            <Label className="text-xs">Role</Label>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Roles</SelectItem>
                {roles.map((r) => <SelectItem key={r} value={r}>{r.replace("_", " ")}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Shift Status</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">From</Label>
            <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">To</Label>
            <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </div>
        </div>
      </Card>

      <Card className="p-0 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Staff Name</TableHead>
              <TableHead>Staff ID</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Login Time</TableHead>
              <TableHead>Logout Time</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead className="text-right">Opening Cash</TableHead>
              <TableHead className="text-right">Closing Cash</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">Loading…</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                <Wallet className="w-8 h-8 mx-auto mb-2 opacity-50" />
                No shift records found.
              </TableCell></TableRow>
            ) : filtered.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.user_name || "—"}</TableCell>
                <TableCell className="font-mono text-xs">{shortId(r.user_id)}</TableCell>
                <TableCell className="capitalize">{(r.user_role || "—").replace("_", " ")}</TableCell>
                <TableCell className="text-sm">{fmtDateTime(r.opened_at)}</TableCell>
                <TableCell className="text-sm">{fmtDateTime(r.closed_at)}</TableCell>
                <TableCell className="text-sm">{fmtDuration(r.opened_at, r.closed_at)}</TableCell>
                <TableCell className="text-right">{fmtMoney(r.opening_cash)}</TableCell>
                <TableCell className="text-right">{fmtMoney(r.closing_cash)}</TableCell>
                <TableCell>
                  <Badge variant={r.status === "open" ? "default" : "secondary"}>{r.status}</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
};

export default CashDrawer;
