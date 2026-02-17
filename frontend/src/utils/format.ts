/**
 * Formats seconds into MM:SS.ms or H:MM:SS.ms if hours exist.
 */
export const formatTimeDisplay = (totalSeconds: number): string => {
  if (totalSeconds < 0) totalSeconds = 0;

  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  // Shows 2 digits for milliseconds to match frame precision (approx)
  const ms = Math.floor((totalSeconds % 1) * 100);

  const mStr = m.toString().padStart(2, '0');
  const sStr = s.toString().padStart(2, '0');
  const msStr = ms.toString().padStart(2, '0');

  if (h > 0) {
    return `${h}:${mStr}:${sStr}.${msStr}`;
  }
  return `${mStr}:${sStr}.${msStr}`;
};
