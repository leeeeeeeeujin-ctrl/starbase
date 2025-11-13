// Server-Sent Events stream of GitHub webhook events (ephemeral)
import bus from '../../../lib/github/eventBus';

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).end('Method Not Allowed');
  }
  const { repo, setId } = req.query || {};

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  });

  const keepAlive = setInterval(() => {
    try { res.write(': heartbeat\n\n'); } catch {}
  }, 15000);

  const onEvent = (evt) => {
    // Optional filters
    if (repo && evt?.repo !== repo) return;
    if (setId && evt?.setId !== setId) return;
    try {
      res.write(`data: ${JSON.stringify(evt)}\n\n`);
    } catch {}
  };

  bus.on('gh:event', onEvent);
  req.on('close', () => {
    clearInterval(keepAlive);
    bus.off('gh:event', onEvent);
  });
}

