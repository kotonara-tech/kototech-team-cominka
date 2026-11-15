// 出品画面：撮影 → 鑑定 → 確認・修正（見積はアプリ本体で再計算）→ 出品。

import { api, CATEGORY_NAMES, esc, hazardHtml, kg, mountSettings, requestId, shrinkImage, yen } from "./common.js";

const $ = (id) => document.getElementById(id);
const state = { photo: null, startedAt: 0, suggested: 0, priceTouched: false, requestId: "", blocked: false };

mountSettings();
const catalog = await api("/api/catalog");
const { sites } = await api("/api/sites");
$("site").innerHTML = sites.map((s) => `<option value="${s.id}">${esc(s.name)}（${s.builtYear}年頃・${esc(s.area)}）</option>`).join("");
{
  const groups = Object.entries(CATEGORY_NAMES).map(([cat, name]) => {
    const opts = catalog.materials.filter((m) => m.category === cat).map((m) => `<option value="${m.key}">${esc(m.name)}</option>`).join("");
    return opts ? `<optgroup label="${name}">${opts}</optgroup>` : "";
  });
  $("material").innerHTML = groups.join("");
}

// 2. 撮影
$("photo").addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  state.photo = await shrinkImage(file);
  state.startedAt = Date.now();
  $("preview").src = state.photo.dataUrl;
  $("preview").hidden = false;
  $("drop-hint").hidden = true;
  $("appraise").disabled = false;
});

$("appraise").addEventListener("click", async () => {
  $("appraise").disabled = true;
  $("appraising").hidden = false;
  $("appraise-error").hidden = true;
  try {
    const result = await api("/api/appraisals", {
      method: "POST",
      body: {
        imageBase64: state.photo.base64,
        mediaType: state.photo.mediaType,
        reference: document.querySelector('input[name="ref"]:checked').value,
        memo: $("memo").value,
        siteId: $("site").value,
      },
    });
    fillReview(result);
  } catch (e) {
    $("appraise-error").textContent = `${e.message}`;
    $("appraise-error").hidden = false;
    // 失敗しても手入力で出品できるようにする
    fillReview(null);
  } finally {
    $("appraising").hidden = true;
    $("appraise").disabled = false;
  }
});

const chips = (list, cls = "") => list.map((t) => `<span class="chip ${cls}">${esc(t)}</span>`).join("");

function fillReview(result) {
  state.requestId = requestId();
  state.priceTouched = false;
  const ai = result?.ai;
  $("ai-source").textContent = result
    ? result.source === "claude" ? "Claude が推定した値。違う箇所を直してから出品する。" : "デモ用の推定値（API キー未設定。右上の設定から登録できる）。違う箇所を直してから出品する。"
    : "鑑定できなかったため手入力する。";
  $("title").value = ai?.title ?? "";
  if (ai) $("material").value = ai.materialKey;
  $("part").value = guessPart($("memo").value);
  $("candidates").innerHTML = ai ? `<span class="muted" style="font-size:12px">候補：</span>${chips(ai.materialCandidates)}` : "";
  $("len").value = ai?.dimensions.lengthMm ?? "";
  $("wid").value = ai?.dimensions.widthMm ?? "";
  $("thk").value = ai?.dimensions.thicknessMm ?? "";
  $("basis").textContent = ai ? `推定の根拠：${ai.dimensionBasis}` : "";
  $("condition").value = ai?.condition ?? "fair";
  $("defects").innerHTML = ai?.defects.length ? `<span class="muted" style="font-size:12px">欠点：</span>${chips(ai.defects)}` : "";
  $("measured").value = "";
  $("survey").value = "none";
  $("description").value = ai?.description ?? "";
  $("features").innerHTML = chips(ai?.features ?? [], "wood");
  state.ideas = ai?.ideas ?? [];
  state.features = ai?.features ?? [];
  $("review").hidden = false;
  if (result) renderEstimate(result.estimate);
  else refreshEstimate();
  $("review").scrollIntoView({ behavior: "smooth", block: "start" });
}

function guessPart(memo) {
  const parts = ["梁", "柱", "床板", "天井板", "敷居", "鴨居", "建具", "障子", "欄間", "瓦", "窓", "扉", "外壁"];
  return parts.find((p) => memo.includes(p)) ?? "";
}

