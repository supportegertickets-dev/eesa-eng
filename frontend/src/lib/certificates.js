/**
 * Draws certificates.
 *
 * Like the membership card, a certificate is rendered once to a canvas and that
 * one image is what the holder sees, downloads and prints. It is drawn for A4
 * landscape at about 212 dpi, which prints crisply without making the file
 * heavy for a phone.
 */
import {
  drawContainBottom, drawQr, fitText, fontStack, loadImage, verifyHost,
} from '@/lib/canvas';
import { escapeTitle, printDocument } from '@/lib/print';

const W = 2480;
const H = 1754;
const CX = W / 2;

const COLORS = {
  maroon: '#800020',
  maroonDark: '#5a0017',
  gold: '#DAA520',
  goldDeep: '#a87a12',
  ink: '#1f2937',
  label: '#6b7280',
  rule: '#9ca3af',
  paper: '#fffdf7',
  danger: '#b91c1c',
};

export const CERTIFICATE_TITLES = {
  leadership: 'Certificate of Leadership',
  membership: 'Certificate of Membership',
};

const NAIROBI = 'Africa/Nairobi';

/** "1 September 2025", on the calendar in Nairobi wherever the viewer is. */
export const certificateDate = (value) => (value
  ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: NAIROBI }).format(new Date(value))
  : '');

/** The value of an <input type="date"> for a stored date, on the Nairobi calendar. */
export const toDateInput = (value) => (value
  ? new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: NAIROBI }).format(new Date(value))
  : '');

/** "1 Sep 2025 – 31 Aug 2026", for lists. */
export const termRange = (start, end) => {
  const short = (value) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: NAIROBI }).format(new Date(value));
  if (!start && !end) return 'Dates not entered';
  return `${start ? short(start) : 'Start not entered'} – ${end ? short(end) : 'present'}`;
};

/** What the certificate is for, in a phrase: "Treasurer, 2024–2025" or "Membership 2026/2027". */
export const certificateSubject = (certificate) => (certificate.type === 'leadership'
  ? `${certificate.office}, ${termRange(certificate.startDate, certificate.endDate)}`
  : `Membership ${certificate.academicYear}`);

export const certificateFileName = (certificate) => `EESA-${certificate.type}-certificate-${certificate.number}.png`;

/** Where a certificate's QR code points: the verification page on this site. */
export const certificateVerifyUrl = (number) => `${window.location.origin}/verify/${encodeURIComponent(number)}`;

const withSpacing = (ctx, spacing, draw) => {
  // Letter spacing on canvas is recent; older browsers simply draw the text without it.
  const supported = 'letterSpacing' in ctx;
  if (supported) ctx.letterSpacing = `${spacing}px`;
  draw();
  if (supported) ctx.letterSpacing = '0px';
};

const diamond = (ctx, x, y, r, color) => {
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.lineTo(x + r, y);
  ctx.lineTo(x, y + r);
  ctx.lineTo(x - r, y);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
};

const drawFrame = (ctx) => {
  ctx.strokeStyle = COLORS.maroon;
  ctx.lineWidth = 36;
  ctx.strokeRect(66, 66, W - 132, H - 132);

  ctx.strokeStyle = COLORS.gold;
  ctx.lineWidth = 6;
  ctx.strokeRect(108, 108, W - 216, H - 216);
  ctx.lineWidth = 2;
  ctx.strokeRect(124, 124, W - 248, H - 248);

  for (const [x, y] of [[108, 108], [W - 108, 108], [108, H - 108], [W - 108, H - 108]]) {
    diamond(ctx, x, y, 30, COLORS.gold);
    diamond(ctx, x, y, 14, COLORS.maroon);
  }
};

const drawSeal = (ctx, x, y, heading) => {
  const points = 48;
  ctx.beginPath();
  for (let i = 0; i <= points * 2; i += 1) {
    const angle = (Math.PI * i) / points;
    const radius = i % 2 === 0 ? 124 : 110;
    const px = x + radius * Math.cos(angle);
    const py = y + radius * Math.sin(angle);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  const gold = ctx.createRadialGradient(x - 30, y - 30, 10, x, y, 124);
  gold.addColorStop(0, '#f3d27a');
  gold.addColorStop(1, COLORS.goldDeep);
  ctx.fillStyle = gold;
  ctx.fill();

  ctx.beginPath();
  ctx.arc(x, y, 96, 0, Math.PI * 2);
  ctx.fillStyle = COLORS.maroon;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y, 86, 0, Math.PI * 2);
  ctx.strokeStyle = COLORS.gold;
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.fillStyle = COLORS.gold;
  ctx.font = `800 50px ${heading}`;
  ctx.fillText('EESA', x, y + 14);
  ctx.font = `600 15px ${heading}`;
  withSpacing(ctx, 4, () => ctx.fillText('OFFICIAL', x, y - 38));
  withSpacing(ctx, 4, () => ctx.fillText('EGERTON', x, y + 50));
};

