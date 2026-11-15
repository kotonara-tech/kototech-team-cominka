// 画面共通：API 呼び出し・表示用の整形・画像の縮小・設定画面。計算（重量・価格など）はここに書かない。

import { request, settings } from "./app.js";

export class ApiError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

/** アプリ本体（ブラウザ内）を API と同じパスで呼ぶ */
export async function api(path, { method = "GET", body } = {}) {
  const res = await request(method, path, body);
  if (res.status >= 400) throw new ApiError(res.body.error?.code ?? "UNAVAILABLE", res.body.error?.message ?? "エラー");
  return res.body;
}

export const yen = (n) => `¥${Number(n).toLocaleString("ja-JP")}`;
export const mm = (d) => `${d.lengthMm.toLocaleString()}×${d.widthMm.toLocaleString()}×${d.thicknessMm.toLocaleString()} mm`;
export const kg = (v) => `${Number(v).toLocaleString("ja-JP", { maximumFractionDigits: 1 })} kg`;

export const CONDITION_NAMES = { good: "良", fair: "並（経年変化あり）", poor: "難あり" };
export const CATEGORY_NAMES = {
  timber: "木材", fitting: "建具", metal: "金物・金属", roof: "屋根材", glass: "ガラス", board: "成形板", other: "その他",
};

export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

export function requestId() {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** 長辺 1568px の JPEG に縮小して base64 を返す */
export async function shrinkImage(file, maxSide = 1568) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
  return { dataUrl, base64: dataUrl.split(",")[1], mediaType: "image/jpeg" };
}

/** 出品可否の表示 */
export function hazardHtml(hazard) {
  if (hazard.level === "ok") return "";
  const title = hazard.level === "blocked" ? "出品できない（石綿含有のおそれ）" : "取り扱いの注意";
  return `<div class="notice ${hazard.level}"><b>${title}</b><ul>${hazard.reasons.map((r) => `<li>${esc(r)}</li>`).join("")}</ul></div>`;
}

export const PROVIDER_NAMES = { claude: "Claude", gemini: "Gemini", openai: "OpenAI" };

const SETTINGS_HTML = `
<dialog id="settings" class="settings">
  <form method="dialog" class="settings-body" id="settings-form">
    <h2>設定</h2>
    <div class="muted" style="margin-bottom:6px">鑑定に使う AI</div>
    <div class="seg" id="provider-seg" style="margin-bottom:12px"></div>
    <label class="field"><span id="key-label">API キー</span>
      <input type="password" id="api-key" autocomplete="off" spellcheck="false">
    </label>
    <label class="field"><span>モデル（空欄なら既定）</span>
      <input type="text" id="api-model" list="model-list" autocomplete="off" spellcheck="false">
      <datalist id="model-list"></datalist>
    </label>
    <label class="field" id="openai-base-field"><span>接続先 URL（中継を使う場合）</span>
      <input type="url" id="openai-base" placeholder="https://api.openai.com" autocomplete="off" spellcheck="false">
    </label>
    <p class="muted" id="openai-note">OpenAI はブラウザからの直接呼び出しを受け付けない。使う場合は中継（<a href="https://github.com/ohru131/kozai/blob/main/docs/openai-relay.md" target="_blank" rel="noopener">設置手順</a>）の URL を入れる。</p>
    <p class="muted">キーはこの端末のブラウザ（localStorage）にだけ保存し、選んだ AI の API への送信にだけ使う。キーが未設定ならデモ用の推定で動く。共有の端末では使い終わったら削除する。<a id="console-link" target="_blank" rel="noopener">管理画面</a>でキーに利用上限を設定しておく。</p>
    <p class="muted" id="key-status"></p>
    <div class="settings-actions">
      <button class="btn small" type="button" id="key-save">保存して確認</button>
      <button class="btn ghost small" type="button" id="key-clear">キーを削除</button>
    </div>
    <hr>
    <h3 style="font-size:15px">デモデータ</h3>
    <p class="muted">解体現場・出品・問い合わせはこのブラウザ（IndexedDB）に保存される。初期化するとサンプルだけに戻る。</p>
    <button class="btn ghost small" type="button" id="data-reset">デモデータを初期化</button>
    <div class="settings-actions" style="margin-top:16px"><button class="btn small" value="close">閉じる</button></div>
  </form>
</dialog>`;

