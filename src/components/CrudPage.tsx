import { ReactNode, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import PageHeader from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Edit2, Trash2 } from "lucide-react";
import { toast } from "sonner";

export type Field = {
  name: string;
  label: string;
  type?: "text" | "number" | "select";
  options?: { value: string; label: string }[];
  default?: any;
  required?: boolean;
};

interface Props {
  title: string;
  description?: string;
  table: string;
  fields: Field[];
  columns: { key: string; label: string; render?: (row: any) => ReactNode }[];
  extraInsert?: (form: any) => any;
}

const CrudPage = ({ title, description, table, fields, columns, extraInsert }: Props) => {
  const { cafeId } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState<any>({});

  const load = async () => {
    if (!cafeId) return;
    const { data } = await supabase.from(table as any).select("*").eq("cafe_id", cafeId).order("created_at", { ascending: false });
    setRows(data || []);
  };
  useEffect(() => { load(); }, [cafeId, table]);

  const openNew = () => {
    const init: any = {};
    fields.forEach((f) => init[f.name] = f.default ?? "");
    setForm(init); setEditing(null); setOpen(true);
  };
  const openEdit = (row: any) => {
    const init: any = {};
    fields.forEach((f) => init[f.name] = row[f.name] ?? f.default ?? "");
    setForm(init); setEditing(row); setOpen(true);
  };

  const save = async () => {
    if (!cafeId) return;
    const payload: any = { ...form, cafe_id: cafeId, ...(extraInsert ? extraInsert(form) : {}) };
    fields.forEach((f) => { if (f.type === "number") payload[f.name] = Number(payload[f.name] || 0); });
    const { error } = editing
      ? await supabase.from(table as any).update(payload).eq("id", editing.id)
      : await supabase.from(table as any).insert(payload);
    if (error) return toast.error(error.message);
    toast.success(editing ? "Updated" : "Created");
    setOpen(false); load();
  };

  const remove = async (id: string) => {
    if (!confirm("Delete?")) return;
    const { error } = await supabase.from(table as any).delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Deleted"); load();
  };

  return (
    <>
      <PageHeader
        title={title}
        description={description}
        actions={<Button onClick={openNew} className="bg-gradient-primary text-primary-foreground"><Plus className="w-4 h-4 mr-1" />Add</Button>}
      />
      <Card className="glass-card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              {columns.map((c) => <th key={c.key} className="text-left p-3 text-xs uppercase text-muted-foreground">{c.label}</th>)}
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-border/50 hover:bg-muted/20">
                {columns.map((c) => <td key={c.key} className="p-3 text-sm">{c.render ? c.render(r) : r[c.key]}</td>)}
                <td className="p-3 text-right">
                  <Button size="icon" variant="ghost" onClick={() => openEdit(r)}><Edit2 className="w-3 h-3" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => remove(r.id)}><Trash2 className="w-3 h-3" /></Button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={columns.length + 1} className="p-8 text-center text-muted-foreground">No items yet</td></tr>}
          </tbody>
        </table>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="glass-card">
          <DialogHeader><DialogTitle>{editing ? "Edit" : "New"} {title}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {fields.map((f) => (
              <div key={f.name}>
                <Label>{f.label}</Label>
                {f.type === "select" ? (
                  <Select value={form[f.name] ?? ""} onValueChange={(v) => setForm({ ...form, [f.name]: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {f.options?.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    type={f.type === "number" ? "number" : "text"}
                    step={f.type === "number" ? "0.01" : undefined}
                    value={form[f.name] ?? ""}
                    onChange={(e) => setForm({ ...form, [f.name]: e.target.value })}
                  />
                )}
              </div>
            ))}
            <Button onClick={save} className="w-full bg-gradient-primary text-primary-foreground">Save</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default CrudPage;
