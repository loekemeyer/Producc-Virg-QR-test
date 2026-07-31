/* APP_VERSION (index.html) y SW_VERSION (sw.js) deben tener la MISMA base.
   Evita la regresión PWA clásica: si al bumpear se olvidan de uno, el service
   worker sigue sirviendo la app vieja y "no se ve el cambio" en producción —
   un bug difícil de diagnosticar. Sale con código 1 si están desincronizados. */
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const sw = fs.readFileSync(path.join(root, "sw.js"), "utf8");

const mApp = html.match(/APP_VERSION\s*=\s*["']([^"']+)["']/);
const mSw = sw.match(/SW_VERSION\s*=\s*["']([^"']+)["']/);

if (!mApp) { console.log("version-sync: no encontré APP_VERSION en index.html"); process.exit(1); }
if (!mSw)  { console.log("version-sync: no encontré SW_VERSION en sw.js"); process.exit(1); }

const app = mApp[1].trim();
const swv = mSw[1].trim();
const swBase = swv.replace(/-.*$/, ""); // saca el sufijo "-vir" (u otro) del SW_VERSION

if (app !== swBase) {
  console.log("version-sync: DESYNC — APP_VERSION=" + app + " vs SW_VERSION=" + swv + " (base " + swBase + ")");
  console.log("  Al bumpear la versión hay que tocar LOS DOS (index.html y sw.js); si no, el SW cachea la app vieja.");
  process.exit(1);
}
console.log("version-sync: OK — APP_VERSION=" + app + " == SW_VERSION base (" + swv + ")");
process.exit(0);
