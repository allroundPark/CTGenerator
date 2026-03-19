import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

// 기존 에셋 DB (contents_master.csv 기반 인메모리 캐시)
let assetCache: AssetEntry[] | null = null;

interface AssetEntry {
  id: string;
  category: string;
  nm1: string;
  nm2: string;
  nm3: string;
  imgUrl: string;
  imageType: string;
}

async function loadAssetDB(): Promise<AssetEntry[]> {
  if (assetCache) return assetCache;

  try {
    // contents_master.csv 로드
    const csvPath = path.join(process.cwd(), "..", "data", "contents_master.csv");
    const raw = await fs.readFile(csvPath, "utf-8");
    const lines = raw.split("\n").filter((l) => l.trim());
    const headers = lines[0].split(",");

    const idIdx = headers.indexOf("ID");
    const catIdx = headers.indexOf("CATEGORY");
    const nm1Idx = headers.indexOf("NM1_LABEL");
    const nm2Idx = headers.indexOf("NM2_TITLE");
    const nm3Idx = headers.indexOf("NM3_DESC");
    const imgIdx = headers.indexOf("IMG_URL");
    const typeIdx = headers.indexOf("ASSET_TYPE");

    assetCache = lines.slice(1).map((line) => {
      // CSV 파싱 (따옴표 처리)
      const cols = parseCSVLine(line);
      return {
        id: cols[idIdx] || "",
        category: cols[catIdx] || "",
        nm1: cols[nm1Idx] || "",
        nm2: cols[nm2Idx] || "",
        nm3: cols[nm3Idx] || "",
        imgUrl: cols[imgIdx] || "",
        imageType: cols[typeIdx] || "",
      };
    }).filter((e) => e.imgUrl && e.imgUrl.endsWith(".webp"));

    return assetCache;
  } catch (e) {
    console.error("Failed to load asset DB:", e);
    return [];
  }
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (const ch of line) {
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

// 일반적인 단어 (매칭에서 제외)
const GENERIC_WORDS = new Set([
  "브랜드", "혜택", "카드", "이벤트", "할인", "쿠폰", "안내",
  "서비스", "멤버", "전용", "추천", "제휴", "프로모션", "생성",
  "만들어", "만들기", "콘텐츠", "배경", "이미지",
]);

// 키워드 매칭 점수 — 브랜드명 중심 매칭
function matchScore(entry: AssetEntry, query: string): number {
  const q = query.toLowerCase();
  const fields = [entry.nm1, entry.nm2, entry.nm3].map((f) => f.toLowerCase());
  const urlLower = entry.imgUrl.toLowerCase();
  let score = 0;

  // 전체 쿼리가 정확히 포함되면 높은 점수
  for (const f of fields) {
    if (f.includes(q)) score += 20;
  }

  // 단어별 매칭 (일반 단어 제외, 브랜드명만)
  const words = q.split(/\s+/).filter((w) => w.length >= 2 && !GENERIC_WORDS.has(w));
  if (words.length === 0) return 0; // 브랜드명 없이 일반 단어만이면 매칭 안 함

  for (const word of words) {
    for (const f of fields) {
      if (f.includes(word)) score += 10;
    }
    // URL에 브랜드명 포함 (가장 신뢰도 높음)
    if (urlLower.includes(word)) score += 15;
  }

  return score;
}

// 현대카드 웹에서 이미지 크롤링 시도
async function crawlHyundaicard(query: string): Promise<string | null> {
  // 브랜드명 → 파일명 패턴 매핑
  const brandPatterns: Record<string, string[]> = {
    "스타벅스": ["starbucks"],
    "네이버": ["naver", "Npay"],
    "카카오": ["kakao"],
    "쿠팡": ["coupang"],
    "배민": ["baemin"],
    "당근": ["daangn"],
    "토스": ["toss"],
    "삼성": ["samsung"],
    "애플": ["apple"],
    "구글": ["google"],
  };

  const q = query.toLowerCase();
  const patterns: string[] = [];
  for (const [brand, pats] of Object.entries(brandPatterns)) {
    if (q.includes(brand.toLowerCase()) || q.includes(brand)) {
      patterns.push(...pats);
    }
  }
  // 영문 브랜드명 직접 사용
  const englishMatch = query.match(/[a-zA-Z]{3,}/g);
  if (englishMatch) patterns.push(...englishMatch.map((m) => m.toLowerCase()));

  if (patterns.length === 0) return null;

  // 현대카드 이미지 URL 패턴으로 시도
  const baseUrls = [
    "https://www.hyundaicard.com/images/mybenefit/041_",
    "https://www.hyundaicard.com/images/mybenefit/",
  ];
  const extensions = [".webp", ".png", ".jpg"];

  for (const base of baseUrls) {
    for (const pattern of patterns) {
      for (const ext of extensions) {
        const url = `${base}${pattern}${ext}`;
        try {
          const res = await fetch(url, {
            method: "HEAD",
            signal: AbortSignal.timeout(3000),
          });
          if (res.ok && res.headers.get("content-type")?.startsWith("image/")) {
            return url;
          }
        } catch {
          // 시도 실패, 다음으로
        }
      }
    }
  }

  return null;
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const query = body.query?.trim();
  if (!query) {
    return NextResponse.json({ error: "query is required" }, { status: 400 });
  }

  // 1단계: 기존 에셋 DB 검색
  const db = await loadAssetDB();
  const scored = db
    .map((entry) => ({ entry, score: matchScore(entry, query) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length > 0) {
    const topResults = scored.slice(0, 5).map((s) => ({
      id: s.entry.id,
      nm1: s.entry.nm1,
      nm2: s.entry.nm2,
      nm3: s.entry.nm3,
      imgUrl: s.entry.imgUrl,
      score: s.score,
    }));

    return NextResponse.json({
      source: "asset_db",
      results: topResults,
      message: `기존 에셋에서 ${topResults.length}건 찾았습니다.`,
    });
  }

  // 2단계: 현대카드 웹 크롤링 시도
  const crawledUrl = await crawlHyundaicard(query);
  if (crawledUrl) {
    return NextResponse.json({
      source: "crawled",
      results: [{ imgUrl: crawledUrl, nm1: query }],
      message: `현대카드 웹에서 이미지를 찾았습니다.`,
    });
  }

  // 3단계: 못 찾음
  return NextResponse.json({
    source: "not_found",
    results: [],
    message: `"${query}" 관련 이미지를 찾지 못했습니다. 이미지를 직접 첨부해주세요.`,
  });
}
