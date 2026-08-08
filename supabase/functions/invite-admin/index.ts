import { createClient, type User } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse({ ok: false, error: "Method not allowed." }, 405);
  }

  const authorization = request.headers.get("Authorization") || "";
  const token = authorization.replace(/^Bearer\s+/i, "");

  if (!token) {
    return jsonResponse(
      { ok: false, error: "Authentication is required." },
      401,
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(
      { ok: false, error: "The function is not configured." },
      500,
    );
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: userData, error: userError } = await adminClient.auth.getUser(
    token,
  );
  const caller = userData.user;

  if (userError || !caller) {
    return jsonResponse(
      { ok: false, error: "Your admin session is invalid." },
      401,
    );
  }

  const { data: membership, error: membershipError } = await adminClient
    .from("admin_users")
    .select("user_id, role")
    .eq("user_id", caller.id)
    .maybeSingle();

  if (membershipError || !membership || membership.role !== "owner") {
    return jsonResponse({
      ok: false,
      error: "Only the Owner can invite administrators.",
    }, 403);
  }

  let email = "";
  let redirectTo: string | undefined;

  try {
    const body = await request.json();
    email = String(body?.email || "").trim().toLowerCase();
    const candidateRedirect = String(body?.redirectTo || "").trim();

    if (candidateRedirect) {
      const parsedRedirect = new URL(candidateRedirect);
      const requestOrigin = request.headers.get("Origin");
      if (
        (parsedRedirect.protocol === "https:" ||
          parsedRedirect.protocol === "http:") &&
        requestOrigin &&
        parsedRedirect.origin === requestOrigin
      ) {
        redirectTo = parsedRedirect.href;
      }
    }
  } catch {
    return jsonResponse({
      ok: false,
      error: "A valid email address is required.",
    }, 400);
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return jsonResponse(
      { ok: false, error: "Enter a valid email address." },
      400,
    );
  }

  const { data: currentAdmins, error: currentAdminsError } = await adminClient
    .from("admin_users")
    .select("user_id");

  if (currentAdminsError) {
    return jsonResponse(
      { ok: false, error: "The administrator list could not be checked." },
      500,
    );
  }

  let invitedUserId = "";
  const { data: inviteData, error: inviteError } = await adminClient.auth.admin
    .inviteUserByEmail(
      email,
      redirectTo ? { redirectTo } : undefined,
    );

  if (inviteData.user?.id) {
    invitedUserId = inviteData.user.id;
  } else if (inviteError) {
    const { data: usersData, error: usersError } = await adminClient.auth.admin
      .listUsers({ page: 1, perPage: 1000 });

    const existingUser = usersData?.users?.find(
      (user: User) => user.email?.toLowerCase() === email,
    );

    if (usersError || !existingUser) {
      return jsonResponse({ ok: false, error: inviteError.message }, 400);
    }

    invitedUserId = existingUser.id;
  }

  if (currentAdmins?.some((admin) => admin.user_id === invitedUserId)) {
    return jsonResponse(
      { ok: false, error: "That account is already an administrator." },
      409,
    );
  }

  const { error: authorizeError } = await adminClient
    .from("admin_users")
    .insert({
      user_id: invitedUserId,
      role: "admin",
      invited_by: caller.id,
      updated_at: new Date().toISOString(),
    });

  if (authorizeError) {
    return jsonResponse({ ok: false, error: authorizeError.message }, 500);
  }

  return jsonResponse({
    ok: true,
    email,
    invited: Boolean(inviteData.user?.id),
  });
});
