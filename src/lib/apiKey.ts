// API 키 암호화 저장/복호화 유틸리티
// AES-GCM + PBKDF2 기반, PIN 없이 앱 고유 시드로 암호화

const STORAGE_KEY = "ct_gen_ak";
const SALT_KEY = "ct_gen_salt";
const MODE_KEY = "ct_gen_mode"; // "workinggroup" 모드 여부
const APP_SEED = "CTGenerator-2026-HyundaiCard";

async function deriveKey(salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const rawKey = encoder.encode(APP_SEED + location.origin);
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    rawKey.buffer as ArrayBuffer,
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt.buffer as ArrayBuffer, iterations: 100000, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/** API 키를 암호화하여 localStorage에 저장 */
export async function encryptAndSave(apiKey: string): Promise<void> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(salt);
  const encoded = new TextEncoder().encode(apiKey);
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv.buffer as ArrayBuffer }, key, encoded.buffer as ArrayBuffer);

  localStorage.setItem(SALT_KEY, btoa(String.fromCharCode(...salt)));
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    iv: btoa(String.fromCharCode(...iv)),
    data: btoa(String.fromCharCode(...new Uint8Array(encrypted))),
  }));
  localStorage.removeItem(MODE_KEY);
}

/** localStorage에서 복호화하여 API 키 반환 */
export async function loadKey(): Promise<string | null> {
  try {
    const saltB64 = localStorage.getItem(SALT_KEY);
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!saltB64 || !stored) return null;

    const salt = Uint8Array.from(atob(saltB64), (c) => c.charCodeAt(0));
    const { iv: ivB64, data: dataB64 } = JSON.parse(stored);
    const iv = Uint8Array.from(atob(ivB64), (c) => c.charCodeAt(0));
    const data = Uint8Array.from(atob(dataB64), (c) => c.charCodeAt(0));

    const key = await deriveKey(salt);
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv.buffer as ArrayBuffer }, key, data.buffer as ArrayBuffer);
    return new TextDecoder().decode(decrypted);
  } catch {
    return null;
  }
}

/** 저장된 키 삭제 */
export function clearKey(): void {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(SALT_KEY);
  localStorage.removeItem(MODE_KEY);
}

/** 저장된 키가 있는지 확인 */
export function hasStoredKey(): boolean {
  return !!localStorage.getItem(STORAGE_KEY) || isWorkingGroup();
}

/** workinggroup 모드 설정 (서버 env 키 사용) */
export function setWorkingGroup(): void {
  localStorage.setItem(MODE_KEY, "1");
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(SALT_KEY);
}

/** workinggroup 모드인지 확인 */
export function isWorkingGroup(): boolean {
  return localStorage.getItem(MODE_KEY) === "1";
}
