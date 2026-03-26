import { describe, it, expect } from "vitest";

// extract-spec route의 핵심 로직: LLM 응답에서 null/빈값 필터링
// route.ts L71-78의 로직을 순수 함수로 테스트
function filterExtracted(parsed: Record<string, unknown>): Record<string, unknown> {
  const extracted: Record<string, unknown> = {};
  if (parsed.extracted) {
    for (const [key, val] of Object.entries(parsed.extracted as Record<string, unknown>)) {
      if (val !== null && val !== undefined && val !== "") {
        extracted[key] = val;
      }
    }
  }
  return extracted;
}

describe("extract-spec JSON 파싱 로직", () => {
  it("정상 추출: brand와 content만 반환", () => {
    const parsed = { extracted: { brand: "스타벅스", content: "음료 할인", imageStyle: null } };
    expect(filterExtracted(parsed)).toEqual({ brand: "스타벅스", content: "음료 할인" });
  });

  it("모든 필드가 null이면 빈 객체", () => {
    const parsed = { extracted: { brand: null, content: null, textDraft: null } };
    expect(filterExtracted(parsed)).toEqual({});
  });

  it("빈 문자열도 필터링", () => {
    const parsed = { extracted: { brand: "스타벅스", content: "" } };
    expect(filterExtracted(parsed)).toEqual({ brand: "스타벅스" });
  });

  it("extracted가 없는 응답", () => {
    expect(filterExtracted({})).toEqual({});
  });

  it("undefined 값 필터링", () => {
    const parsed = { extracted: { brand: "대한항공", imageSource: undefined } };
    expect(filterExtracted(parsed)).toEqual({ brand: "대한항공" });
  });

  it("유효한 값만 통과 (혼합 케이스)", () => {
    const parsed = {
      extracted: {
        brand: "마켓컬리",
        content: null,
        imageStyle: "실사",
        textTone: "",
        textDraft: undefined,
        imageSource: "ai",
      },
    };
    expect(filterExtracted(parsed)).toEqual({
      brand: "마켓컬리",
      imageStyle: "실사",
      imageSource: "ai",
    });
  });
});