/** One signatory: signature over a line, then name and title. */
const drawSignatory = (ctx, signatory, image, cx, width, { body }) => {
  const top = 1334;
  const lineY = 1470;
  if (image) drawContainBottom(ctx, image, cx - width / 2, top, width, lineY - top - 8);

  ctx.strokeStyle = COLORS.rule;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - width / 2, lineY);
  ctx.lineTo(cx + width / 2, lineY);
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.fillStyle = COLORS.ink;
  fitText(ctx, signatory.name, { maxWidth: width, size: 32, minSize: 20, weight: '600', family: body });
  ctx.fillText(signatory.name, cx, lineY + 44);
  ctx.fillStyle = COLORS.label;
  fitText(ctx, signatory.title, { maxWidth: width, size: 27, minSize: 18, weight: '400', family: body });
  ctx.fillText(signatory.title, cx, lineY + 82);
};

/**
 * Render a certificate.
 * @param {object} certificate the certificate from the API
 * @param {{ verifyUrl: string }} options where the QR code points
 * @returns {Promise<{ canvas: HTMLCanvasElement, signaturesLoaded: boolean }>}
 */
export async function renderCertificate(certificate, { verifyUrl }) {
  const heading = fontStack('--font-poppins', 'Arial, Helvetica, sans-serif');
  const body = fontStack('--font-inter', 'Arial, Helvetica, sans-serif');
  const display = fontStack('--font-display', 'Georgia, "Times New Roman", serif');

  // A face loads only once a page uses it, and canvas does not wait: an
  // unloaded weight is drawn in the fallback. Ask for every one used here.
  if (document.fonts?.load) {
    const faces = [
      `700 100px ${display}`, `italic 600 44px ${display}`,
      `600 40px ${heading}`, `800 50px ${heading}`,
      `400 28px ${body}`, `500 30px ${body}`, `600 32px ${body}`, `700 25px ${body}`,
    ];
    await Promise.all(faces.map((font) => document.fonts.load(font).catch(() => null)));
  }
  if (document.fonts?.ready) await document.fonts.ready;

  const signatories = (certificate.signatories || []).slice(0, 3);
  const [logo, ...signatures] = await Promise.all([
    loadImage('/logo.png'),
    ...signatories.map((s) => loadImage(s.signatureUrl, { crossOrigin: true })),
  ]);

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.textBaseline = 'alphabetic';

  ctx.fillStyle = COLORS.paper;
  ctx.fillRect(0, 0, W, H);

  // A faint crest behind the text.
  if (logo) {
    ctx.save();
    ctx.globalAlpha = 0.045;
    ctx.drawImage(logo, CX - 380, 520, 760, 760);
    ctx.restore();
  }

  drawFrame(ctx);

  // Crest and association.
  ctx.beginPath();
  ctx.arc(CX, 250, 94, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = COLORS.gold;
  ctx.stroke();
  if (logo) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(CX, 250, 88, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(logo, CX - 80, 170, 160, 160);
    ctx.restore();
  }

  ctx.textAlign = 'center';
  ctx.fillStyle = COLORS.maroon;
  ctx.font = `600 40px ${heading}`;
  withSpacing(ctx, 6, () => ctx.fillText('EGERTON ENGINEERING STUDENT ASSOCIATION', CX, 420));
  ctx.fillStyle = COLORS.label;
  ctx.font = `400 28px ${body}`;
  ctx.fillText('Egerton University, Njoro, Kenya', CX, 466);

  // Title.
  ctx.fillStyle = COLORS.maroon;
  ctx.font = `700 150px ${display}`;
  ctx.fillText('Certificate', CX, 622);

  const subtitle = certificate.type === 'leadership' ? 'OF LEADERSHIP' : 'OF MEMBERSHIP';
  ctx.font = `600 42px ${heading}`;
  ctx.fillStyle = COLORS.goldDeep;
  withSpacing(ctx, 14, () => ctx.fillText(subtitle, CX, 692));
  const subtitleWidth = ctx.measureText(subtitle).width + subtitle.length * 14;
  ctx.strokeStyle = COLORS.gold;
  ctx.lineWidth = 3;
  for (const direction of [-1, 1]) {
    const inner = CX + direction * (subtitleWidth / 2 + 30);
    ctx.beginPath();
    ctx.moveTo(inner, 678);
    ctx.lineTo(inner + direction * 170, 678);
    ctx.stroke();
    diamond(ctx, inner + direction * 180, 678, 8, COLORS.gold);
  }

  ctx.fillStyle = COLORS.label;
  ctx.font = `italic 600 44px ${display}`;
  ctx.fillText('This is to certify that', CX, 790);

  // Recipient.
  ctx.fillStyle = COLORS.ink;
  fitText(ctx, certificate.recipientName, { maxWidth: 1760, size: 112, minSize: 56, weight: '700', family: display });
  ctx.fillText(certificate.recipientName, CX, 915);
  // The rule runs a little past a long name, and keeps its length under a short one.
  const ruleHalf = Math.min(920, Math.max(640, ctx.measureText(certificate.recipientName).width / 2 + 60));
  ctx.strokeStyle = COLORS.gold;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(CX - ruleHalf, 950);
  ctx.lineTo(CX + ruleHalf, 950);
  ctx.stroke();

  const identity = [certificate.regNumber && `Reg. No. ${certificate.regNumber}`, certificate.department].filter(Boolean).join('   ·   ');
  if (identity) {
    ctx.fillStyle = COLORS.label;
    ctx.font = `500 30px ${body}`;
    ctx.fillText(identity, CX, 1000);
  }

  // What it certifies.
  const sentence = (text, y, weight = '400') => {
    ctx.fillStyle = COLORS.ink;
    ctx.font = `${weight} 40px ${body}`;
    ctx.fillText(text, CX, y);
  };
  const emphasis = (text, y) => {
    ctx.fillStyle = COLORS.maroon;
    fitText(ctx, text, { maxWidth: 1760, size: 76, minSize: 40, weight: '700', family: display });
    ctx.fillText(text, CX, y);
  };

  if (certificate.type === 'leadership') {
    sentence('in recognition of dedicated service as', 1068);
    emphasis(certificate.office, 1154);
    sentence('of the Egerton Engineering Student Association', 1214);
    sentence(`from ${certificateDate(certificate.startDate)} to ${certificateDate(certificate.endDate)}`, 1266, '600');
  } else {
    sentence('has been a registered, paid-up member of the', 1068);
    sentence('Egerton Engineering Student Association for the academic year', 1124);
    emphasis(certificate.academicYear, 1218);
  }

  // Verification, bottom left.
  const qrSize = 168;
  const qrX = 196;
  const qrY = 1318;
  await drawQr(ctx, verifyUrl, qrX, qrY, qrSize, { color: COLORS.ink, padding: 10 });
  ctx.textAlign = 'left';
  ctx.fillStyle = COLORS.label;
  ctx.font = `600 19px ${body}`;
  withSpacing(ctx, 2, () => ctx.fillText('CERTIFICATE NO.', qrX - 10, 1528));
  ctx.fillStyle = COLORS.maroon;
  ctx.font = `700 25px ${body}`;
  ctx.fillText(certificate.number, qrX - 10, 1562);
  ctx.fillStyle = COLORS.label;
  ctx.font = `400 19px ${body}`;
  ctx.fillText(`Issued ${certificateDate(certificate.issuedAt)}`, qrX - 10, 1592);
  ctx.fillText(`Verify at ${verifyHost(verifyUrl)}`, qrX - 10, 1618);

  // Signatures across the middle.
  if (signatories.length) {
    const left = 560;
    const right = W - 500;
    const slot = (right - left) / signatories.length;
    const width = Math.min(460, slot - 60);
    signatories.forEach((signatory, index) => {
      drawSignatory(ctx, signatory, signatures[index], left + slot * (index + 0.5), width, { body });
    });
  }

  drawSeal(ctx, W - 320, 1430, heading);

  // Administrators can still open a revoked certificate; it must never pass for a valid one.
  if (certificate.status === 'revoked') {
    ctx.save();
    ctx.translate(CX, H / 2);
    ctx.rotate(-Math.PI / 9);
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = COLORS.danger;
    ctx.textAlign = 'center';
    ctx.font = `800 300px ${heading}`;
    ctx.fillText('REVOKED', 0, 100);
    ctx.restore();
  }

  return { canvas, signaturesLoaded: signatures.every(Boolean) };
}

/** A certificate as a PNG data URL, for viewing, download, printing or a ZIP. */
export async function renderCertificateImage(certificate) {
  const { canvas, signaturesLoaded } = await renderCertificate(certificate, { verifyUrl: certificateVerifyUrl(certificate.number) });
  return { dataUrl: canvas.toDataURL('image/png'), signaturesLoaded };
}

/**
 * Print certificates on A4 landscape, one to a page, filling it. Printers
 * leave a small margin; the certificate's frame sits well inside it.
 */
export function printCertificates(dataUrls, { title = 'EESA certificate' } = {}) {
  printDocument(`<!doctype html><html><head><title>${escapeTitle(title)}</title>
    <style>
      @page { size: A4 landscape; margin: 0; }
      html, body { margin: 0; }
      .page { width: 297mm; height: 209.5mm; overflow: hidden; page-break-after: always; break-after: page; }
      .page:last-child { page-break-after: auto; break-after: auto; }
      img { width: 100%; height: 100%; object-fit: contain; display: block; }
    </style></head><body>
    ${dataUrls.map((url) => `<div class="page"><img alt="" src="${url}"></div>`).join('')}
    </body></html>`);
}

/**
 * Prepare a signature photographed or scanned on white paper: the paper becomes
 * transparent, the ink a clean dark tone, and the image is cropped to the
 * signature. Returns a PNG, which keeps the transparency.
 * @param {File} file
 * @returns {Promise<{ blob: Blob, url: string }>}
 */
export async function cleanSignature(file) {
  const source = await loadImage(URL.createObjectURL(file));
  if (!source) throw new Error('That image could not be read. Try a JPG or PNG.');

  const scale = Math.min(1, 1600 / Math.max(source.width, source.height));
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(source, 0, 0, width, height);
  URL.revokeObjectURL(source.src);

  const image = ctx.getImageData(0, 0, width, height);
  const { data } = image;

  // Brightness as if laid on white paper, so an already transparent PNG reads
  // as ink on paper rather than ink on black.
  const lightness = (i) => 255 - (data[i + 3] / 255) * (255 - (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000);

  // Phone photos are lit unevenly, so the paper is judged locally: the
  // brightness most of each tile reaches (ink strokes are thin), blended
  // smoothly between tiles.
  const TILE = 48;
  const cols = Math.ceil(width / TILE);
  const rows = Math.ceil(height / TILE);
  const paperLevel = new Float32Array(cols * rows);
  for (let ty = 0; ty < rows; ty += 1) {
    for (let tx = 0; tx < cols; tx += 1) {
      const values = [];
      for (let y = ty * TILE; y < Math.min(height, (ty + 1) * TILE); y += 3) {
        for (let x = tx * TILE; x < Math.min(width, (tx + 1) * TILE); x += 3) values.push(lightness((y * width + x) * 4));
      }
      values.sort((a, b) => a - b);
      paperLevel[ty * cols + tx] = values[Math.floor(values.length * 0.9)] ?? 255;
    }
  }
  const paperAt = (x, y) => {
    const fx = Math.min(Math.max(x / TILE - 0.5, 0), cols - 1);
    const fy = Math.min(Math.max(y / TILE - 0.5, 0), rows - 1);
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const x1 = Math.min(x0 + 1, cols - 1);
    const y1 = Math.min(y0 + 1, rows - 1);
    const ax = fx - x0;
    const ay = fy - y0;
    const top = paperLevel[y0 * cols + x0] * (1 - ax) + paperLevel[y0 * cols + x1] * ax;
    const bottom = paperLevel[y1 * cols + x0] * (1 - ax) + paperLevel[y1 * cols + x1] * ax;
    return top * (1 - ay) + bottom * ay;
  };

  // Clear within 25 levels of the paper, full ink 60 or more darker, and a
  // fade between for smooth edges.
  const CLEAR = 25;
  const FULL = 60;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const darker = paperAt(x, y) - lightness(i);
      const coverage = Math.min(1, Math.max(0, (darker - CLEAR) / (FULL - CLEAR)));
      const alpha = Math.round(coverage * 255);
      // Keep the ink's colour (blue ink stays blue), darkened slightly for print.
      data[i] = Math.round(data[i] * 0.6);
      data[i + 1] = Math.round(data[i + 1] * 0.6);
      data[i + 2] = Math.round(data[i + 2] * 0.6);
      data[i + 3] = alpha;
      if (alpha > 64) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) throw new Error('No signature could be found in that image. Use a photo of the signature in dark ink on plain white paper.');
  ctx.putImageData(image, 0, 0);

  const pad = 12;
  const cropX = Math.max(0, minX - pad);
  const cropY = Math.max(0, minY - pad);
  const cropW = Math.min(width, maxX + pad + 1) - cropX;
  const cropH = Math.min(height, maxY + pad + 1) - cropY;
  const out = document.createElement('canvas');
  out.width = cropW;
  out.height = cropH;
  out.getContext('2d').drawImage(canvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

  const blob = await new Promise((resolve) => out.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('The signature could not be prepared in this browser.');
  return { blob, url: URL.createObjectURL(blob) };
}
