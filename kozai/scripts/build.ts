// public/ を dist/ に写し、アプリ本体（src/interface/browser/main.ts）を dist/js/app.js にまとめる。
// 使い方：node scripts/build.ts        … dist/ を作る（GitHub Pages に配置する内容）
//         node scripts/build.ts --serve … 変更を監視しながら http://localhost:8787/ で配信する

import * as esbuild from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const serve = process.argv.includes("--serve");

fs.rmSync(dist, { recursive: true, force: true });
fs.cpSync(path.join(root, "public"), dist, { recursive: true });
// GitHub Pages の Jekyll 処理を止める
fs.writeFileSync(path.join(dist, ".nojekyll"), "");

const options: esbuild.BuildOptions = {
  entryPoints: [path.join(root, "src/interface/browser/main.ts")],
  outfile: path.join(dist, "js/app.js"),
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  minify: !serve,
  sourcemap: serve,
  logLevel: "info",
};

if (serve) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  // public/ の変更も dist/ に写す
  fs.watch(path.join(root, "public"), { recursive: true }, (_e, file) => {
    if (!file) return;
    const src = path.join(root, "public", file);
    if (fs.existsSync(src) && fs.statSync(src).isFile()) fs.cpSync(src, path.join(dist, file));
  });
  const { port } = await ctx.serve({ servedir: dist, port: Number(process.env.PORT ?? 8787) });
  console.log(`古材リレー http://localhost:${port}/`);
} else {
  await esbuild.build(options);
}
