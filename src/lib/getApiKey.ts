// 서버사이드: 요청에서 API 키 추출 (헤더 우선, env fallback)
import { NextRequest } from "next/server";

export function getApiKey(req: NextRequest): string | null {
  // 1. 클라이언트가 보낸 키
  const headerKey = req.headers.get("x-api-key");
  if (headerKey && headerKey.length > 10) return headerKey;

  // 2. 서버 env fallback
  return process.env.GEMINI_API_KEY || null;
}
