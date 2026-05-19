import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { email, password, fullName } = await req.json();
    if (!email || !password) {
      return new Response(JSON.stringify({ error: "email and password required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Refuse if any super_admin already exists
    const { data: existing } = await admin.from("user_roles").select("user_id").eq("role", "super_admin").limit(1);
    if (existing && existing.length > 0) {
      return new Response(JSON.stringify({ error: "A super admin already exists. Use the super admin UI to create more." }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Find or create user
    let userId: string | null = null;
    const { data: list } = await admin.auth.admin.listUsers();
    const found = list?.users?.find((u) => u.email?.toLowerCase() === String(email).toLowerCase());
    if (found) {
      userId = found.id;
      await admin.auth.admin.updateUserById(userId, { password, email_confirm: true });
    } else {
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email, password, email_confirm: true,
        user_metadata: { full_name: fullName ?? "Super Admin" },
      });
      if (createErr || !created.user) {
        return new Response(JSON.stringify({ error: createErr?.message ?? "create failed" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      userId = created.user.id;
    }

    await admin.from("profiles").upsert({ id: userId!, email, full_name: fullName ?? "Super Admin" });
    await admin.from("user_roles").insert({ user_id: userId!, role: "super_admin", permissions: {} });

    return new Response(JSON.stringify({ success: true, userId, email }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? "Internal error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
