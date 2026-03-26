// 데모용 캐시 fallback — public/demo-cache/ 의 static JSON을 로드
// API 장애 시 미리 캐시해둔 시나리오 결과를 보여줌

import { CTContent, BgTreatment } from "@/types/ct";

interface DemoScenario {
  id: string;
  keywords: string[];
}

export interface DemoCacheResult {
  variants: CTContent[];
  images: { url: string; textColor: "BK" | "WT"; bgTreatment: BgTreatment }[];
}

let scenariosCache: DemoScenario[] | null = null;

async function loadScenarios(): Promise<DemoScenario[]> {
  if (scenariosCache) return scenariosCache;
  try {
    const res = await fetch("/demo-cache/scenarios.json");
    if (!res.ok) return [];
    scenariosCache = await res.json();
    return scenariosCache!;
  } catch {
    return [];
  }
}

export async function matchDemoScenario(input: string): Promise<string | null> {
  const scenarios = await loadScenarios();
  const normalized = input.toLowerCase().replace(/\s+/g, "");
  for (const s of scenarios) {
    if (s.keywords.some((kw) => normalized.includes(kw.toLowerCase().replace(/\s+/g, "")))) {
      return s.id;
    }
  }
  return null;
}

export async function loadDemoCache(scenarioId: string): Promise<DemoCacheResult | null> {
  try {
    const res = await fetch(`/demo-cache/scenario-${scenarioId}.json`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
