import { CTContent, CT_BASE_WIDTH, CT_BASE_HEIGHT } from "@/types/ct";


function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawImageCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  dw: number,
  dh: number,
  alignX: string,
  alignY: string,
  customX?: number,
  customY?: number
) {
  const imgRatio = img.width / img.height;
  const destRatio = dw / dh;

  let sx: number, sy: number, sw: number, sh: number;

  if (imgRatio > destRatio) {
    sh = img.height;
    sw = sh * destRatio;
    sy = 0;
    if (customX !== undefined) {
      sx = (img.width - sw) * (customX / 100);
    } else if (alignX === "left") sx = 0;
    else if (alignX === "right") sx = img.width - sw;
    else sx = (img.width - sw) / 2;
  } else {
    sw = img.width;
    sh = sw / destRatio;
    sx = 0;
    if (customY !== undefined) {
      sy = (img.height - sh) * (customY / 100);
    } else if (alignY === "top") sy = 0;
    else if (alignY === "bottom") sy = img.height - sh;
    else sy = (img.height - sh) / 2;
  }

  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, dw, dh);
}

// ── 공통: CT 카드를 canvas에 렌더링 ──
async function renderToCanvas(content: CTContent): Promise<HTMLCanvasElement> {
  const SCALE = 3;
  const W = CT_BASE_WIDTH * SCALE;
  const H = CT_BASE_HEIGHT * SCALE;

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#E0E0E0";
  ctx.fillRect(0, 0, W, H);

  if (content.imageUrl) {
    try {
      const img = await loadImage(content.imageUrl);
      drawImageCover(
        ctx, img, W, H,
        content.imageConstraint.alignX,
        content.imageConstraint.alignY,
        content.imageConstraint.customX,
        content.imageConstraint.customY,
      );
    } catch {
      // 이미지 로드 실패 시 회색 유지
    }
  }

  if (content.bgTreatment.type === "solid") {
    ctx.fillStyle = content.bgTreatment.color;
    ctx.fillRect(0, 0, W, content.bgTreatment.height * SCALE);
  }

  if (content.bgTreatment.type === "gradient") {
    const gradH = H * (2 / 3);
    const grad = ctx.createLinearGradient(0, 0, 0, gradH);
    const isDark = content.bgTreatment.direction === "dark";
    for (const stop of content.bgTreatment.stops) {
      const rgb = isDark ? "0,0,0" : "255,255,255";
      grad.addColorStop(stop.position / 100, `rgba(${rgb},${stop.opacity})`);
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, gradH);
  }

  return canvas;
}

function makeFilename(content: CTContent, ext: string = "webp"): string {
  const now = new Date();
  const dateStr = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  return `${dateStr}_CT041_${content.textColor}@3x.${ext}`;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

// ── 다운로드용: WebP → PNG fallback ──
export async function exportCtPng(content: CTContent): Promise<void> {
  const canvas = await renderToCanvas(content);

  // WebP 시도
  const webpBlob = await canvasToBlob(canvas, "image/webp", 0.9);
  if (webpBlob) {
    downloadBlob(webpBlob, makeFilename(content, "webp"));
    return;
  }

  // PNG fallback
  const pngBlob = await canvasToBlob(canvas, "image/png");
  if (pngBlob) {
    downloadBlob(pngBlob, makeFilename(content, "png"));
    return;
  }

  throw new Error("이미지 내보내기에 실패했습니다.");
}

// ── 메일 첨부용: base64 + 파일명 반환 ──
export async function exportCtBase64(content: CTContent): Promise<{ base64: string; fileName: string }> {
  const canvas = await renderToCanvas(content);
  const fileName = makeFilename(content, "webp");

  // WebP 시도
  let dataUrl = canvas.toDataURL("image/webp", 0.9);

  // WebP 미지원 시 PNG fallback
  if (!dataUrl.startsWith("data:image/webp")) {
    dataUrl = canvas.toDataURL("image/png");
  }

  const base64 = dataUrl.split(",")[1];
  if (!base64) {
    throw new Error("이미지 변환에 실패했습니다.");
  }

  return { base64, fileName };
}
