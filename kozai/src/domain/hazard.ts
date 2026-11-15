// 出品可否：石綿含有のおそれと取り扱い注意の判定。

import type { Material } from "./materials.ts";

export type AsbestosSurvey = "none" | "not_detected" | "detected";

export type HazardLevel = "ok" | "caution" | "blocked";

export type Hazard = { level: HazardLevel; reasons: string[] };

/** 石綿含有率 0.1% 超の製品の製造・使用等が全面禁止された年（2006年9月） */
export const ASBESTOS_BAN_YEAR = 2006;

export function isAsbestosSurvey(value: unknown): value is AsbestosSurvey {
  return value === "none" || value === "not_detected" || value === "detected";
}

/** 築年が不明（null）なら全面禁止より前の建物として判定する */
export function judgeHazard(material: Material, builtYear: number | null, survey: AsbestosSurvey): Hazard {
  const suspected = material.asbestosRisk && (builtYear === null || builtYear <= ASBESTOS_BAN_YEAR);
  if (suspected && survey === "detected") {
    return {
      level: "blocked",
      reasons: ["分析調査で石綿が検出された建材は出品できない。石綿含有廃棄物として処理する"],
    };
  }
  if (suspected && survey === "none") {
    return {
      level: "blocked",
      reasons: [
        `${material.name}は${ASBESTOS_BAN_YEAR}年以前の製品に石綿を含むものがある${builtYear === null ? "（築年不明のため以前として扱う）" : ""}。分析調査で「不検出」の結果がない限り出品できない`,
      ],
    };
  }
  const reasons = [...material.cautions];
  if (suspected && survey === "not_detected") {
    reasons.unshift("分析調査で石綿は不検出。調査結果の写しを購入者に渡す");
  }
  return { level: reasons.length > 0 ? "caution" : "ok", reasons };
}
