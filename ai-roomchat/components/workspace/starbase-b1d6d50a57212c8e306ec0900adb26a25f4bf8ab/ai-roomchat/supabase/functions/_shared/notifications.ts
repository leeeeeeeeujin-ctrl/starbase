import { supabase } from './supabaseClient.ts';
import { sanitizeTimelineEvents, TimelineEventNormalized } from './timeline.ts';

const REALTIME_EVENT_NAME = 'rank:timeline-event';
const REALTIME_CHANNEL_PREFIX =
  Deno.env.get('RANK_REALTIME_EVENT_CHANNEL_PREFIX') ?? 'rank-session';

const WEBHOOK_URL =
  Deno.env.get('RANK_REALTIME_EVENT_WEBHOOK_URL') ??
  Deno.env.get('SLACK_RANK_REALTIME_EVENT_WEBHOOK_URL') ??
  '';
const WEBHOOK_AUTH =
  Deno.env.get('RANK_REALTIME_EVENT_WEBHOOK_AUTHORIZATION') ??
  Deno.env.get('RANK_REALTIME_EVENT_WEBHOOK_TOKEN') ??
  '';

function buildChannelName(sessionId: string | null | undefined): string | null {
  const suffix = sessionId ? String(sessionId).trim() : '';
  if (!suffix) return null;
  return `${REALTIME_CHANNEL_PREFIX}:${suffix}`;
}

function formatSlackText(
  event: TimelineEventNormalized,
  context: { sessionId?: string | null; gameId?: string | null } = {}
) {
  const lines: string[] = [];
  const header =
    event.type === 'proxy_escalated'
      ? ':rotating_light: 대역 전환'
      : event.type === 'warning'
        ? ':warning: 경고 누적'
        : ':information_source: 실시간 이벤트';
  lines.push(header);

  if (event.ownerId) {
    lines.push(`• 플레이어: ${event.ownerId}`);
  }
  lines.push(`• 유형: ${event.type}`);
  if (event.turn != null) {
    lines.push(`• 턴: ${event.turn}`);
  }
  if (event.strike != null) {
    lines.push(`• 경고 누적: ${event.strike}회`);
  }
  if (event.remaining != null) {
    lines.push(`• 남은 기회: ${event.remaining}회`);
  }
  if (event.limit != null) {
    lines.push(`• 경고 한도: ${event.limit}회`);
  }
  if (event.reason) {
    lines.push(`• 사유: ${event.reason}`);
  }
  if (context.gameId) {
    lines.push(`• 게임 ID: ${context.gameId}`);
  }
  if (context.sessionId) {
    lines.push(`• 세션 ID: ${context.sessionId}`);
  }
  if (event.timestamp) {
    lines.push(`• 발생 시각: ${new Date(event.timestamp).toISOString()}`);
  }

  return lines.join('\n');
}

export async function broadcastTimelineEvents(
  sessionId: string | null | undefined,
  events: unknown[],
  context: Record<string, unknown> = {}
): Promise<boolean> {
  const channelName = buildChannelName(sessionId);
  if (!channelName) return false;

  const payloadEvents = sanitizeTimelineEvents(events);
  if (!payloadEvents.length) return false;

  const channel = supabase.channel(channelName, { config: { broadcast: { ack: true } } });

  try {
    const status = await channel.subscribe();
    if (status !== 'SUBSCRIBED') {
      throw new Error(`Realtime subscribe returned ${status}`);
    }

    const result = await channel.send({
      type: 'broadcast',
      event: REALTIME_EVENT_NAME,
      payload: {
        sessionId,
        emittedAt: new Date().toISOString(),
        context,
        events: payloadEvents,
      },
    });

    if (result !== 'ok') {
      throw new Error(`Realtime broadcast returned ${result}`);
    }

    return true;
  } catch (error) {
    console.error('[edge:timeline] Failed to broadcast realtime payload', {
      sessionId,
      error,
    });
    return false;
  } finally {
    try {
      await channel.unsubscribe();
    } catch (unsubscribeError) {
      console.warn('[edge:timeline] Failed to unsubscribe realtime channel', {
        sessionId,
        error: unsubscribeError,
      });
    }
    supabase.removeChannel(channel);
  }
}

export async function notifyTimelineWebhook(
  events: unknown[],
  context: { sessionId?: string | null; gameId?: string | null } = {}
): Promise<boolean> {
  if (!WEBHOOK_URL) return false;

  const payloadEvents = sanitizeTimelineEvents(events);
  if (!payloadEvents.length) return false;

  const textBlocks = payloadEvents.map(event => formatSlackText(event, context));

  const body = {
    type: 'rank.session.timeline',
    sessionId: context.sessionId ?? null,
    gameId: context.gameId ?? null,
    events: payloadEvents,
    text: textBlocks.join('\n\n'),
  };

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (WEBHOOK_AUTH) {
    headers.Authorization = WEBHOOK_AUTH;
  }

  try {
    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(
        `Webhook responded with ${response.status} ${response.statusText}: ${detail}`
      );
    }

    return true;
  } catch (error) {
    console.error('[edge:timeline] Failed to notify webhook', {
      sessionId: context.sessionId,
      gameId: context.gameId,
      error,
    });
    return false;
  }
}
