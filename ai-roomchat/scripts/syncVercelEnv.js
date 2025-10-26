#!/usr/bin/env node
/**
 * Sync selected environment variables to a Vercel project via REST API.
 *
 * Requirements (any of the supported combinations):
 * - VERCEL_TOKEN (required)
 * - One of:
 *   - VERCEL_PROJECT_ID
 *   - VERCEL_PROJECT_NAME (+ optional VERCEL_TEAM_ID or VERCEL_TEAM_SLUG)
 *   - VERCEL_PROJECT_URL (e.g. https://vercel.com/<team-or-user>/<project-name>)
 *
 * Optional:
 * - VERCEL_TEAM_ID or VERCEL_TEAM_SLUG (if the project is under a team)
 *
 * Usage (PowerShell):
 *   $env:VERCEL_TOKEN="..."; $env:VERCEL_PROJECT_URL="https://vercel.com/team-slug/project"; node scripts/syncVercelEnv.js --set RANK_MATCH_SAFE_FALLBACK=true --target production preview
 *
 * Notes:
 * - This script sets plain text env vars. For secrets, use Vercel UI or CI secrets.
 * - Default targets are ["production","preview"]. Override with --target flags.
 */

const DEFAULT_TARGETS = ['production', 'preview'];

function parseArgs(argv) {
  const args = argv.slice(2);
  const setPairs = []; // { key, value }
  const targets = [];

  for (let i = 0; i < args.length; i += 1) {
    const token = args[i];
    if (token === '--set') {
      const pair = args[i + 1];
      i += 1;
      if (!pair || !pair.includes('=')) continue;
      const [key, ...rest] = pair.split('=');
      const value = rest.join('=');
      if (key) setPairs.push({ key, value });
      continue;
    }
    if (token === '--target') {
      while (i + 1 < args.length && !args[i + 1].startsWith('--')) {
        targets.push(args[i + 1]);
        i += 1;
      }
      continue;
    }
  }

  return { setPairs, targets: targets.length ? targets : DEFAULT_TARGETS };
}

function withTeamQuery(base, teamId) {
  if (!teamId) return base;
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}teamId=${encodeURIComponent(teamId)}`;
}

function parseProjectUrl(urlText) {
  try {
    if (!urlText) return {};
    const u = new URL(urlText);
    // Expect path like /<team-or-user>/<project>
    const parts = (u.pathname || '/').split('/').filter(Boolean);
    if (parts.length >= 2) {
      return { projectName: parts[1], teamSlug: parts[0] };
    }
    return {};
  } catch {
    return {};
  }
}

async function getProjectIdOrThrow({ token, projectId, projectName, teamId }) {
  if (projectId) return projectId;
  if (!projectName) throw new Error('Missing VERCEL_PROJECT_ID or VERCEL_PROJECT_NAME');
  const url = withTeamQuery(
    `https://api.vercel.com/v9/projects/${encodeURIComponent(projectName)}`,
    teamId
  );
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Failed to resolve project by name: ${resp.status} ${text}`);
  }
  const data = await resp.json();
  if (!data?.id) throw new Error('Project lookup returned no id');
  return data.id;
}

async function setEnvVar({ token, projectId, key, value, targets, teamId }) {
  const url = withTeamQuery(
    `https://api.vercel.com/v9/projects/${encodeURIComponent(projectId)}/env`,
    teamId
  );
  const payload = {
    key,
    value,
    target: targets,
    type: 'plain',
  };
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Failed to set ${key}: ${resp.status} ${text}`);
  }
  return resp.json();
}

async function resolveTeamId({ token, teamId, teamSlug }) {
  if (teamId) return teamId;
  if (!teamSlug) return undefined;
  const url = `https://api.vercel.com/v2/teams?limit=100`;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Failed to list teams: ${resp.status} ${text}`);
  }
  const data = await resp.json();
  const list = Array.isArray(data?.teams) ? data.teams : Array.isArray(data) ? data : [];
  const match = list.find(t => (t?.slug || '').toLowerCase() === String(teamSlug).toLowerCase());
  return match?.id || undefined;
}

async function main() {
  try {
    const { setPairs, targets } = parseArgs(process.argv);
    if (!setPairs.length) {
      console.log('No --set pairs provided; nothing to do.');
      console.log('Example: --set RANK_MATCH_SAFE_FALLBACK=true --target production preview');
      process.exit(0);
    }

    const token = process.env.VERCEL_TOKEN;
    let projectId = process.env.VERCEL_PROJECT_ID;
    let projectName = process.env.VERCEL_PROJECT_NAME;
    let teamId = process.env.VERCEL_TEAM_ID || undefined;
    let teamSlug = process.env.VERCEL_TEAM_SLUG || undefined;
    const projectUrl = process.env.VERCEL_PROJECT_URL || undefined;

    // If a project URL is provided, parse it for projectName and teamSlug
    if (!projectName && projectUrl) {
      const parsed = parseProjectUrl(projectUrl);
      projectName = projectName || parsed.projectName;
      teamSlug = teamSlug || parsed.teamSlug;
    }

    // If we have a team slug but no id, try to resolve it
    if (!teamId && teamSlug) {
      teamId = await resolveTeamId({ token, teamId, teamSlug });
    }

    if (!token) throw new Error('Missing VERCEL_TOKEN env var');
    const resolvedProjectId = await getProjectIdOrThrow({ token, projectId, projectName, teamId });

    for (const { key, value } of setPairs) {
      const res = await setEnvVar({
        token,
        projectId: resolvedProjectId,
        key,
        value,
        targets,
        teamId,
      });
      console.log(`✔ Set ${key} for [${targets.join(', ')}] -> id=${res?.id || res?.uid || 'ok'}`);
    }

    console.log('Done.');
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

main();
