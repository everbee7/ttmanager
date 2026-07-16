const fs = require("node:fs");
const path = require("node:path");

const dist = path.join(__dirname, "..", "apps", "desktop", "electron", "dist");

for (const name of ["main", "preload"]) {
  const js = path.join(dist, `${name}.js`);
  const cjs = path.join(dist, `${name}.cjs`);
  if (fs.existsSync(cjs)) fs.rmSync(cjs);
  fs.renameSync(js, cjs);
}
