import { createRequire } from "node:module";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const require = createRequire(join(root, "apps/desktop/package.json"));
const { _electron } = require("@playwright/test");
const assets = join(root, "apps/desktop/src/renderer/public/branding");
const svg = await readFile(join(assets, "calos-icon.svg"), "utf8");
const temporary = await mkdtemp(join(tmpdir(), "calos-icons-"));
let electronApp;

try {
  const entry = join(temporary, "export.mjs");
  await writeFile(
    entry,
    `import { app, BrowserWindow } from "electron";
app.setPath("userData", ${JSON.stringify(temporary)});
app.setPath("sessionData", ${JSON.stringify(temporary)});
app.whenReady().then(async () => {
const window = new BrowserWindow({ show: true, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
await window.loadURL("about:blank");
});
`,
  );
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  electronApp = await _electron.launch({
    executablePath: require("electron"),
    args: ["--no-sandbox", "--ozone-platform=x11", entry],
    env,
    timeout: 30_000,
  });
  const page = await electronApp.firstWindow();
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
  try {
    await electronApp?.close();
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}
