/** Mulberry32 pseudo-random generator; stable because map visuals depend on its stream. */
export function mulberry32(seed: number): () => number {
  let value = seed;
  return () => {
    value |= 0;
    value = (value + 0x6d2b79f5) | 0;
    let mixed = Math.imul(value ^ (value >>> 15), 1 | value);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a string hash used to seed deterministic procedural streams. */
export function hashString(value: string): number {
  let hash = 2166136261 >>> 0;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function seededRng(seed: string): () => number {
  return mulberry32(hashString(seed));
}

/** Stable color-tone choice shared by terrain faces and water-bank geometry. */
export function positionToneIndex(x: number, z: number, toneCount: number): number {
  const hash = Math.abs(Math.sin(x * 12.9898 + z * 78.233) * 43758.5453);
  return Math.floor(hash % toneCount);
}
