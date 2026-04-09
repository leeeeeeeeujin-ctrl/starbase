import { supabaseAdmin } from "../supabaseAdmin.js";

export function derivePokerogueUsername(user) {
  const metadata = user?.user_metadata && typeof user.user_metadata === "object" ? user.user_metadata : {};
  const candidates = [
    metadata.user_name,
    metadata.username,
    metadata.name,
    metadata.full_name,
    typeof user?.email === "string" ? user.email.split("@")[0] : null,
    typeof user?.id === "string" ? user.id.slice(0, 8) : null,
  ].filter(Boolean);

  return candidates[0] || "Player";
}

export function extractAuthorizationToken(req) {
  const raw = req?.headers?.authorization || req?.headers?.Authorization || "";
  const trimmed = String(raw).trim();

  if (!trimmed) {
    return null;
  }

  if (/^Bearer\s+/i.test(trimmed)) {
    return trimmed.replace(/^Bearer\s+/i, "").trim() || null;
  }

  return trimmed;
}

export async function getPokerogueAuthedUser(req) {
  const token = extractAuthorizationToken(req);
  if (!token) {
    return { user: null, error: "missing_authorization" };
  }

  try {
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data?.user) {
      return { user: null, error: error?.message || "invalid_authorization" };
    }

    return { user: data.user, error: null };
  } catch (error) {
    return { user: null, error: error?.message || String(error) };
  }
}

export async function getPokerogueProfile(userId) {
  const { data, error } = await supabaseAdmin
    .from("pokerogue_profiles")
    .select("user_id, username, system_data, session_slots, last_session_slot, client_session_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

export async function upsertPokerogueProfile(payload) {
  const normalized = {
    session_slots: {},
    last_session_slot: -1,
    client_session_id: null,
    ...payload,
  };

  const { data, error } = await supabaseAdmin
    .from("pokerogue_profiles")
    .upsert(normalized, { onConflict: "user_id" })
    .select("user_id, username, system_data, session_slots, last_session_slot, client_session_id")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export function normalizeStoredBody(body) {
  if (typeof body === "string") {
    return body;
  }

  if (body == null || body === "") {
    return "";
  }

  return JSON.stringify(body);
}

export function readSessionSlots(profile) {
  const raw = profile?.session_slots;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }

  return { ...raw };
}
