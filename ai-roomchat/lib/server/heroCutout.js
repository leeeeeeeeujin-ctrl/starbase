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

function buildBackgroundPalette(samples, varianceThresholdSq = 28 * 28, maxColors = 12) {
  const palette = [];
  for (const sample of samples) {
    if (!sample || sample[3] <= 12) continue;
    const rgb = sample.slice(0, 3);
    const alreadyCovered = palette.some(color => colorDistanceSq(color, rgb) <= varianceThresholdSq);
    if (!alreadyCovered) {
      palette.push(rgb);
      if (palette.length >= maxColors) break;
    }
  }
  return palette;
}

function minPaletteDistanceSq(color, palette) {
  let min = Infinity;
  for (const candidate of palette) {
    const distance = colorDistanceSq(color, candidate);
    if (distance < min) min = distance;
  }
  return min;
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
  samples.push(pixel(0, 0));
  samples.push(pixel(width - 1, 0));
  samples.push(pixel(0, height - 1));
  samples.push(pixel(width - 1, height - 1));

  const backgroundColor = averageRgb(samples.filter(sample => sample[3] > 12).map(sample => sample.slice(0, 3)));
  const backgroundPalette = buildBackgroundPalette(samples);
  if (!backgroundPalette.length) {
    backgroundPalette.push(backgroundColor);
  }

  const classifyBackground = thresholdSq => {
    const visited = new Uint8Array(width * height);
    const background = new Uint8Array(width * height);
    const queue = [];
    let head = 0;

    const enqueue = (x, y) => {
      if (x < 0 || y < 0 || x >= width || y >= height) return;
      const index = y * width + x;
      if (visited[index]) return;
      visited[index] = 1;
      queue.push([x, y]);
    };

    for (let x = 0; x < width; x += 1) {
      enqueue(x, 0);
      enqueue(x, height - 1);
    }
    for (let y = 0; y < height; y += 1) {
      enqueue(0, y);
      enqueue(width - 1, y);
    }

    while (head < queue.length) {
      const [x, y] = queue[head++];
      const index = y * width + x;
      const [r, g, b, a] = pixel(x, y);
      const paletteDistance = minPaletteDistanceSq([r, g, b], backgroundPalette);
      const averageDistance = colorDistanceSq([r, g, b], backgroundColor);
      if (a < 16 || paletteDistance <= thresholdSq || averageDistance <= thresholdSq) {
        background[index] = 1;
        enqueue(x - 1, y);
        enqueue(x + 1, y);
        enqueue(x, y - 1);
        enqueue(x, y + 1);
      }
    }

    return background;
  };

  let background = classifyBackground(42 * 42);
  let backgroundCount = background.reduce((total, value) => total + value, 0);
  if (backgroundCount < width * height * 0.01) {
    background = classifyBackground(58 * 58);
    backgroundCount = background.reduce((total, value) => total + value, 0);
  }
  if (backgroundCount < width * height * 0.01) {
    background = classifyBackground(74 * 74);
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
