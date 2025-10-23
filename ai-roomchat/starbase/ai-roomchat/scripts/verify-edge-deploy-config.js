#!/usr/bin/env node

const REQUIRED_VARS = [
  'SUPABASE_ACCESS_TOKEN',
  'SUPABASE_PROJECT_REF',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE',
];

function readFlag(name) {
  return (process.env[name] || '').toLowerCase() === 'true';
}

function main() {
  const missing = [];
  const environmentLabel = process.env.RANK_EDGE_DEPLOY_ENVIRONMENT || 'unspecified';
  const requireSmoke = readFlag('RANK_EDGE_DEPLOY_REQUIRE_SMOKE');
  const requirePagerDuty = readFlag('RANK_EDGE_DEPLOY_REQUIRE_PAGERDUTY');

  for (const key of REQUIRED_VARS) {
    if (!process.env[key] || !String(process.env[key]).trim()) {
      missing.push(key);
    }
  }

  if (requireSmoke && !String(process.env.RANK_EDGE_DEPLOY_SMOKE_TEST_URLS || '').trim()) {
    missing.push('RANK_EDGE_DEPLOY_SMOKE_TEST_URLS');
  }

  if (
    requirePagerDuty &&
    !String(process.env.RANK_EDGE_DEPLOY_PAGERDUTY_ROUTING_KEY || '').trim()
  ) {
    missing.push('RANK_EDGE_DEPLOY_PAGERDUTY_ROUTING_KEY');
  }

  const headers = process.env.RANK_EDGE_DEPLOY_SMOKE_TEST_HEADERS;
  if (headers && headers.trim()) {
    try {
      const parsed = JSON.parse(headers);
      if (!parsed || typeof parsed !== 'object') {
        throw new Error('Headers JSON must be an object of string values.');
      }
      for (const [key, value] of Object.entries(parsed)) {
        if (typeof key !== 'string' || !key.trim()) {
          throw new Error('Header keys must be non-empty strings.');
        }
        if (typeof value !== 'string' || !value.trim()) {
          throw new Error(`Header value for ${key} must be a non-empty string.`);
        }
      }
    } catch (error) {
      console.error(
        `\n[edge-deploy] Invalid RANK_EDGE_DEPLOY_SMOKE_TEST_HEADERS JSON for ${environmentLabel}.`
      );
      console.error(error.message || error);
      process.exit(1);
    }
  }

  if (missing.length) {
    console.error('\n[edge-deploy] Missing required secrets for environment:', environmentLabel);
    for (const key of missing) {
      console.error(` - ${key}`);
    }
    process.exit(1);
  }

  console.log(`[edge-deploy] Secret configuration OK for ${environmentLabel}`);
}

main();
