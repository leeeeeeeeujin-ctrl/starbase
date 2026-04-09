import {
  derivePokerogueUsername,
  getPokerogueAuthedUser,
  getPokerogueProfile,
  normalizeStoredBody,
  readSessionSlots,
  upsertPokerogueProfile,
} from "../../../lib/server/pokerogueCompat.js";
import { supabaseAdmin } from "../../../lib/supabaseAdmin.js";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "8mb",
    },
  },
};

function getPathParts(req) {
  const parts = req.query?.path;
  if (Array.isArray(parts)) {
    return parts;
  }
  if (parts) {
    return [parts];
  }
  return [];
}

function sendText(res, status, body = "") {
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  return res.status(status).send(body);
}

function sendJson(res, status, body) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  return res.status(status).json(body);
}

async function ensureProfileForUser(user) {
  const existing = await getPokerogueProfile(user.id);
  const username = derivePokerogueUsername(user);

  if (existing) {
    if (existing.username !== username) {
      return upsertPokerogueProfile({
        ...existing,
        user_id: user.id,
        username,
      });
    }
    return existing;
  }

  return upsertPokerogueProfile({
    user_id: user.id,
    username,
    system_data: null,
    session_slots: {},
    last_session_slot: -1,
    client_session_id: null,
  });
}

async function requireUser(req, res) {
  if (!supabaseAdmin || typeof supabaseAdmin.from !== "function") {
    sendJson(res, 500, { error: "supabase_not_configured" });
    return null;
  }

  const { user, error } = await getPokerogueAuthedUser(req);
  if (!user) {
    sendJson(res, 401, { error: error || "unauthorized" });
    return null;
  }

  return user;
}

async function handleGameTitleStats(res) {
  const { count } = await supabaseAdmin
    .from("pokerogue_profiles")
    .select("user_id", { count: "exact", head: true });

  return sendJson(res, 200, {
    playerCount: count || 0,
    battleCount: 0,
  });
}

async function handleAccountInfo(req, res) {
  const user = await requireUser(req, res);
  if (!user) {
    return;
  }

  const profile = await ensureProfileForUser(user);

  return sendJson(res, 200, {
    username: profile.username,
    lastSessionSlot: profile.last_session_slot ?? -1,
    discordId: "",
    googleId: "",
    hasAdminRole: false,
  });
}

async function handleSystemGet(req, res) {
  const user = await requireUser(req, res);
  if (!user) {
    return;
  }

  const profile = await ensureProfileForUser(user);
  if (!profile.system_data) {
    return sendText(res, 404, "System save not found");
  }

  return sendText(res, 200, profile.system_data);
}

async function handleSystemVerify(req, res) {
  const user = await requireUser(req, res);
  if (!user) {
    return;
  }

  return sendJson(res, 200, {
    valid: true,
    systemData: null,
  });
}

async function handleSystemUpdate(req, res) {
  const user = await requireUser(req, res);
  if (!user) {
    return;
  }

  const existing = await ensureProfileForUser(user);
  const rawSystemData = normalizeStoredBody(req.body);

  await upsertPokerogueProfile({
    ...existing,
    user_id: user.id,
    username: derivePokerogueUsername(user),
    system_data: rawSystemData,
    client_session_id: req.query?.clientSessionId ? String(req.query.clientSessionId) : existing.client_session_id,
    updated_at: new Date().toISOString(),
  });

  return sendText(res, 200, "");
}

async function handleSessionGet(req, res) {
  const user = await requireUser(req, res);
  if (!user) {
    return;
  }

  const profile = await ensureProfileForUser(user);
  const slots = readSessionSlots(profile);
  const slotId = String(req.query?.slot ?? "0");
  const sessionData = typeof slots[slotId] === "string" ? slots[slotId] : "";

  return sendText(res, 200, sessionData);
}

async function handleSessionUpdate(req, res) {
  const user = await requireUser(req, res);
  if (!user) {
    return;
  }

  const existing = await ensureProfileForUser(user);
  const slots = readSessionSlots(existing);
  const slotId = String(req.query?.slot ?? "0");
  slots[slotId] = normalizeStoredBody(req.body);

  await upsertPokerogueProfile({
    ...existing,
    user_id: user.id,
    username: derivePokerogueUsername(user),
    session_slots: slots,
    last_session_slot: Number.parseInt(slotId, 10) || 0,
    client_session_id: req.query?.clientSessionId ? String(req.query.clientSessionId) : existing.client_session_id,
    updated_at: new Date().toISOString(),
  });

  return sendText(res, 200, "");
}

