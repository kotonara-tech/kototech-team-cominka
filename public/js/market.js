// マーケット画面：作りたいもの・種類・長さ・キーワードで検索し、詳細から問い合わせる。

import { api, CATEGORY_NAMES, CONDITION_NAMES, esc, hazardHtml, kg, mm, mountSettings, requestId, yen } from "./common.js";

mountSettings();

const $ = (id) => document.getElementById(id);
const filter = { recipe: "", q: "", category: "", minLength: "" };

const catalog = await api("/api/catalog");
$("category").innerHTML += Object.entries(CATEGORY_NAMES).map(([k, v]) => `<option value="${k}">${v}</option>`).join("");
$("recipes").innerHTML = catalog.recipes
  .map((r) => `<button class="recipe" data-key="${r.key}" aria-pressed="false"><b>${esc(r.name)}</b><small>${esc(r.needs)}</small></button>`)
  .join("");

$("recipes").addEventListener("click", (e) => {
  const btn = e.target.closest(".recipe");
  if (!btn) return;
  filter.recipe = filter.recipe === btn.dataset.key ? "" : btn.dataset.key;
  for (const b of $("recipes").children) b.setAttribute("aria-pressed", String(b.dataset.key === filter.recipe));
  load();
});
let debounce;
$("q").addEventListener("input", () => {
  clearTimeout(debounce);
  debounce = setTimeout(() => ((filter.q = $("q").value.trim()), load()), 250);
});
$("category").addEventListener("change", () => ((filter.category = $("category").value), load()));
$("minLength").addEventListener("change", () => ((filter.minLength = $("minLength").value), load()));

function card(l) {
  return `<button class="card" data-id="${l.id}">
    <div class="thumb"><img src="${esc(l.imageUrl)}" alt="" loading="lazy"></div>
    <div class="body">
      <div class="title">${esc(l.title)}</div>
      <div class="spec">${esc(l.materialName)}・${mm(l.dimensions)}</div>
      <div class="prov">${esc(l.provenance)}</div>
      <div class="foot"><span class="price">${yen(l.priceYen)}</span><span class="spec">約${kg(l.estimate.weightKg)}</span></div>
    </div>
  </button>`;
}

async function load() {
  const params = new URLSearchParams(Object.entries(filter).filter(([, v]) => v));
  const { listings } = await api(`/api/listings?${params}`);
  const recipe = catalog.recipes.find((r) => r.key === filter.recipe);
  $("meta").textContent = `${listings.length} 件${recipe ? `（${recipe.name}：${recipe.needs}）` : ""}`;
  $("grid").innerHTML = listings.length ? listings.map(card).join("") : `<p class="muted">条件に合う古材はまだない。</p>`;
}

$("grid").addEventListener("click", (e) => {
  const c = e.target.closest(".card");
  if (c) location.hash = c.dataset.id;
});

function detailHtml(l) {
  const e = l.estimate;
  const weight = e.weightSource === "measured" ? `${kg(e.weightKg)}（実測）` : `約${kg(e.weightKg)}（推定 ${kg(e.weightMinKg)}〜${kg(e.weightMaxKg)}）`;
  const chips = (list, cls) => list.map((t) => `<span class="chip ${cls}">${esc(t)}</span>`).join("");
  return `<div class="detail">
    <div class="media"><img src="${esc(l.imageUrl)}" alt=""></div>
    <div class="info">
      <div class="prov-line">${esc(l.provenance)}</div>
      <h2>${esc(l.title)}</h2>
      <div class="price" style="font-family:var(--serif);font-size:26px;font-weight:700">${yen(l.priceYen)}</div>
      <table class="spec">
        <tr><th>材質</th><td>${esc(l.materialName)}</td></tr>
        <tr><th>寸法</th><td>${mm(l.dimensions)}</td></tr>
        <tr><th>重量</th><td>${weight}</td></tr>
        <tr><th>状態</th><td>${CONDITION_NAMES[l.condition]}</td></tr>
        <tr><th>運搬の目安</th><td>${esc(e.carry)}</td></tr>
        ${e.co2Kg !== null ? `<tr><th>CO2 固定量</th><td>${kg(e.co2Kg)}（再利用で大気に戻さない分）</td></tr>` : ""}
        <tr><th>解体現場</th><td>${esc(l.site.name)}</td></tr>
      </table>
      ${hazardHtml(e.hazard)}
      <p style="font-size:14px">${esc(l.description)}</p>
      ${l.features.length ? `<div class="chips" style="margin-bottom:8px">${chips(l.features, "wood")}</div>` : ""}
      ${l.ideas.length ? `<div class="muted">作れるもの</div><div class="chips" style="margin:4px 0 14px">${chips(l.ideas, "moss")}</div>` : ""}
      <form id="inquiry" class="panel" style="margin:0">
        <h3 style="font-size:15px">購入希望・問い合わせ <span class="muted" id="inq-count">${l.inquiryCount ? `（${l.inquiryCount} 件）` : ""}</span></h3>
        <div class="seg" style="margin-bottom:10px">
          <label><input type="radio" name="kind" value="purchase" checked>購入希望</label>
          <label><input type="radio" name="kind" value="question">質問</label>
        </div>
        <label class="field"><span>お名前</span><input type="text" name="name" maxlength="40" required></label>
        <label class="field"><span>メッセージ</span><textarea name="message" maxlength="500" required placeholder="受け取り希望日、用途など"></textarea></label>
        <button class="btn block" type="submit">送信する</button>
        <p class="muted" id="inq-result" hidden></p>
      </form>
    </div>
  </div>`;
}

async function openFromHash() {
  const id = location.hash.slice(1);
  if (!id) return $("dialog").open && $("dialog").close();
  try {
    const l = await api(`/api/listings/${encodeURIComponent(id)}`);
    $("detail").innerHTML = detailHtml(l);
    bindInquiry(l.id);
    if (!$("dialog").open) $("dialog").showModal();
  } catch {
    history.replaceState(null, "", location.pathname);
  }
}

function bindInquiry(listingId) {
  const form = $("inquiry");
  const rid = requestId();
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const fd = new FormData(form);
    const btn = form.querySelector("button");
    btn.disabled = true;
    try {
      await api(`/api/listings/${listingId}/inquiries`, {
        method: "POST",
        body: { requestId: rid, name: fd.get("name"), kind: fd.get("kind"), message: fd.get("message") },
      });
      $("inq-result").textContent = "送信した。出品者から連絡が届く。";
      $("inq-result").hidden = false;
      btn.textContent = "送信済み";
      load();
    } catch (e) {
      $("inq-result").textContent = e.message;
      $("inq-result").hidden = false;
      btn.disabled = false;
    }
  });
}

$("close").addEventListener("click", () => $("dialog").close());
$("dialog").addEventListener("close", () => history.replaceState(null, "", location.pathname));
$("dialog").addEventListener("click", (e) => e.target === $("dialog") && $("dialog").close());
window.addEventListener("hashchange", openFromHash);

await load();
openFromHash();
