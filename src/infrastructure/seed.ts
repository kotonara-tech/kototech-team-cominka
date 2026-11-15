// 初回起動時のサンプルデータ（解体現場と出品）。現場・出品はすべて架空。

import type { Condition, Dimensions } from "../domain/estimate.ts";
import { evaluate, type Listing, type Site } from "../domain/listing.ts";
import { findMaterial } from "../domain/materials.ts";

const SITES: Site[] = [
  { id: "S-naramachi", name: "ならまちの町家（サンプル）", area: "奈良市ならまち", builtYear: 1920, kind: "町家" },
  { id: "S-uda", name: "大宇陀の農家住宅（サンプル）", area: "宇陀市大宇陀", builtYear: 1948, kind: "農家住宅" },
  { id: "S-imai", name: "今井町の商家（サンプル）", area: "橿原市今井町", builtYear: 1935, kind: "商家" },
];

type SeedItem = {
  siteId: string;
  part: string;
  materialKey: string;
  d: [number, number, number];
  condition: Condition;
  title: string;
  description: string;
  features: string[];
  ideas: string[];
  image: string;
  daysAgo: number;
};

const ITEMS: SeedItem[] = [
  {
    siteId: "S-naramachi", part: "梁", materialKey: "matsu", d: [3600, 210, 180], condition: "fair",
    title: "煤で黒く焼けた松の丸太梁", description: "かまど上の小屋組にあった松の梁。100年分の煤で黒く焼け、手斧の跡が残る。店舗の装飾梁やカウンターの脚に。",
    features: ["手斧の跡", "煤による古色"], ideas: ["装飾梁", "カウンターの脚"], image: "img/seed/beam.svg", daysAgo: 1,
  },
  {
    siteId: "S-naramachi", part: "床板", materialKey: "sugi", d: [1820, 300, 30], condition: "good",
    title: "幅広の杉の床板（1尺幅）", description: "座敷の床板。幅 1 尺の一枚板で、表面は艶が出ている。棚板やテーブル天板、カウンターの天板に。",
    features: ["幅広の一枚板", "艶のある木肌"], ideas: ["テーブル天板", "棚板"], image: "img/seed/board.svg", daysAgo: 2,
  },
  {
    siteId: "S-imai", part: "帳場の板", materialKey: "keyaki", d: [1950, 360, 45], condition: "good",
    title: "欅の厚板（商家の帳場）", description: "商家の帳場で使われていた欅の厚板。玉杢が出ている。カフェのカウンターや座卓の天板に向く。",
    features: ["玉杢", "厚み 45mm"], ideas: ["カウンター", "座卓"], image: "img/seed/keyaki.svg", daysAgo: 3,
  },
  {
    siteId: "S-naramachi", part: "建具", materialKey: "shoji", d: [1760, 880, 30], condition: "fair",
    title: "組子入りの障子戸", description: "座敷の障子戸。組子の意匠が残る。紙を張り替えて間仕切りに、照明の枠にも。",
    features: ["組子の意匠"], ideas: ["間仕切り", "照明の枠"], image: "img/seed/shoji.svg", daysAgo: 4,
  },
  {
    siteId: "S-uda", part: "窓", materialKey: "old_glass", d: [900, 450, 3], condition: "good",
    title: "昭和の型板ガラス（結霜）", description: "農家住宅の窓に入っていた型板ガラス。光を通すと模様が浮かぶ。照明のシェードや額装に。",
    features: ["昭和の型板模様"], ideas: ["照明のシェード", "額装"], image: "img/seed/glass.svg", daysAgo: 5,
  },
  {
    siteId: "S-uda", part: "屋根", materialKey: "kawara", d: [305, 305, 16], condition: "good",
    title: "いぶし瓦（10枚組の1枚）", description: "農家住宅の屋根のいぶし瓦。銀黒の色むらがある。花壇の縁取りや表札に。",
    features: ["いぶし銀の色"], ideas: ["花壇の縁取り", "表札"], image: "img/seed/kawara.svg", daysAgo: 6,
  },
  {
    siteId: "S-imai", part: "蔵の扉金具", materialKey: "iron", d: [420, 60, 6], condition: "fair",
    title: "蔵の扉の鉄製蝶番", description: "土蔵の扉に付いていた鍛造の蝶番。赤錆が味になっている。ドアハンドルやフックに。",
    features: ["鍛造", "赤錆"], ideas: ["ドアハンドル", "フック"], image: "img/seed/hinge.svg", daysAgo: 7,
  },
];

const DAY_MS = 86_400_000;

export function seedData(now = Date.now()): { sites: Site[]; listings: Listing[] } {
  const listings = ITEMS.map((item, i): Listing => {
    const material = findMaterial(item.materialKey)!;
    const site = SITES.find((s) => s.id === item.siteId)!;
    const dimensions: Dimensions = { lengthMm: item.d[0], widthMm: item.d[1], thicknessMm: item.d[2] };
    const estimate = evaluate(material, site, { dimensions, condition: item.condition, asbestosSurvey: "none" });
    return {
      id: `L-seed${i + 1}`,
      siteId: site.id,
      part: item.part,
      materialKey: material.key,
      materialName: material.name,
      category: material.category,
      dimensions,
      condition: item.condition,
      asbestosSurvey: "none",
      title: item.title,
      description: item.description,
      features: item.features,
      ideas: item.ideas,
      priceYen: estimate.suggestedPriceYen,
      imageUrl: item.image,
      estimate,
      createdAt: new Date(now - item.daysAgo * DAY_MS).toISOString(),
    };
  });
  return { sites: SITES, listings };
}
