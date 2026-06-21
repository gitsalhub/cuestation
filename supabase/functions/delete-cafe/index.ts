import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anon = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
    const { data: u, error: uErr } = await userClient.auth.getUser();
    if (uErr || !u.user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const admin = createClient(url, service);
    const { data: isSuper } = await admin.rpc("is_super_admin", { _user_id: u.user.id });
    if (!isSuper) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { cafeId } = await req.json();
    if (!cafeId) return new Response(JSON.stringify({ error: "cafeId required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Delete auth users for staff/admins linked to this cafe (admins included)
    const { data: profs } = await admin.from("profiles").select("id").eq("cafe_id", cafeId);
    const userIds = (profs || []).map((p: any) => p.id);

    // Cascade DB rows via SQL function
    // Cascade DB rows via SQL function
const { error: rpcErr } = await admin.rpc(
  "force_delete_cafe",
  { _cafe_id: cafeId }
);

if (rpcErr) {
  console.error("FORCE DELETE ERROR:", rpcErr);

  return new Response(
    JSON.stringify({
      error: rpcErr.message,
      details: rpcErr.details,
      hint: rpcErr.hint,
      code: rpcErr.code,
    }),
    {
      status: 400,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    }
  );
}

    // Delete auth users (admins/staff)
    for (const uid of userIds) {
      try { await admin.auth.admin.deleteUser(uid); } catch (_) {}
    }

    return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? "Internal error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
