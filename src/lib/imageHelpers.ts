// 브라우저 사이드 이미지 변환 헬퍼. useOrchestrate.ts에서 추출.
// 순수 함수 — React 의존 없음, dispatcher들이 직접 import.

export async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/** 이미지를 maxSize로 리사이즈 후 base64 반환 (Gemini 전송 최적화) */
export async function fileToResizedBase64(
  file: File,
  maxSize = 1024,
): Promise<{ data: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      let w = img.width,
        h = img.height;
      if (w > maxSize || h > maxSize) {
        const scale = maxSize / Math.max(w, h);
        w = Math.round(w * scale);
        h = Math.round(h * scale);
      }
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, w, h);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
      resolve({
        data: dataUrl.split(",")[1],
        mimeType: "image/jpeg",
      });
      URL.revokeObjectURL(img.src);
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

/**
 * API 전송용 자동 압축. Gemini 요청 한도(~20MB) 회피.
 * - 작은 파일(<1MB)은 원본 그대로 base64 (품질 보존)
 * - 큰 파일은 max 1600px + JPEG 0.85로 리사이즈
 *
 * iPhone 사진은 보통 4~12MB라 자동으로 압축 경로 탐.
 */
export async function compressForApi(
  file: File,
): Promise<{ data: string; mimeType: string }> {
  const SMALL_THRESHOLD = 1_000_000; // 1MB
  if (file.size < SMALL_THRESHOLD) {
    const data = await fileToBase64(file);
    return { data, mimeType: file.type || "image/jpeg" };
  }
  return fileToResizedBase64(file, 1600);
}

export async function imageUrlToBase64(
  url: string,
): Promise<{ data: string; mimeType: string } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    const buffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = "";
    // chunk 단위 변환 — 큰 이미지에서 stack overflow 방지
    for (let i = 0; i < bytes.length; i += 8192) {
      binary += String.fromCharCode(...bytes.slice(i, i + 8192));
    }
    return { data: btoa(binary), mimeType: blob.type || "image/png" };
  } catch {
    return null;
  }
}
