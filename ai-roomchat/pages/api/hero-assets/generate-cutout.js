import { createHeroCutout } from '@/lib/server/heroCutout';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '12mb',
    },
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  try {
    const { dataBase64 } = req.body || {};
    if (!dataBase64 || typeof dataBase64 !== 'string') {
      return res.status(400).json({ error: 'missing_image_data' });
    }
    const inputBuffer = Buffer.from(dataBase64, 'base64');
    const output = await createHeroCutout(inputBuffer);
    return res.status(200).json({
      ok: true,
      mimeType: 'image/png',
      dataBase64: output.toString('base64'),
    });
  } catch (error) {
    return res.status(500).json({
      error: 'cutout_generation_failed',
      detail: error?.message || 'unknown_error',
    });
  }
}
