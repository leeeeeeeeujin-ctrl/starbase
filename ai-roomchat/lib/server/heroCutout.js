import sharp from 'sharp';

function colorDistanceSq(a, b) {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return dr * dr + dg * dg + db * db;
}

function averageRgb(samples) {
  if (!samples.length) return [255, 255, 255];
  const sums = samples.reduce(
    (acc, value) => {
      acc[0] += value[0];
      acc[1] += value[1];
      acc[2] += value[2];
      return acc;
    },
    [0, 0, 0]
  );
  return sums.map(total => Math.round(total / samples.length));
}

export async function createHeroCutout(inputBuffer) {
  const base = sharp(inputBuffer, { failOn: 'none' }).rotate().ensureAlpha();
  const processed = base.clone().resize(896, 896, {
    fit: 'inside',
    withoutEnlargement: true,
  });

  const { data, info } = await processed.raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  if (!width || !height || channels < 4) {
    return base.png().toBuffer();
  }

  const pixel = (x, y) => {
    const offset = (y * width + x) * channels;
    return [data[offset], data[offset + 1], data[offset + 2], data[offset + 3]];
  };

  const samples = [];
  const stride = Math.max(1, Math.floor(Math.min(width, height) / 24));
  for (let x = 0; x < width; x += stride) {
    samples.push(pixel(x, 0));
    samples.push(pixel(x, height - 1));
  }
  for (let y = 0; y < height; y += stride) {
    samples.push(pixel(0, y));
    samples.push(pixel(width - 1, y));
  }
  const backgroundColor = averageRgb(samples.filter(sample => sample[3] > 12).map(sample => sample.slice(0, 3)));

  const threshold = 38 * 38;
  const visited = new Uint8Array(width * height);
  const background = new Uint8Array(width * height);
  const queue = [];
  const enqueue = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const index = y * width + x;
    if (visited[index]) return;
    visited[index] = 1;
    queue.push([x, y]);
  };

  for (let x = 0; x < width; x += stride) {
    enqueue(x, 0);
    enqueue(x, height - 1);
  }
  for (let y = 0; y < height; y += stride) {
    enqueue(0, y);
    enqueue(width - 1, y);
  }

  while (queue.length) {
    const [x, y] = queue.shift();
    const index = y * width + x;
    const [r, g, b, a] = pixel(x, y);
    if (a < 12 || colorDistanceSq([r, g, b], backgroundColor) <= threshold) {
      background[index] = 1;
      enqueue(x - 1, y);
      enqueue(x + 1, y);
      enqueue(x, y - 1);
      enqueue(x, y + 1);
    }
  }

  const alpha = Buffer.alloc(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const offset = index * channels;
      alpha[index] = background[index] ? 0 : data[offset + 3];
    }
  }

  return processed
    .removeAlpha()
    .joinChannel(alpha, { raw: { width, height, channels: 1 } })
    .png()
    .toBuffer();
}
