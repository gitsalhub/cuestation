import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify caller is super_admin
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: isSuper } = await admin.rpc("is_super_admin", { _user_id: userData.user.id });
    if (!isSuper) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json();
    const { email, fullName, cafeName, password, subscriptionExpiresAt } = body;
    if (!email || !cafeName) {
      return new Response(JSON.stringify({ error: "email and cafeName required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const tempPassword: string = password && password.length >= 8
      ? password
      : Array.from(crypto.getRandomValues(new Uint8Array(9))).map((b) => "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"[b % 57]).join("") + "!1";

    // Create user (auto-confirmed so they can log in immediately)
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { full_name: fullName ?? "" },
    });
    if (createErr || !created.user) {
      return new Response(JSON.stringify({ error: createErr?.message ?? "Failed to create user" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const newUserId = created.user.id;

    // Create cafe
    const { data: cafe, error: cafeErr } = await admin
      .from("cafes")
      .insert({
        name: cafeName,
        owner_id: newUserId,
        subscription_expires_at: subscriptionExpiresAt ?? null,
      })
      .select()
      .single();
    if (cafeErr) {
      return new Response(JSON.stringify({ error: cafeErr.message }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Ensure profile + link cafe
    await admin.from("profiles").upsert({ id: newUserId, email, full_name: fullName ?? email, cafe_id: cafe.id });

    // Assign admin role
    await admin.from("user_roles").insert({ user_id: newUserId, role: "admin", permissions: {} });

    return new Response(
      JSON.stringify({ success: true, userId: newUserId, cafeId: cafe.id, email, tempPassword }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? "Internal error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
