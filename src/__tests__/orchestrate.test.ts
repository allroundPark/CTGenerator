import { describe, it, expect, vi } from "vitest";
import {
  searchBrand,
  generateText,
  generateParallelImages,
  suggestField,
  suggestContent,
} from "@/lib/orchestrate";
import type { CTContent } from "@/types/ct";

// NOTE: extractSpec / classifyByDiff는 lib/intent.ts로 이동.
// 의도 분류 테스트는 src/__tests__/intent.test.ts 참고 (작성 예정).

// ── Helper: mock apiFetch ──
function mockApiFetch(responseBody: unknown, ok = true) {
  return vi.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 500,
    json: () => Promise.resolve(responseBody),
  });
}

// extractSpec / classifyByDiff 테스트는 lib/intent.ts 이전과 함께 제거됨.
// 새 분류기에 대한 테스트는 src/__tests__/intent.test.ts에서 작성 (별도 PR).

// ── searchBrand ──
describe("searchBrand", () => {
  it("브랜드 찾으면 BrandContext 반환", async () => {
    const brandData = { found: true, brandName: "스타벅스", primaryColor: "#00704A" };
    const apiFetch = mockApiFetch(brandData);
    const result = await searchBrand("스타벅스", apiFetch);
    expect(result).toEqual(brandData);
  });

  it("브랜드 못 찾으면 null", async () => {
    const apiFetch = mockApiFetch({ found: false });
    const result = await searchBrand("없는브랜드", apiFetch);
    expect(result).toBeNull();
  });

  it("API 에러 시 null", async () => {
    const apiFetch = mockApiFetch({}, false);
    const result = await searchBrand("test", apiFetch);
    expect(result).toBeNull();
  });
});

// ── generateText ──
describe("generateText", () => {
  const mockVariants: Partial<CTContent>[] = [
    { label: "NM1", titleLine1: "타이틀1", titleLine2: "타이틀2" },
  ];

  it("정상 3안 반환", async () => {
    const apiFetch = mockApiFetch({ variants: mockVariants });
    const result = await generateText("스타벅스 음료 할인", null, apiFetch);
    expect(result).toEqual(mockVariants);
  });

  it("API 에러 시 throw", async () => {
    const apiFetch = mockApiFetch({ error: "서버 오류" }, false);
    await expect(generateText("test", null, apiFetch)).rejects.toThrow("서버 오류");
  });
});

// ── generateParallelImages ──
describe("generateParallelImages", () => {
  const variant = {
    id: "1", label: "L", titleLine1: "T1", titleLine2: "T2",
    subLine1: "", subLine2: "", textColor: "WT" as const,
    bgTreatment: { type: "none" as const },
    imageConstraint: { fit: "cover" as const, alignX: "center" as const, alignY: "center" as const },
  };

  it("3장 병렬 성공", async () => {
    const apiFetch = mockApiFetch({ image: { mimeType: "image/png", data: "base64data" } });
    const results = await generateParallelImages("prompt", variant, null, { count: 3 }, apiFetch);
    expect(results).toHaveLength(3);
    expect(results.every((r) => r?.startsWith("data:image/png"))).toBe(true);
    expect(apiFetch).toHaveBeenCalledTimes(3);
  });

  it("부분 실패 (2장만 성공)", async () => {
    let callCount = 0;
    const apiFetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 2) return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ image: { mimeType: "image/png", data: "ok" } }),
      });
    });
    const results = await generateParallelImages("prompt", variant, null, { count: 3 }, apiFetch);
    expect(results.filter(Boolean)).toHaveLength(2);
    expect(results[1]).toBeNull();
  });

  it("enhance 모드에서 enhance: true 전달", async () => {
    const apiFetch = mockApiFetch({ image: { mimeType: "image/png", data: "ok" } });
    await generateParallelImages("prompt", variant, null, { count: 1, enhance: true }, apiFetch);
    const body = JSON.parse(apiFetch.mock.calls[0][1].body);
    expect(body.enhance).toBe(true);
  });
});

// ── suggestField ──
describe("suggestField", () => {
  const content = {
    id: "1", label: "L", titleLine1: "T1", titleLine2: "T2",
    subLine1: "S1", subLine2: "S2", textColor: "WT" as const,
    bgTreatment: { type: "none" as const },
    imageConstraint: { fit: "cover" as const, alignX: "center" as const, alignY: "center" as const },
  };

  it("title 대안 반환", async () => {
    const suggestions = [["새타이틀1", "새타이틀2"]];
    const apiFetch = mockApiFetch({ suggestions });
    const result = await suggestField("title", content, "더 짧게", apiFetch);
    expect(result).toEqual(suggestions);
  });

  it("API 에러 시 빈 배열", async () => {
    const apiFetch = mockApiFetch({}, false);
    const result = await suggestField("title", content, undefined, apiFetch);
    expect(result).toEqual([]);
  });
});

// ── suggestContent ──
describe("suggestContent", () => {
  it("소재 추천 반환", async () => {
    const apiFetch = mockApiFetch({ suggestions: ["음료 할인", "케이크 쿠폰"] });
    const result = await suggestContent("스타벅스", apiFetch);
    expect(result).toEqual(["음료 할인", "케이크 쿠폰"]);
  });

  it("에러 시 빈 배열", async () => {
    const apiFetch = vi.fn().mockRejectedValue(new Error("fail"));
    const result = await suggestContent("test", apiFetch);
    expect(result).toEqual([]);
  });
});
