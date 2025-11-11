import {
  getPrompt as getPromptInMemory,
  saveRun as saveRunInMemory,
} from '../../../../lib/promptStore';
import { renderTemplate } from '../../../../lib/promptRenderer';
import { callProvider as mockCallProvider } from '../../../../lib/providers/mockProvider';
import { supabase as supabaseAdmin } from '../../../../lib/supabaseAdmin';
// security helpers
let hmac;
try {
  hmac = require('../../../../lib/security/hmac');
} catch (e) {
  hmac = null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end('Method Not Allowed');
  }

  const { id } = req.query;
  let p = null;
  try {
    if (supabaseAdmin && supabaseAdmin.from) {
      const { data, error } = await supabaseAdmin
        .from('prompts')
        .select('*')
        .eq('id', id)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (data) p = data;
    }
  } catch (err) {
    console.warn('Supabase get prompt failed, falling back to memory store', err.message);
  }

  if (!p) {
    p = getPromptInMemory(id);
  }

  if (!p) return res.status(404).json({ error: 'prompt not found' });

  const input = (req.body && req.body.input) || {};
  const provider = (req.body && req.body.provider) || 'mock';

  const rendered = renderTemplate(p.body || '', input);

  // If a client has already run the model (device-side) they can submit a provider_response.
  // Server will perform lightweight verification and persist the run as verified/unverified.
  const clientProviderResponse = req.body && req.body.provider_response;
  const isClientRun =
    !!clientProviderResponse &&
    (provider === 'client' || provider === 'gemini-client' || req.body.source === 'client');

  // Signature header support (HMAC-SHA256)
  const signatureHeader = req.headers['x-signature'] || req.headers['x-run-signature'];
  const requireSignature = (process.env.REQUIRE_RUN_SIGNATURE || '').toLowerCase() === 'true';
  const capabilityHeader = req.headers['x-capability'] || req.headers['x-capability-token'];
  const requireCapability = (process.env.REQUIRE_CAPABILITY || '').toLowerCase() === 'true';
  let tokenVerifier = null;
  try {
    tokenVerifier = require('../../../../lib/security/token');
  } catch (e) {
    tokenVerifier = null;
  }

  // select provider implementation
  let selectedCallProvider = mockCallProvider;
  if (provider === 'gemini') {
    try {
      // dynamic require so server-side only and to avoid ESM/CJS top-level issues
      const gemini = require('../../../../lib/providers/geminiCliProvider');
      if (gemini && typeof gemini.callProvider === 'function')
        selectedCallProvider = gemini.callProvider;
    } catch (e) {
      console.warn(
        'Failed to load geminiCliProvider, falling back to mock provider',
        e && e.message
      );
    }
  }

  // If the caller provided a client-side provider response, verify it instead of calling the server provider.
  if (isClientRun) {
    try {
      // if capability is required, verify token
      if (requireCapability) {
        if (!tokenVerifier) throw new Error('token_helper_missing');
        const secret = process.env.RUN_CAPABILITY_SECRET || process.env.RUN_SIGNING_SECRET || '';
        if (!capabilityHeader) throw new Error('capability_required');
        const payload = tokenVerifier.verifyToken(String(capabilityHeader), secret);
        if (!payload) throw new Error('capability_invalid');
      }
      // Accept device tokens as an alternative capability if provided
      const deviceHeader = req.headers['x-device-token'] || req.headers['x-device'];
      if (deviceHeader) {
        try {
          const dvSecret = process.env.RUN_DEVICE_SECRET || process.env.RUN_CAPABILITY_SECRET || process.env.RUN_SIGNING_SECRET || '';
          if (!tokenVerifier) throw new Error('token_helper_missing');
          const dvPayload = tokenVerifier.verifyToken(String(deviceHeader), dvSecret);
          if (!dvPayload) throw new Error('device_token_invalid');
          // treat as authorized - attach to req for auditing
          req._device = dvPayload;
        } catch (e) {
          // if capability is required and device token invalid, fail
          if (requireCapability) throw e;
        }
      }
      // if signature is required, verify it before accepting client run
      if (requireSignature) {
        if (!hmac) throw new Error('HMAC helper not available');
        const secret = process.env.RUN_SIGNING_SECRET || '';
        if (!signatureHeader) throw new Error('signature_required');
        const ok = hmac.verifySignature(req.body, String(signatureHeader), secret);
        if (!ok) throw new Error('signature_invalid');
      }
      // dynamic require verifier
      const {
        verifyProviderResponse,
      } = require('../../../../lib/providers/verifyProviderResponse');
      const verification = verifyProviderResponse({
        renderedPrompt: rendered,
        providerResponse: clientProviderResponse,
      });

      const status = verification.verified ? 'ok' : 'unverified';
      const storedProviderResponse = verification.sanitizedResponse || clientProviderResponse;

      // persist run
      try {
        if (supabaseAdmin && supabaseAdmin.from) {
      const toInsert = {
        prompt_id: id,
        prompt_version: p.version || null,
        input: input,
        rendered_prompt: rendered,
        provider: provider,
        provider_response: storedProviderResponse,
        status,
        // attach device info when available for auditing
        device_token: req.headers['x-device-token'] || req.headers['x-device'] || null,
        device_id: req._device ? req._device.deviceId || null : null,
        device_display_name: req._device ? req._device.displayName || null : null,
          };
          const { data: runRow, error } = await supabaseAdmin
            .from('prompt_runs')
            .insert([toInsert])
            .select()
            .maybeSingle();
          if (error) throw error;
          if (!runRow) throw new Error('prompt_run_insert_missing');
          return res.status(200).json({
            runId: runRow.id,
            providerResponse: storedProviderResponse,
            verified: verification.verified,
            reason: verification.reason,
          });
        }
      } catch (err) {
        console.warn('Supabase save run failed, falling back to memory store', err && err.message);
      }

      const run = saveRunInMemory({
        prompt_id: id,
        prompt_version: p.version,
        input,
        rendered_prompt: rendered,
        provider: provider,
        provider_response: storedProviderResponse,
        status,
        device_token: req.headers['x-device-token'] || req.headers['x-device'] || null,
        device_id: req._device ? req._device.deviceId || null : null,
        device_display_name: req._device ? req._device.displayName || null : null,
      });
      return res.status(200).json({
        runId: run.id,
        providerResponse: storedProviderResponse,
        verified: verification.verified,
        reason: verification.reason,
      });
    } catch (err) {
      console.warn('Client provider verification failed', err && err.message);
      return res.status(500).json({ error: 'verification_failed', detail: String(err) });
    }
  }

  try {
    const providerResponse = await selectedCallProvider({ provider, prompt: rendered });
    // persist run to supabase if available
    try {
      if (supabaseAdmin && supabaseAdmin.from) {
        const toInsert = {
          prompt_id: id,
          prompt_version: p.version || null,
          input: input,
          rendered_prompt: rendered,
          provider: provider,
          provider_response: providerResponse,
          status: 'ok',
          device_token: req.headers['x-device-token'] || req.headers['x-device'] || null,
          device_id: req._device ? req._device.deviceId || null : null,
          device_display_name: req._device ? req._device.displayName || null : null,
        };
        const { data: runRow, error } = await supabaseAdmin
          .from('prompt_runs')
          .insert([toInsert])
          .select()
          .maybeSingle();
        if (error) throw error;
        if (!runRow) throw new Error('prompt_run_insert_missing');
        return res.status(200).json({ runId: runRow.id, providerResponse });
      }
    } catch (err) {
      console.warn('Supabase save run failed, falling back to memory store', err.message);
    }

    const run = saveRunInMemory({
      prompt_id: id,
      prompt_version: p.version,
      input,
      rendered_prompt: rendered,
      provider: provider,
      provider_response: providerResponse,
      status: 'ok',
      device_token: req.headers['x-device-token'] || req.headers['x-device'] || null,
      device_id: req._device ? req._device.deviceId || null : null,
      device_display_name: req._device ? req._device.displayName || null : null,
    });
    return res.status(200).json({ runId: run.id, providerResponse });
  } catch (err) {
    try {
      if (supabaseAdmin && supabaseAdmin.from) {
        const toInsert = {
          prompt_id: id,
          prompt_version: p.version || null,
          input: input,
          rendered_prompt: rendered,
          provider: provider,
          provider_response: { error: String(err) },
          status: 'error',
          device_token: req.headers['x-device-token'] || req.headers['x-device'] || null,
          device_id: req._device ? req._device.deviceId || null : null,
          device_display_name: req._device ? req._device.displayName || null : null,
        };
        const { data: runRow, error: insertError } = await supabaseAdmin
          .from('prompt_runs')
          .insert([toInsert])
          .select()
          .maybeSingle();
        if (insertError) {
          console.warn('Supabase save error run failed', insertError.message);
          return res.status(500).json({ error: String(err), runId: null });
        }
        return res.status(500).json({ error: String(err), runId: runRow && runRow.id });
      }
    } catch (err2) {
      console.warn('Supabase save run error failed, falling back to memory store', err2.message);
    }

    const run = saveRunInMemory({
      prompt_id: id,
      prompt_version: p.version,
      input,
      rendered_prompt: rendered,
      provider: provider,
      provider_response: { error: String(err) },
      status: 'error',
      device_token: req.headers['x-device-token'] || req.headers['x-device'] || null,
      device_id: req._device ? req._device.deviceId || null : null,
      device_display_name: req._device ? req._device.displayName || null : null,
    });
    return res.status(500).json({ error: String(err), runId: run.id });
  }
}
