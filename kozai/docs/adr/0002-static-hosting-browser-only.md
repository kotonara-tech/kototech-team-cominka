# ADR 0002：GitHub Pages で公開し、ブラウザ内で完結させる

- 状態：採用
- 日付：2026-11-15

## 背景

デモを GitHub Pages（静的ホスティング）で公開する。Pages ではサーバー側の処理を実行できない。
Claude API キーは利用者が設定画面から入力し、ブラウザに保存する。

## 決定

- Node.js の HTTP サーバーをやめ、application 層をブラウザ内で実行する。画面は従来と同じパスの API（`/api/listings` など）を、ネットワークを介さずに呼ぶ（`src/interface/routes.ts`）
- 保存先は IndexedDB。写真は data URL として出品データに含める
- Claude API はブラウザから直接呼ぶ（SDK の `dangerouslyAllowBrowser: true`）。API キーは localStorage に保存する
- キーが未設定ならデモ用鑑定を使う
- ビルドは esbuild で 1 ファイルにまとめ、GitHub Actions で Pages に配置する

## 理由

- 静的ホスティングだけで動き、運用費がかからない
- 利用者が自分のキーを使うため、公開サイトに運営側のキーを置かずに済む

## 影響

- データは端末（ブラウザ）ごとに分かれる。スマホで出品した廃材は PC のマーケットには出ない。デモは同じ端末で出品とマーケットを見せる
- API キーはその端末のブラウザに平文で残る。共有端末では使い終わったら設定画面で削除する。キーには Console で利用上限を設定する
- ブラウザの保存容量の上限（数十〜数百 MB）を超えると保存できない。設定画面からデモデータを初期化できるようにする
- 写真の寸法精度の評価（`scripts/eval-photos.ts`）は Node.js から application 層を直接呼び、キーは `.env` から読む
