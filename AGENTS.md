# AGENTS.md

このリポジトリで作業する AI コーディングエージェント向けのルール。
設計の正は `docs/design.md`、API 契約の正は `docs/api/openapi.yaml`。これらと矛盾する実装をしない。

## 作業の原則
- 担当範囲以外のファイルを変更しない
- API 契約にない入出力・エラー・デフォルト値を追加しない。必要なら作業を止めて質問する
- 仕様が不明なときは推測で埋めず、`QUESTIONS:` として最後にまとめて報告する

## 設計・実装の原則
- 依存は内側へだけ：`src/domain` は他の層・外部 SDK を import しない。`src/application` は domain とポートの型だけを使う
- 重量・価格・CO2・出品可否の計算は `src/domain` の純粋関数に置き、テストを付ける。画面（`public/`）に計算を書かない
- AI に推定させるのは写真から見て分かること（種類・材質候補・寸法・状態・文章）だけ
- 材料の種類ごとの値（密度・単価・石綿のおそれ）は `src/domain/materials.ts` の表に集める。switch を散らさない
- 1 ファイル 600 行・1 関数 150 行を超えない
- 使われなくなったコードは同じ変更で消す

## ディレクトリ構成
```
src/
  domain/              … 材料表・見積・出品可否・用途（純粋関数）
  application/         … ユースケースとポート（Appraiser・Store）
  infrastructure/      … Claude 鑑定・デモ用鑑定・MemoryStore・サンプルデータ
    browser/           … IndexedDB 保存・API キー（localStorage）・キーで切り替える鑑定器
  interface/           … routes.ts（API のパス → ユースケース）
    browser/main.ts    … ブラウザ用の組み立て。esbuild で dist/js/app.js にまとめる
public/                … 画面（index.html・market.html・js/・css/・img/）。パスは相対パスにする
scripts/               … build.ts（ビルド・開発サーバー）・eval-photos.ts（寸法精度の評価）
test/                  … node:test のテスト
dist/                  … ビルド結果（GitHub Pages に配置）。git に入れない
docs/                  … PRD・設計書・API 契約・ADR
```

## コマンド
- 開発サーバー：`npm run dev`（http://localhost:8787 、変更を監視して再ビルド）
- ビルド：`npm run build`（dist/ を作る）
- テスト：`npm test`
- 型チェック：`npm run typecheck`
- 寸法精度の評価：`npm run eval -- eval/manifest.json`（キーは .env から読む）
- 公開：main に push すると GitHub Actions がテスト・ビルドして GitHub Pages に配置する

## 規約
- 言語：TypeScript（Node.js 24 以上の型除去で直接実行。画面用は esbuild でまとめる。`enum`・`namespace` など型除去で消えない構文を使わない。import は拡張子 `.ts` まで書く）
- エラー：API 契約のエラーコードを使う。内部例外をそのまま返さない
- 秘密情報：コードに書かない。画面の API キーは利用者が設定画面で入力し localStorage に保存する。評価スクリプトは .env から読む

## 完了の定義
- [ ] `npm test`・`npm run typecheck`・`npm run build` が通る
- [ ] 足した計算にテストがある
- [ ] 契約（docs/api）どおりの入出力・エラーになっている
- [ ] 変更点と、推測した箇所（あれば）を報告した