function renderBadge(badge) {
  const mode = settings.activeMode(settings.load());
  badge.textContent = mode === "demo" ? "AI: デモ用推定（キー未設定）" : `AI: ${PROVIDER_NAMES[mode]}`;
  badge.classList.toggle("demo", mode === "demo");
}

/** ヘッダーに AI の状態と設定ボタンを置き、設定画面を用意する */
export function mountSettings() {
  const header = document.querySelector(".site-header");
  const badge = document.createElement("button");
  badge.type = "button";
  badge.className = "ai-badge";
  const gear = document.createElement("button");
  gear.type = "button";
  gear.className = "gear";
  gear.setAttribute("aria-label", "設定");
  gear.textContent = "⚙";
  header.querySelector(".brand").after(badge);
  header.append(gear);
  document.body.insertAdjacentHTML("beforeend", SETTINGS_HTML);
  renderBadge(badge);

  const $ = (id) => document.getElementById(id);
  const dialog = $("settings");
  const status = (text) => ($("key-status").textContent = text);
  $("provider-seg").innerHTML = settings.providers
    .map((p) => `<label><input type="radio" name="provider" value="${p.key}">${p.name}</label>`)
    .join("");

  // 画面に表示している AI（保存するまでは選択中の AI は変わらない）
  let shown = "claude";
  function show(provider) {
    const s = settings.load();
    const info = settings.providers.find((p) => p.key === provider);
    shown = provider;
    document.querySelector(`input[name="provider"][value="${provider}"]`).checked = true;
    $("key-label").textContent = `${info.name} の API キー`;
    $("api-key").value = s.keys[provider];
    $("api-model").value = s.models[provider];
    $("api-model").placeholder = info.defaultModel;
    $("model-list").innerHTML = info.models.map((m) => `<option value="${esc(m)}">`).join("");
    $("openai-base").value = s.openaiBaseUrl;
    $("openai-base-field").hidden = provider !== "openai";
    $("openai-note").hidden = provider !== "openai";
    $("console-link").href = info.consoleUrl;
    status(s.keys[provider] ? `${info.name} のキーを保存済み。` : `${info.name} のキーは未設定。`);
  }
  const open = () => {
    show(settings.load().provider);
    dialog.showModal();
  };
  badge.addEventListener("click", open);
  gear.addEventListener("click", open);
  $("provider-seg").addEventListener("change", (e) => show(e.target.value));

  $("key-save").addEventListener("click", async () => {
    const s = settings.load();
    s.provider = shown;
    s.keys[shown] = $("api-key").value.trim();
    s.models[shown] = $("api-model").value.trim();
    if (shown === "openai") s.openaiBaseUrl = $("openai-base").value.trim();
    settings.save(s);
    renderBadge(badge);
    if (!s.keys[shown]) return status(`${PROVIDER_NAMES[shown]} を選んだ。キーが未設定のためデモ用の推定で動く。`);
    status("確認中…");
    const r = await settings.verify(s, shown);
    status(r.ok ? `保存した。${r.message}。` : `保存した。確認に失敗：${r.message}`);
  });
  $("key-clear").addEventListener("click", () => {
    const s = settings.load();
    s.keys[shown] = "";
    settings.save(s);
    $("api-key").value = "";
    renderBadge(badge);
    status(`${PROVIDER_NAMES[shown]} のキーを削除した。`);
  });
  $("data-reset").addEventListener("click", async () => {
    if (!confirm("このブラウザに保存した解体現場・出品・問い合わせを消して、サンプルだけに戻す。")) return;
    try {
      await settings.resetData();
      location.reload();
    } catch (e) {
      alert(e.message);
    }
  });
}
