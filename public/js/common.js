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

const SETTINGS_HTML = `
<dialog id="settings" class="settings">
  <form method="dialog" class="settings-body" id="settings-form">
    <h2>設定</h2>
    <label class="field"><span>Claude API キー</span>
      <input type="password" id="api-key" autocomplete="off" spellcheck="false" placeholder="sk-ant-...">
    </label>
    <p class="muted">キーはこの端末のブラウザ（localStorage）にだけ保存し、Claude API への送信にだけ使う。未設定ならデモ用の推定で動く。共有の端末では使い終わったら削除する。<a href="https://console.anthropic.com/" target="_blank" rel="noopener">Anthropic Console</a> でキーに利用上限を設定しておく。</p>
    <p class="muted" id="key-status"></p>
    <div class="settings-actions">
      <button class="btn small" type="button" id="key-save">保存して確認</button>
      <button class="btn ghost small" type="button" id="key-clear">削除</button>
    </div>
    <hr>
    <h3 style="font-size:15px">デモデータ</h3>
    <p class="muted">出品・問い合わせはこのブラウザ（IndexedDB）に保存される。初期化するとサンプルの出品だけに戻る。</p>
    <button class="btn ghost small" type="button" id="data-reset">デモデータを初期化</button>
    <div class="settings-actions" style="margin-top:16px"><button class="btn small" value="close">閉じる</button></div>
  </form>
</dialog>`;

function renderBadge(badge) {
  const demo = !settings.getApiKey();
  badge.textContent = demo ? "AI: デモ用推定（キー未設定）" : "AI: Claude";
  badge.classList.toggle("demo", demo);
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
  const open = () => {
    $("api-key").value = settings.getApiKey();
    status(settings.getApiKey() ? "キーを保存済み。" : "キーは未設定。");
    dialog.showModal();
  };
  badge.addEventListener("click", open);
  gear.addEventListener("click", open);

  $("key-save").addEventListener("click", async () => {
    const key = $("api-key").value.trim();
    if (!key) return status("キーを入力する。");
    settings.setApiKey(key);
    renderBadge(badge);
    status("確認中…");
    const r = await settings.verifyApiKey(key);
    status(r.ok ? "保存した。キーは有効。" : `保存した。確認に失敗：${r.message}`);
  });
  $("key-clear").addEventListener("click", () => {
    settings.clearApiKey();
    $("api-key").value = "";
    renderBadge(badge);
    status("キーを削除した。デモ用の推定で動く。");
  });
  $("data-reset").addEventListener("click", async () => {
    if (!confirm("このブラウザに保存した出品・問い合わせを消して、サンプルの出品だけに戻す。")) return;
    try {
      await settings.resetData();
      location.reload();
    } catch (e) {
      alert(e.message);
    }
  });
}