async function handleSessionDelete(req, res) {
  const user = await requireUser(req, res);
  if (!user) {
    return;
  }

  const existing = await ensureProfileForUser(user);
  const slots = readSessionSlots(existing);
  const slotId = String(req.query?.slot ?? "0");
  delete slots[slotId];

  await upsertPokerogueProfile({
    ...existing,
    user_id: user.id,
    username: derivePokerogueUsername(user),
    session_slots: slots,
    last_session_slot:
      existing.last_session_slot === (Number.parseInt(slotId, 10) || 0) ? -1 : existing.last_session_slot,
    updated_at: new Date().toISOString(),
  });

  return sendText(res, 200, "");
}

async function handleSessionNewclear(req, res) {
  const user = await requireUser(req, res);
  if (!user) {
    return;
  }

  return sendJson(res, 200, true);
}

async function handleSessionClear(req, res) {
  const user = await requireUser(req, res);
  if (!user) {
    return;
  }

  const existing = await ensureProfileForUser(user);
  const slots = readSessionSlots(existing);
  const slotId = String(req.query?.slot ?? "0");
  slots[slotId] = normalizeStoredBody(req.body);

  await upsertPokerogueProfile({
    ...existing,
    user_id: user.id,
    username: derivePokerogueUsername(user),
    session_slots: slots,
    last_session_slot: Number.parseInt(slotId, 10) || 0,
    updated_at: new Date().toISOString(),
  });

  return sendJson(res, 200, {
    success: true,
    error: null,
  });
}

async function handleUpdateAll(req, res) {
  const user = await requireUser(req, res);
  if (!user) {
    return;
  }

  const existing = await ensureProfileForUser(user);
  const payload = typeof req.body === "object" && req.body ? req.body : {};
  const slots = readSessionSlots(existing);
  const slotId = String(payload.sessionSlotId ?? 0);

  if (payload.session != null) {
    slots[slotId] = normalizeStoredBody(payload.session);
  }

  await upsertPokerogueProfile({
    ...existing,
    user_id: user.id,
    username: derivePokerogueUsername(user),
    system_data: payload.system != null ? normalizeStoredBody(payload.system) : existing.system_data,
    session_slots: slots,
    last_session_slot: Number.parseInt(slotId, 10) || 0,
    client_session_id: payload.clientSessionId ? String(payload.clientSessionId) : existing.client_session_id,
    updated_at: new Date().toISOString(),
  });

  return sendText(res, 200, "");
}

export default async function handler(req, res) {
  const route = getPathParts(req).join("/");

  try {
    if (req.method === "GET" && route === "game/titlestats") {
      return await handleGameTitleStats(res);
    }
    if (req.method === "GET" && route === "account/info") {
      return await handleAccountInfo(req, res);
    }
    if (req.method === "GET" && route === "savedata/system/get") {
      return await handleSystemGet(req, res);
    }
    if (req.method === "GET" && route === "savedata/system/verify") {
      return await handleSystemVerify(req, res);
    }
    if (req.method === "POST" && route === "savedata/system/update") {
      return await handleSystemUpdate(req, res);
    }
    if (req.method === "GET" && route === "savedata/session/get") {
      return await handleSessionGet(req, res);
    }
    if (req.method === "POST" && route === "savedata/session/update") {
      return await handleSessionUpdate(req, res);
    }
    if (req.method === "GET" && route === "savedata/session/delete") {
      return await handleSessionDelete(req, res);
    }
    if (req.method === "GET" && route === "savedata/session/newclear") {
      return await handleSessionNewclear(req, res);
    }
    if (req.method === "POST" && route === "savedata/session/clear") {
      return await handleSessionClear(req, res);
    }
    if (req.method === "POST" && route === "savedata/updateall") {
      return await handleUpdateAll(req, res);
    }

    res.setHeader("Allow", "GET,POST");
    return sendJson(res, 404, { error: "not_found", route });
  } catch (error) {
    return sendJson(res, 500, {
      error: "server_error",
      detail: error?.message || String(error),
      route,
    });
  }
}
