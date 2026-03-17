/** 34byte 체크 (한글 2byte, 영문/숫자 1byte) */
export function getByteLength(str: string): number {
  let bytes = 0;
  for (const ch of str.replace(/\n/g, "")) {
    bytes += ch.charCodeAt(0) > 127 ? 2 : 1;
  }
  return bytes;
}

/** 34byte 이내로 자르기 */
export function truncateToBytes(str: string, maxBytes: number = 34): string {
  let bytes = 0;
  let i = 0;
  for (const ch of str) {
    const charBytes = ch.charCodeAt(0) > 127 ? 2 : 1;
    if (bytes + charBytes > maxBytes) break;
    bytes += charBytes;
    i += ch.length;
  }
  return str.slice(0, i);
}
