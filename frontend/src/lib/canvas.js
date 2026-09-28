/**
 * Drawing helpers shared by the documents rendered to a canvas: membership
 * cards and certificates.
 */

/**
 * The page's fonts are self-hosted by next/font under generated family names,
 * which canvas cannot reach through CSS variables. Read the resolved names.
 */
export const fontStack = (variable, fallback) => {
  if (typeof window === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
  return value ? `${value}, ${fallback}` : fallback;
};

export const loadImage = (src, { crossOrigin = false } = {}) => new Promise((resolve) => {
  if (!src) return resolve(null);
  const image = new Image();
  // Without this, a Cloudinary image would taint the canvas and block the download.
  if (crossOrigin) image.crossOrigin = 'anonymous';
  image.onload = () => resolve(image);
  image.onerror = () => resolve(null);
  image.src = src;
});

export const roundedRect = (ctx, x, y, w, h, r) => {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
};

/** Shrink the font until the text fits, so a long name never runs off the page. */
export const fitText = (ctx, text, { maxWidth, size, minSize = 18, weight = '700', family, style = '' }) => {
  let current = size;
  const font = () => `${style ? `${style} ` : ''}${weight} ${current}px ${family}`;
  ctx.font = font();
  while (current > minSize && ctx.measureText(text).width > maxWidth) {
    current -= 1;
    ctx.font = font();
  }
  return current;
};

/** Cover-fit an image into a box, as CSS object-fit: cover would. */
export const drawCover = (ctx, image, x, y, w, h) => {
  const scale = Math.max(w / image.width, h / image.height);
  const sw = w / scale;
  const sh = h / scale;
  ctx.drawImage(image, (image.width - sw) / 2, (image.height - sh) / 2, sw, sh, x, y, w, h);
};

/** Contain-fit an image in a box, centred horizontally and resting on its bottom edge. */
export const drawContainBottom = (ctx, image, x, y, w, h) => {
  const scale = Math.min(w / image.width, h / image.height);
  const dw = image.width * scale;
  const dh = image.height * scale;
  ctx.drawImage(image, x + (w - dw) / 2, y + h - dh, dw, dh);
};

/** A QR code on a white square with a quiet zone of `padding` around it. */
export const drawQr = async (ctx, text, x, y, size, { color = '#1f2937', padding = 8 } = {}) => {
  const { default: QRCode } = await import('qrcode');
  const qr = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const count = qr.modules.size;
  const cell = size / count;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x - padding, y - padding, size + padding * 2, size + padding * 2);
  ctx.fillStyle = color;
  for (let row = 0; row < count; row += 1) {
    for (let col = 0; col < count; col += 1) {
      // Slight overlap stops hairline gaps between cells on some screens.
      if (qr.modules.get(row, col)) ctx.fillRect(x + col * cell, y + row * cell, cell + 0.5, cell + 0.5);
    }
  }
};

/** Where a document's QR code sends people: "eesa.example/verify". */
export const verifyHost = (verifyUrl) => {
  try {
    const url = new URL(verifyUrl);
    return `${url.host}/verify`;
  } catch {
    return verifyUrl;
  }
};
