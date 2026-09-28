/**
 * Draws the membership card.
 *
 * The card is rendered once to a canvas, and that one image is what the member
 * sees, downloads and prints, so the three can never disagree. It is drawn at
 * 300 dpi for the ID-1 card size (85.6 x 54 mm), which prints sharply at
 * actual size.
 */
import { cloudinaryImage } from '@/lib/images';
import { formatDate } from '@/lib/dates';

export const CARD_WIDTH_MM = 85.6;
export const CARD_HEIGHT_MM = 54;

const W = 1012;
const H = 638;

const COLORS = {
  maroon: '#800020',
  maroonDark: '#5a0017',
  gold: '#DAA520',
  ink: '#1f2937',
  label: '#6b7280',
  line: '#e5e7eb',
  cream: '#faf6ee',
  white: '#ffffff',
};

/**
 * The page's fonts are self-hosted by next/font under generated family names,
 * which canvas cannot reach through CSS variables. Read the resolved names.
 */
const fontStack = (variable, fallback) => {
  if (typeof window === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
  return value ? `${value}, ${fallback}` : fallback;
};

const loadImage = (src, { crossOrigin = false } = {}) => new Promise((resolve) => {
  if (!src) return resolve(null);
  const image = new Image();
  // Without this, a Cloudinary photo would taint the canvas and block the download.
  if (crossOrigin) image.crossOrigin = 'anonymous';
  image.onload = () => resolve(image);
  image.onerror = () => resolve(null);
  image.src = src;
});

const roundedRect = (ctx, x, y, w, h, r) => {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
};

/** Shrink the font until the text fits, so a long name never runs off the card. */
const fitText = (ctx, text, { maxWidth, size, minSize = 18, weight = '700', family }) => {
  let current = size;
  ctx.font = `${weight} ${current}px ${family}`;
  while (current > minSize && ctx.measureText(text).width > maxWidth) {
    current -= 1;
    ctx.font = `${weight} ${current}px ${family}`;
  }
  return current;
};

/** Cover-fit an image into a box, as CSS object-fit: cover would. */
const drawCover = (ctx, image, x, y, w, h) => {
  const scale = Math.max(w / image.width, h / image.height);
  const sw = w / scale;
  const sh = h / scale;
  ctx.drawImage(image, (image.width - sw) / 2, (image.height - sh) / 2, sw, sh, x, y, w, h);
};

const drawQr = async (ctx, text, x, y, size) => {
  const { default: QRCode } = await import('qrcode');
  const qr = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const count = qr.modules.size;
  const cell = size / count;

  ctx.fillStyle = COLORS.white;
  ctx.fillRect(x - 8, y - 8, size + 16, size + 16);
  ctx.fillStyle = COLORS.ink;
  for (let row = 0; row < count; row += 1) {
    for (let col = 0; col < count; col += 1) {
      // Slight overlap stops hairline gaps between cells on some screens.
      if (qr.modules.get(row, col)) ctx.fillRect(x + col * cell, y + row * cell, cell + 0.5, cell + 0.5);
    }
  }
};

const studyLabel = (card) => (card.academicStatus === 'alumni' ? 'Alumni' : card.yearOfStudy ? `Year ${card.yearOfStudy}` : '—');

/**
 * Render the card.
 * @param {object} card the card details from the API
 * @param {{ verifyUrl: string }} options where the QR code points
 * @returns {Promise<{ canvas: HTMLCanvasElement, photoLoaded: boolean }>}
 */
export async function renderMembershipCard(card, { verifyUrl }) {
  if (document.fonts?.ready) await document.fonts.ready;

  const heading = fontStack('--font-poppins', 'Arial, Helvetica, sans-serif');
  const body = fontStack('--font-inter', 'Arial, Helvetica, sans-serif');

  const [logo, photo] = await Promise.all([
    loadImage('/logo.png'),
    loadImage(cloudinaryImage(card.photo, { width: 420, height: 540 }), { crossOrigin: true }),
  ]);

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.textBaseline = 'alphabetic';

  // Card body, with rounded corners so the PNG looks like a card.
  roundedRect(ctx, 0, 0, W, H, 36);
  ctx.save();
  ctx.clip();
  ctx.fillStyle = COLORS.white;
  ctx.fillRect(0, 0, W, H);

  // Header band.
  const header = ctx.createLinearGradient(0, 0, W, 0);
  header.addColorStop(0, COLORS.maroon);
  header.addColorStop(1, COLORS.maroonDark);
  ctx.fillStyle = header;
  ctx.fillRect(0, 0, W, 150);
  ctx.fillStyle = COLORS.gold;
  ctx.fillRect(0, 150, W, 8);

  if (logo) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(95, 75, 52, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.white;
    ctx.fill();
    ctx.clip();
    ctx.drawImage(logo, 45, 25, 100, 100);
    ctx.restore();
  }

  ctx.textAlign = 'left';
  ctx.fillStyle = COLORS.gold;
  ctx.font = `800 46px ${heading}`;
  ctx.fillText('EESA', 170, 72);
  ctx.fillStyle = COLORS.white;
  ctx.font = `600 22px ${heading}`;
  ctx.fillText('Egerton Engineering Student Association', 170, 106);
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.font = `400 17px ${body}`;
  ctx.fillText('Egerton University, Njoro', 170, 132);

  ctx.textAlign = 'right';
  ctx.fillStyle = COLORS.gold;
  ctx.font = `700 17px ${heading}`;
  ctx.fillText('MEMBERSHIP CARD', W - 44, 66);

  // Passport photo.
  const photoBox = { x: 48, y: 190, w: 236, h: 304 };
  ctx.save();
  roundedRect(ctx, photoBox.x, photoBox.y, photoBox.w, photoBox.h, 14);
  ctx.clip();
  ctx.fillStyle = COLORS.line;
  ctx.fillRect(photoBox.x, photoBox.y, photoBox.w, photoBox.h);
  if (photo) drawCover(ctx, photo, photoBox.x, photoBox.y, photoBox.w, photoBox.h);
  ctx.restore();
  roundedRect(ctx, photoBox.x, photoBox.y, photoBox.w, photoBox.h, 14);
  ctx.lineWidth = 3;
  ctx.strokeStyle = COLORS.maroon;
  ctx.stroke();

  // Details.
  const left = 318;
  const detailWidth = 420;
  ctx.textAlign = 'left';
  ctx.fillStyle = COLORS.ink;
  fitText(ctx, card.fullName, { maxWidth: detailWidth, size: 38, weight: '700', family: heading });
  ctx.fillText(card.fullName, left, 228);

  const field = (label, value, x, y, { size = 24, maxWidth = detailWidth, color = COLORS.ink } = {}) => {
    ctx.fillStyle = COLORS.label;
    ctx.font = `600 14px ${body}`;
    ctx.fillText(label.toUpperCase(), x, y);
    ctx.fillStyle = color;
    fitText(ctx, value || '—', { maxWidth, size, minSize: 14, weight: '700', family: body });
    ctx.fillText(value || '—', x, y + 30);
  };

  field('Member No.', card.memberNumber, left, 284, { size: 28, color: COLORS.maroon });
  field('Reg. No.', card.regNumber, left, 364, { maxWidth: 220 });
  field('Year of study', studyLabel(card), left + 236, 364, { maxWidth: 180 });
  field('Department', card.department, left, 444);

  // QR code for verification.
  const qrSize = 196;
  const qrX = W - 44 - qrSize;
  const qrY = 200;
  await drawQr(ctx, verifyUrl, qrX, qrY, qrSize);
  ctx.textAlign = 'center';
  ctx.fillStyle = COLORS.label;
  ctx.font = `600 15px ${body}`;
  ctx.fillText('Scan to verify', qrX + qrSize / 2, qrY + qrSize + 36);

  // Footer.
  ctx.fillStyle = COLORS.cream;
  ctx.fillRect(0, 528, W, H - 528);
  ctx.fillStyle = COLORS.line;
  ctx.fillRect(0, 528, W, 2);

  ctx.textAlign = 'left';
  ctx.fillStyle = COLORS.label;
  ctx.font = `600 14px ${body}`;
  ctx.fillText('VALID UNTIL', 48, 570);
  ctx.fillStyle = COLORS.maroon;
  ctx.font = `700 26px ${heading}`;
  ctx.fillText(card.validUntil ? formatDate(card.validUntil) : 'Current semester', 48, 604);

  ctx.textAlign = 'right';
  ctx.fillStyle = COLORS.label;
  ctx.font = `500 15px ${body}`;
  let host = verifyUrl;
  try {
    const url = new URL(verifyUrl);
    host = `${url.host}/verify`;
  } catch {
    // Keep the full link.
  }
  ctx.fillText(`Verify at ${host}`, W - 48, 594);

  ctx.restore();
  return { canvas, photoLoaded: Boolean(photo) };
}

/** Where a card's QR code points: the verification page on this site. */
export const cardVerifyUrl = (memberNumber) => `${window.location.origin}/verify/${encodeURIComponent(memberNumber)}`;

export const cardFileName = (card) => `EESA-membership-card-${card.memberNumber}.png`;

/** A card as a PNG data URL, for download, printing or a ZIP. */
export async function renderCardImage(card) {
  const { canvas, photoLoaded } = await renderMembershipCard(card, { verifyUrl: cardVerifyUrl(card.memberNumber) });
  return { dataUrl: canvas.toDataURL('image/png'), photoLoaded };
}

/**
 * Print a document through a hidden frame rather than a popup, which browsers
 * may block. Printing waits until every image in it has loaded. "Save as PDF"
 * in the print dialog gives a PDF.
 */
const printDocument = (html) => {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  document.body.appendChild(frame);

  const doc = frame.contentDocument;
  doc.open();
  doc.write(html);
  doc.close();

  const cleanUp = () => setTimeout(() => frame.remove(), 1000);
  const images = [...doc.images];
  Promise.all(images.map((image) => (image.complete ? null : new Promise((resolve) => {
    image.onload = resolve;
    image.onerror = resolve;
  })))).then(() => {
    frame.contentWindow.focus();
    frame.contentWindow.print();
    cleanUp();
  });
};

const escapeTitle = (title) => title.replace(/</g, '&lt;');

/** Print one card at its real size. */
export function printImage(dataUrl, { widthMm = CARD_WIDTH_MM, heightMm = CARD_HEIGHT_MM, title = 'EESA membership card' } = {}) {
  printDocument(`<!doctype html><html><head><title>${escapeTitle(title)}</title>
    <style>
      @page { size: A4 portrait; margin: 20mm; }
      html, body { margin: 0; }
      img { width: ${widthMm}mm; height: ${heightMm}mm; display: block; }
    </style></head><body><img alt="" src="${dataUrl}"></body></html>`);
}

const CARDS_PER_SHEET = 8;

/**
 * Print many cards at real size on A4, eight to a page in two columns, each
 * inside a dashed cutting guide.
 */
export function printCardSheet(dataUrls, { title = 'EESA membership cards' } = {}) {
  const pages = [];
  for (let i = 0; i < dataUrls.length; i += CARDS_PER_SHEET) pages.push(dataUrls.slice(i, i + CARDS_PER_SHEET));

  printDocument(`<!doctype html><html><head><title>${escapeTitle(title)}</title>
    <style>
      @page { size: A4 portrait; margin: 12mm; }
      html, body { margin: 0; }
      .sheet { display: grid; grid-template-columns: repeat(2, ${CARD_WIDTH_MM}mm); gap: 7mm 8mm; justify-content: center; page-break-after: always; break-after: page; }
      .sheet:last-child { page-break-after: auto; break-after: auto; }
      .cut { outline: 0.2mm dashed #9ca3af; outline-offset: 1.5mm; }
      img { width: ${CARD_WIDTH_MM}mm; height: ${CARD_HEIGHT_MM}mm; display: block; }
    </style></head><body>
    ${pages.map((page) => `<div class="sheet">${page.map((url) => `<div class="cut"><img alt="" src="${url}"></div>`).join('')}</div>`).join('')}
    </body></html>`);
}
