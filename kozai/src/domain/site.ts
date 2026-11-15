// 解体現場の入力の決まり。

/** 受け付ける最も古い建築年 */
export const MIN_BUILT_YEAR = 1600;

/** 建築年として受け付けるか（不明は null で表し、ここでは扱わない） */
export function isValidBuiltYear(year: unknown, currentYear: number): year is number {
  return typeof year === "number" && Number.isInteger(year) && year >= MIN_BUILT_YEAR && year <= currentYear;
}

/** 建物の種類の候補（自由入力も受け付ける） */
export const SITE_KINDS: readonly string[] = ["町家", "農家住宅", "商家", "長屋", "蔵", "寺社", "その他"];
