/**
 * Whether a question's choices fit as a row of tiles (two lines each) on a phone; otherwise
 * they're offered as a menu. Rough CJK metrics: ~340pt of row, 5pt gaps, 13pt per character.
 */
export function fitsSegments(labels: string[]) {
  const n = labels.length;
  if (n === 0 || n > 6) return false;
  const perLine = Math.floor(((340 - 5 * (n - 1)) / n - 8) / 13);
  return labels.every((l) => [...l].length <= perLine * 2);
}
