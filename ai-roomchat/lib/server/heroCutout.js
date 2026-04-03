import { removeBackground } from '@imgly/background-removal-node';
import path from 'path';
import { existsSync } from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import sharp from 'sharp';

function resolveModelPublicPath() {
  const candidates = [
    path.resolve(process.cwd(), 'node_modules/@imgly/background-removal-node/dist'),
    path.resolve(process.cwd(), 'ai-roomchat/node_modules/@imgly/background-removal-node/dist'),
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../node_modules/@imgly/background-removal-node/dist'),
  ];

  for (const candidate of candidates) {
    if (existsSync(path.join(candidate, 'resources.json'))) {
      const href = pathToFileURL(candidate).href;
      return href.endsWith('/') ? href : `${href}/`;
    }
  }

  return undefined;
}

const cutoutConfig = {
  debug: false,
  model: 'medium',
  publicPath: resolveModelPublicPath(),
  output: {
    format: 'image/png',
    quality: 1,
    type: 'foreground',
  },
};

export async function createHeroCutout(inputBuffer) {
  const metadata = await sharp(inputBuffer, { failOn: 'none' }).metadata();
  const mimeType = metadata.format ? `image/${metadata.format === 'jpg' ? 'jpeg' : metadata.format}` : 'image/png';
  const sourceBlob = new Blob([inputBuffer], { type: mimeType });
  const blob = await removeBackground(sourceBlob, cutoutConfig);
  const arrayBuffer = await blob.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
