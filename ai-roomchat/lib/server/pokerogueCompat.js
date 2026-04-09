import { supabaseAdmin } from "../supabaseAdmin.js";
import { createServerClient } from "@supabase/ssr";
import { parse as parseCookieHeader, serialize as serializeCookie } from "cookie";
import fs from "fs";
import path from "path";

const fallbackStorePath = path.join(process.cwd(), "tmp", "pokerogue-profiles.local.json");
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

function ensureFallbackStore() {
  fs.mkdirSync(path.dirname(fallbackStorePath), { recursive: true });
  if (!fs.existsSync(fallbackStorePath)) {
    fs.writeFileSync(fallbackStorePath, "{}", "utf8");
  }
}

function readFallbackProfiles() {
  ensureFallbackStore();
  try {
    return JSON.parse(fs.readFileSync(fallbackStorePath, "utf8")) || {};
  } catch {
    return {};
  }
}

function writeFallbackProfiles(data) {
  ensureFallbackStore();
  fs.writeFileSync(fallbackStorePath, JSON.stringify(data, null, 2), "utf8");
}

function isMissingPokerogueTable(error) {
  const message = error?.message || "";
  return typeof message === "string" && /pokerogue_profiles/.test(message) && /does not exist/i.test(message);
}

function decodeJwtPayload(token) {
  try {
    const [, payload] = String(token || "").split(".");
    if (!payload) return null;
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = `${base64}${"=".repeat((4 - (base64.length % 4 || 4)) % 4)}`;
    return JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

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

export async function getPokerogueAuthedUser(req, res) {
  const token = extractAuthorizationToken(req);
  const tokenPayload = decodeJwtPayload(token);
  const debug = {
    hasCookieHeader: Boolean(req?.headers?.cookie),
    hasAuthorizationHeader: Boolean(token),
    tokenRole: tokenPayload?.role || null,
    tokenHasSub: Boolean(tokenPayload?.sub),
    tokenIssuer: tokenPayload?.iss || null,
  };

  try {
    const requestCookies = parseCookieHeader(req?.headers?.cookie || "");
    const cookieSupabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() {
          return Object.entries(requestCookies).map(([name, value]) => ({ name, value }));
        },
        setAll(cookiesToSet) {
          if (!res || !Array.isArray(cookiesToSet) || cookiesToSet.length === 0) {
            return;
          }
          const existing = res.getHeader("Set-Cookie");
          const current = Array.isArray(existing) ? existing : existing ? [String(existing)] : [];
          const next = cookiesToSet.map(({ name, value, options }) =>
            serializeCookie(name, value, options || {})
          );
          res.setHeader("Set-Cookie", [...current, ...next]);
        },
      },
    });
    const {
      data: { user },
      error,
    } = await cookieSupabase.auth.getUser();
    if (user) {
      return { user, error: null, debug: { ...debug, authSource: "cookie" } };
    }
    if (error && !/Auth session missing/i.test(error.message || "")) {
      return {
        user: null,
        error: error.message || "invalid_cookie_session",
        debug: { ...debug, authSource: "cookie", cookieError: error.message || "invalid_cookie_session" },
      };
    }
  } catch (error) {
    const message = error?.message || String(error);
    if (!/Auth session missing/i.test(message)) {
      return { user: null, error: message, debug: { ...debug, authSource: "cookie", cookieError: message } };
    }
  }

  if (!token) {
    return { user: null, error: "missing_authorization", debug: { ...debug, authSource: "none" } };
  }

  try {
    if (!supabaseUrl || !supabaseAnonKey) {
      return {
        user: null,
        error: "bearer_client_not_configured",
        debug: { ...debug, authSource: "bearer" },
      };
    }

    const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${token}`,
      },
    });
    const text = await response.text();
    let parsed = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = null;
    }

    if (!response.ok || !parsed?.id) {
      return {
        user: null,
        error: parsed?.msg || parsed?.error_description || parsed?.error || `auth_status_${response.status}`,
        debug: {
          ...debug,
          authSource: "bearer",
          bearerStatus: response.status,
          bearerError: parsed?.msg || parsed?.error_description || parsed?.error || text || "invalid_authorization",
        },
      };
    }

    return { user: parsed, error: null, debug: { ...debug, authSource: "bearer", bearerStatus: response.status } };
  } catch (error) {
    return {
      user: null,
      error: error?.message || String(error),
      debug: {
        ...debug,
        authSource: "bearer",
        bearerError: error?.message || String(error),
      },
    };
  }
}

export async function getPokerogueProfile(userId) {
  try {
    const { data, error } = await supabaseAdmin
      .from("pokerogue_profiles")
      .select("user_id, username, system_data, session_slots, last_session_slot, client_session_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return data;
  } catch (error) {
    if (!isMissingPokerogueTable(error)) {
      throw error;
    }

    const store = readFallbackProfiles();
    return store[userId] || null;
  }
}

export async function upsertPokerogueProfile(payload) {
  const normalized = {
    session_slots: {},
    last_session_slot: -1,
    client_session_id: null,
    ...payload,
  };

  try {
    const { data, error } = await supabaseAdmin
      .from("pokerogue_profiles")
      .upsert(normalized, { onConflict: "user_id" })
      .select("user_id, username, system_data, session_slots, last_session_slot, client_session_id")
      .single();

    if (error) {
      throw error;
    }

    return data;
  } catch (error) {
    if (!isMissingPokerogueTable(error)) {
      throw error;
    }

    const store = readFallbackProfiles();
    store[normalized.user_id] = normalized;
    writeFallbackProfiles(store);
    return normalized;
  }
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
