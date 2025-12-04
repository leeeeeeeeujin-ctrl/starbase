import fs from 'fs/promises';
import path from 'path';
import { Pool } from 'pg';

const pgUrl = process.env.BATTLE_HISTORY_PG_URL || null;
const tableName = process.env.BATTLE_HISTORY_TABLE || 'battle_history';
const fallbackDir =
  process.env.BATTLE_HISTORY_FALLBACK_DIR ||
  path.join(process.cwd(), 'workspace', 'score', 'history');

let pool = null;
let ensured = false;

function getPool() {
  if (!pgUrl) return null;
  if (!pool) {
    pool = new Pool({ connectionString: pgUrl, max: 2 });
  }
  return pool;
}

async function ensureTable() {
  if (ensured) return;
  const p = getPool();
  if (!p) return;
  const ddl = `
    CREATE TABLE IF NOT EXISTS ${tableName} (
      id SERIAL PRIMARY KEY,
      session_id TEXT NOT NULL,
      game_id TEXT NOT NULL,
      user_id TEXT,
      battle_log JSONB NOT NULL,
      result JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS ${tableName}_session_idx ON ${tableName}(session_id);
    CREATE INDEX IF NOT EXISTS ${tableName}_game_idx ON ${tableName}(game_id);
  `;
  await p.query(ddl);
  ensured = true;
}

export async function storeBattleHistory({ sessionId, gameId, userId = null, battleLog, result }) {
  // Try Postgres first.
  try {
    const p = getPool();
    if (p) {
      await ensureTable();
      await p.query(
        `INSERT INTO ${tableName} (session_id, game_id, user_id, battle_log, result) VALUES ($1,$2,$3,$4,$5)`,
        [sessionId, gameId, userId, battleLog, result],
      );
      return { backend: 'pg' };
    }
  } catch (err) {
    // fallback to file
  }

  // Fallback to local file storage
  try {
    await fs.mkdir(fallbackDir, { recursive: true });
    const filePath = path.join(fallbackDir, `${sessionId}.json`);
    await fs.writeFile(
      filePath,
      JSON.stringify(
        {
          battleLog,
          result,
          meta: { sessionId, gameId, userId },
          receivedAt: Date.now(),
        },
        null,
        2,
      ),
      'utf8',
    );
    return { backend: 'file', path: filePath };
  } catch (err) {
    return { backend: 'none', error: 'persist_failed' };
  }
}

export async function loadBattleHistoryBySession(sessionId) {
  // Try Postgres
  try {
    const p = getPool();
    if (p) {
      await ensureTable();
      const { rows } = await p.query(
        `SELECT battle_log, result, session_id, game_id, user_id, created_at FROM ${tableName} WHERE session_id=$1 ORDER BY created_at DESC LIMIT 1`,
        [sessionId],
      );
      if (rows && rows.length) {
        const row = rows[0];
        return {
          battleLog: row.battle_log,
          result: row.result,
          meta: {
            sessionId: row.session_id,
            gameId: row.game_id,
            userId: row.user_id,
            createdAt: row.created_at,
          },
        };
      }
    }
  } catch (err) {
    // ignore and fallback
  }

  // Fallback to file
  try {
    const filePath = path.join(fallbackDir, `${sessionId}.json`);
    const content = await fs.readFile(filePath, 'utf8');
    const data = JSON.parse(content);
    return data;
  } catch (err) {
    return null;
  }
}

export async function loadBattleHistoryByGame(gameId, limit = 10, offset = 0) {
  const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 50);
  const safeOffset = Math.max(Number(offset) || 0, 0);
  // Try Postgres
  try {
    const p = getPool();
    if (p) {
      await ensureTable();
      const { rows } = await p.query(
        `SELECT battle_log, result, session_id, game_id, user_id, created_at
         FROM ${tableName}
         WHERE game_id=$1
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [gameId, safeLimit, safeOffset],
      );
      return rows.map((row) => ({
        battleLog: row.battle_log,
        result: row.result,
        meta: {
          sessionId: row.session_id,
          gameId: row.game_id,
          userId: row.user_id,
          createdAt: row.created_at,
        },
      }));
    }
  } catch (err) {
    // ignore and fallback
  }

  // Fallback to file: scan directory and filter by meta.gameId
  try {
    const entries = await fs.readdir(fallbackDir, { withFileTypes: true });
    const items = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
      const filePath = path.join(fallbackDir, entry.name);
      try {
        const content = await fs.readFile(filePath, 'utf8');
        const data = JSON.parse(content);
        const metaGameId = data?.meta?.gameId || data?.meta?.game_id || null;
        if (metaGameId && metaGameId === gameId) {
          items.push({
            ...data,
            meta: {
              ...(data.meta || {}),
              file: entry.name,
            },
          });
        }
      } catch {
        // ignore broken file
      }
    }
    // sort by createdAt/receivedAt desc
    items.sort((a, b) => {
      const ta = a?.meta?.createdAt || a?.meta?.receivedAt || 0;
      const tb = b?.meta?.createdAt || b?.meta?.receivedAt || 0;
      return Number(tb) - Number(ta);
    });
    return items.slice(safeOffset, safeOffset + safeLimit);
  } catch (err) {
    return [];
  }
}