function renderEstimate(e) {
  $("e-weight").textContent = kg(e.weightKg);
  $("e-weight-s").textContent = e.weightSource === "measured" ? "実測値" : `推定 ${kg(e.weightMinKg)}〜${kg(e.weightMaxKg)}`;
  $("e-volume").textContent = `${e.volumeM3.toFixed(4)} m³`;
  $("e-co2").textContent = e.co2Kg === null ? "—" : kg(e.co2Kg);
  $("e-carry").textContent = e.carry;
  $("hazard").innerHTML = hazardHtml(e.hazard);
  state.blocked = e.hazard.level === "blocked";
  $("survey-field").hidden = !(state.blocked || $("survey").value !== "none");
  $("submit").disabled = state.blocked;
  state.suggested = e.suggestedPriceYen;
  $("suggested").textContent = `参考価格 ${yen(e.suggestedPriceYen)}（材質・体積・状態から計算）`;
  if (!state.priceTouched) $("price").value = e.suggestedPriceYen;
  const uses = [...new Set([...state.ideas, ...e.uses])];
  $("ideas").innerHTML = chips(uses, "moss");
  state.uses = uses;
}

function formBody() {
  return {
    siteId: $("site").value,
    materialKey: $("material").value,
    dimensions: { lengthMm: Number($("len").value), widthMm: Number($("wid").value), thicknessMm: Number($("thk").value) },
    condition: $("condition").value,
    measuredWeightKg: $("measured").value ? Number($("measured").value) : undefined,
    asbestosSurvey: $("survey").value,
  };
}

let debounce;
function refreshEstimate() {
  clearTimeout(debounce);
  debounce = setTimeout(async () => {
    const body = formBody();
    if (!(body.dimensions.lengthMm > 0 && body.dimensions.widthMm > 0 && body.dimensions.thicknessMm > 0)) return;
    try {
      renderEstimate(await api("/api/estimates", { method: "POST", body }));
    } catch (e) {
      $("submit-error").textContent = e.message;
      $("submit-error").hidden = false;
    }
  }, 250);
}

for (const id of ["material", "len", "wid", "thk", "condition", "measured", "survey", "site"]) {
  $(id).addEventListener("input", () => {
    $("submit-error").hidden = true;
    if (!$("review").hidden) refreshEstimate();
  });
}
$("price").addEventListener("input", () => (state.priceTouched = true));
$("reset-price").addEventListener("click", () => {
  state.priceTouched = false;
  $("price").value = state.suggested;
});

const elapsed = () => Math.round((Date.now() - state.startedAt) / 1000);
setInterval(() => {
  if (!$("review").hidden && state.startedAt) $("timer").innerHTML = `撮影から <b>${elapsed()}</b> 秒`;
}, 1000);

$("review").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  if (state.blocked) return;
  $("submit").disabled = true;
  try {
    const listing = await api("/api/listings", {
      method: "POST",
      body: {
        ...formBody(),
        requestId: state.requestId,
        part: $("part").value,
        title: $("title").value,
        description: $("description").value,
        features: state.features,
        ideas: state.uses,
        priceYen: Number($("price").value),
        imageBase64: state.photo.base64,
        mediaType: state.photo.mediaType,
      },
    });
    $("done-time").innerHTML = `撮影から出品まで <b>${elapsed()}</b> 秒`;
    $("done-prov").textContent = listing.provenance;
    $("done-link").href = `market.html#${listing.id}`;
    $("capture").hidden = true;
    $("review").hidden = true;
    $("done").hidden = false;
    window.scrollTo({ top: 0 });
  } catch (e) {
    $("submit-error").textContent = e.message;
    $("submit-error").hidden = false;
  } finally {
    $("submit").disabled = state.blocked;
  }
});

$("again").addEventListener("click", () => {
  state.photo = null;
  $("photo").value = "";
  $("preview").hidden = true;
  $("drop-hint").hidden = false;
  $("memo").value = "";
  $("appraise").disabled = true;
  $("done").hidden = true;
  $("capture").hidden = false;
});
