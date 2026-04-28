// 로컬 디바이스 저장. 옛 supabase의 ct_logs / ct_reports 역할.
// localStorage는 도메인당 ~5MB 한도라 각 키마다 최근 200개만 유지.

import { getDeviceId } from "./deviceId";

const LOG_KEY = "ct_logs";
const REPORT_KEY = "ct_reports";
const MAX_ENTRIES = 200;

interface LogEntry {
  ts: number;
  device_id: string;
  [k: string]: unknown;
}

function safeGetArray(key: string): LogEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function safeSetArray(key: string, entries: LogEntry[]) {
  if (typeof window === "undefined") return;
  try {
    // 최근 MAX_ENTRIES개만 유지 (오래된 것부터 drop)
    const trimmed = entries.length > MAX_ENTRIES ? entries.slice(-MAX_ENTRIES) : entries;
    window.localStorage.setItem(key, JSON.stringify(trimmed));
  } catch (e) {
    // QuotaExceededError 등 — 한 번 더 줄여서 재시도
    try {
      window.localStorage.setItem(key, JSON.stringify(entries.slice(-50)));
    } catch {
      console.warn("[localLog] write failed:", e);
    }
  }
}

/** 활동 로그 (옛 ct_logs). 생성 흐름의 모든 단계가 호출. */
export function appendLog(data: Record<string, unknown>) {
  const entry: LogEntry = {
    ts: Date.now(),
    device_id: getDeviceId(),
    ...data,
  };
  const entries = safeGetArray(LOG_KEY);
  entries.push(entry);
  safeSetArray(LOG_KEY, entries);
}

/** 유저 리포트 (옛 ct_reports). 좋아요/싫어요/메모. */
export interface ReportData {
  card_state: Record<string, unknown>;
  rating?: "good" | "bad" | null;
  user_memo?: string;
}

export function appendReport(report: ReportData): boolean {
  try {
    const entry: LogEntry = {
      ts: Date.now(),
      device_id: getDeviceId(),
      ...report,
      resolved: false,
    };
    const entries = safeGetArray(REPORT_KEY);
    entries.push(entry);
    safeSetArray(REPORT_KEY, entries);
    return true;
  } catch (e) {
    console.error("[localLog] report failed:", e);
    return false;
  }
}

/** 디버그용 — 콘솔에서 보기 */
export function getAllLogs() {
  return { logs: safeGetArray(LOG_KEY), reports: safeGetArray(REPORT_KEY) };
}

export function clearAllLogs() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(LOG_KEY);
  window.localStorage.removeItem(REPORT_KEY);
}
