import { build } from "esbuild";
await build({
  entryPoints: ["src/start.ts", "src/server.ts"],
  outdir: "dist",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
});
