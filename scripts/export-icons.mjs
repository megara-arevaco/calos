import { createRequire } from "node:module";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const require = createRequire(join(root, "apps/web/package.json"));
const { chromium } = require("@playwright/test");
const assets = join(root, "apps/web/public/branding");
const svg = await readFile(join(assets, "calos-icon.svg"), "utf8");
const browser = await chromium.launch();

try {
  const page = await browser.newPage();
  const pngs = [];
  for (const size of [1024, 512, 256, 64, 32, 16]) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(
      `<style>html,body{margin:0;background:transparent}svg{display:block;width:100vw;height:100vh}</style>${svg}`,
    );
    const png = await page.screenshot({ omitBackground: true });
    await writeFile(join(assets, `calos-icon-${size}.png`), png);
    if (size <= 256) pngs.push({ size, png });
  }
  // ICO entries contain the PNGs rendered from the same SVG master.
  const header = Buffer.alloc(6 + 16 * pngs.length);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  let offset = header.length;
  for (const [index, { size, png }] of pngs.entries()) {
    const entryOffset = 6 + index * 16;
    header[entryOffset] = size === 256 ? 0 : size;
    header[entryOffset + 1] = size === 256 ? 0 : size;
    header.writeUInt16LE(1, entryOffset + 4);
    header.writeUInt16LE(32, entryOffset + 6);
    header.writeUInt32LE(png.length, entryOffset + 8);
    header.writeUInt32LE(offset, entryOffset + 12);
    offset += png.length;
  }
  await writeFile(
    join(assets, "calos-icon.ico"),
    Buffer.concat([header, ...pngs.map(({ png }) => png)]),
  );
  console.log("Iconos de Calos exportados desde calos-icon.svg.");
} finally {
  await browser.close();
}
