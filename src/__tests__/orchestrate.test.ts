import { describe, it, expect, vi } from "vitest";
import {
  extractSpec,
  classifyByDiff,
  searchBrand,
  generateText,
  generateParallelImages,
  suggestField,
  suggestContent,
} from "@/lib/orchestrate";
import { EMPTY_SPEC } from "@/types/ct";
import type { CTContent } from "@/types/ct";

// ── Helper: mock apiFetch ──
function mockApiFetch(responseBody: unknown, ok = true) {
  return vi.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 500,
    json: () => Promise.resolve(responseBody),
  });
}

// ── extractSpec ──
describe("extractSpec", () => {
  it("정상 추출: brand와 content를 반환", async () => {
    const apiFetch = mockApiFetch({ extracted: { brand: "스타벅스", content: "음료 할인" } });
    const result = await extractSpec("스타벅스 음료 할인 카드 만들어줘", EMPTY_SPEC, apiFetch);
    expect(result).toEqual({ brand: "스타벅스", content: "음료 할인" });
    expect(apiFetch).toHaveBeenCalledOnce();
  });

  it("빈 추출: 발화에서 아무것도 추출 안 됨", async () => {
    const apiFetch = mockApiFetch({ extracted: {} });
    const result = await extractSpec("안녕하세요", EMPTY_SPEC, apiFetch);
    expect(result).toEqual({});
  });

  it("API 에러 시 빈 객체 반환", async () => {
    const apiFetch = vi.fn().mockRejectedValue(new Error("network error"));
    const result = await extractSpec("test", EMPTY_SPEC, apiFetch);
    expect(result).toEqual({});
  });

  it("extracted가 없는 응답 시 빈 객체 반환", async () => {
    const apiFetch = mockApiFetch({});
    const result = await extractSpec("test", EMPTY_SPEC, apiFetch);
    expect(result).toEqual({});
  });
});

// ── classifyByDiff ──
describe("classifyByDiff", () => {
  it("brand 변경 → new", () => {
    expect(classifyByDiff({ brand: "대한항공" }, "대한항공으로 바꿔줘")).toBe("new");
  });

  it("content 변경 → new", () => {
    expect(classifyByDiff({ content: "마일리지 적립" }, "마일리지 적립으로")).toBe("new");
  });

  it("imageStyle 변경 → image", () => {
    expect(classifyByDiff({ imageStyle: "3D" }, "3D로 바꿔줘")).toBe("image");
  });

  it("imageSource 변경 → image", () => {
    expect(classifyByDiff({ imageSource: "ai" }, "AI로 만들어")).toBe("image");
  });

  it("textTone 변경 → copy", () => {
    expect(classifyByDiff({ textTone: "감성적" }, "감성적으로")).toBe("copy");
  });

  it("textDraft 변경 → copy", () => {
    expect(classifyByDiff({ textDraft: "새 초안" }, "초안 입력")).toBe("copy");
  });

  it("빈 extracted + 이미지 키워드 → image (키워드 fallback)", () => {
    expect(classifyByDiff({}, "밝게 해줘")).toBe("image");
    expect(classifyByDiff({}, "배경 바꿔")).toBe("image");
    expect(classifyByDiff({}, "톤 조절해줘")).toBe("image");
  });

  it("빈 extracted + 하단 키워드 → sub", () => {
    expect(classifyByDiff({}, "하단 문구 바꿔")).toBe("sub");
    expect(classifyByDiff({}, "아래 텍스트 수정")).toBe("sub");
  });

  it("빈 extracted + 문구 키워드 → copy", () => {
    expect(classifyByDiff({}, "제목 바꿔줘")).toBe("copy");
    expect(classifyByDiff({}, "카피 수정해줘")).toBe("copy");
  });

  it("빈 extracted + 키워드 없음 → image (기본값)", () => {
    expect(classifyByDiff({}, "좀 더 좋게")).toBe("image");
  });

  it("여러 필드 변경 시 우선순위: brand > imageStyle > textTone", () => {
    expect(classifyByDiff({ brand: "새브랜드", imageStyle: "실사" }, "")).toBe("new");
    expect(classifyByDiff({ imageStyle: "실사", textTone: "감성적" }, "")).toBe("image");
  });
});

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
