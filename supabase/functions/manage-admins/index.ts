import { createClient, type User } from "@supabase/supabase-js";

type AdminRole = "owner" | "admin";

type AdminMembership = {
  user_id: string;
  role: AdminRole;
  invited_by: string | null;
  created_at: string;
  updated_at: string;
};

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

async function listAllAuthUsers(
  adminClient: ReturnType<typeof createClient>,
) {
  const users: User[] = [];
  let page = 1;

  while (true) {
    const { data, error } = await adminClient.auth.admin.listUsers({
      page,
      perPage: 1000,
    });

    if (error) throw error;

    const pageUsers = data?.users || [];
    users.push(...pageUsers);

    if (pageUsers.length < 1000) break;
    page += 1;
  }

  return users;
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

  const { data: callerMembership, error: membershipError } = await adminClient
    .from("admin_users")
    .select("user_id, role, invited_by, created_at, updated_at")
    .eq("user_id", caller.id)
    .maybeSingle<AdminMembership>();

  if (membershipError || !callerMembership) {
    return jsonResponse(
      { ok: false, error: "This account is not an authorized administrator." },
      403,
    );
  }

  let action = "";
  let targetUserId = "";

  try {
    const body = await request.json();
    action = String(body?.action || "").trim();
    targetUserId = String(body?.targetUserId || "").trim();
  } catch {
    return jsonResponse(
      { ok: false, error: "A valid management action is required." },
      400,
    );
  }

  if (action === "list") {
    const { data: memberships, error: adminsError } = await adminClient
      .from("admin_users")
      .select("user_id, role, invited_by, created_at, updated_at")
      .order("created_at", { ascending: true })
      .returns<AdminMembership[]>();

    if (adminsError) {
      return jsonResponse(
        { ok: false, error: "The administrator list could not be loaded." },
        500,
      );
    }

    try {
      const authUsers = await listAllAuthUsers(adminClient);
      const authUsersById = new Map(
        authUsers.map((user) => [user.id, user]),
      );

      const admins = (memberships || [])
        .map((membership) => {
          const authUser = authUsersById.get(membership.user_id);

          return {
            userId: membership.user_id,
            email: authUser?.email || "Email unavailable",
            role: membership.role,
            isCurrent: membership.user_id === caller.id,
            createdAt: membership.created_at,
            emailConfirmed: Boolean(authUser?.email_confirmed_at),
            lastSignInAt: authUser?.last_sign_in_at || null,
          };
        })
        .sort((first, second) => {
          if (first.role !== second.role) {
            return first.role === "owner" ? -1 : 1;
          }

          return first.email.localeCompare(second.email);
        });

      return jsonResponse({
        ok: true,
        requesterRole: callerMembership.role,
        admins,
      });
    } catch (error) {
      return jsonResponse(
        {
          ok: false,
          error: error instanceof Error
            ? error.message
            : "The administrator accounts could not be loaded.",
        },
        500,
      );
    }
  }

  if (!targetUserId) {
    return jsonResponse(
      { ok: false, error: "Choose an administrator first." },
      400,
    );
  }

  const { data: targetMembership, error: targetError } = await adminClient
    .from("admin_users")
    .select("user_id, role, invited_by, created_at, updated_at")
    .eq("user_id", targetUserId)
    .maybeSingle<AdminMembership>();

  if (targetError || !targetMembership) {
    return jsonResponse(
      { ok: false, error: "The selected administrator no longer exists." },
      404,
    );
  }

  if (action === "transfer") {
    if (callerMembership.role !== "owner") {
      return jsonResponse(
        { ok: false, error: "Only the current Owner can transfer ownership." },
        403,
      );
    }

    if (targetUserId === caller.id) {
      return jsonResponse(
        {
          ok: false,
          error: "Choose a different administrator as the new Owner.",
        },
        400,
      );
    }

    const { error: transferError } = await adminClient.rpc(
      "transfer_admin_ownership",
      {
        requesting_user_id: caller.id,
        target_user_id: targetUserId,
      },
    );

    if (transferError) {
      return jsonResponse(
        { ok: false, error: transferError.message },
        400,
      );
    }

    return jsonResponse({ ok: true, transferred: true });
  }

  if (action === "remove") {
    const isSelfRemoval = targetUserId === caller.id;
    const ownerRemovingAnother =
      callerMembership.role === "owner" && !isSelfRemoval;
    const adminRemovingSelf =
      callerMembership.role === "admin" && isSelfRemoval;

    if (!ownerRemovingAnother && !adminRemovingSelf) {
      return jsonResponse(
        {
          ok: false,
          error: isSelfRemoval
            ? "Transfer ownership before deleting your own account."
            : "Only the Owner can remove another administrator.",
        },
        403,
      );
    }

    if (targetMembership.role === "owner") {
      return jsonResponse(
        { ok: false, error: "Transfer ownership before removing the Owner." },
        400,
      );
    }

    const { data: currentOwner, error: ownerError } = await adminClient
      .from("admin_users")
      .select("user_id")
      .eq("role", "owner")
      .maybeSingle<{ user_id: string }>();

    if (ownerError || !currentOwner) {
      return jsonResponse(
        {
          ok: false,
          error: "An active Owner is required before an account can be removed.",
        },
        409,
      );
    }

    const { count, error: countError } = await adminClient
      .from("admin_users")
      .select("user_id", { count: "exact", head: true });

    if (countError || !count || count <= 1) {
      return jsonResponse(
        { ok: false, error: "The final administrator cannot be removed." },
        400,
      );
    }

    const { error: ownershipError } = await adminClient.rpc(
      "reassign_admin_storage_ownership",
      {
        previous_user_id: targetUserId,
        replacement_user_id: currentOwner.user_id,
      },
    );

    if (ownershipError) {
      return jsonResponse(
        {
          ok: false,
          error: "Uploaded files could not be transferred to the Owner.",
        },
        500,
      );
    }

    const { error: deleteError } = await adminClient.auth.admin.deleteUser(
      targetUserId,
    );

    if (deleteError) {
      const { error: revokeError } = await adminClient
        .from("admin_users")
        .delete()
        .eq("user_id", targetUserId);

      return jsonResponse(
        {
          ok: false,
          accessRemoved: !revokeError,
          removedCurrentAccount: isSelfRemoval && !revokeError,
          error: revokeError
            ? "The account could not be removed. Try again."
            : "Admin access was removed, but permanent account deletion needs project-owner support.",
        },
        500,
      );
    }

    return jsonResponse({
      ok: true,
      removed: true,
      removedCurrentAccount: isSelfRemoval,
    });
  }

  return jsonResponse(
    { ok: false, error: "Unknown management action." },
    400,
  );
});
