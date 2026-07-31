/* Regresión (idea 6612): "botones muertos". checkhtml valida la sintaxis de los
   <script> inline pero NO ve dentro de los strings de atributo (onclick/oninput/…),
   ni dentro de los template-literals que arman HTML en runtime. Este test escanea el
   SOURCE de index.html, extrae el nombre de función invocada en cada handler
   on* = "fn(...)" (incluidos los generados por template strings) y verifica que cada
   uno sea typeof window[fn] === "function" en la página cargada. Un handler que llama
   a una función inexistente = botón muerto (no hace nada al tocarlo). */
const fs = require("fs");
const path = require("path");
let chromium;
try { ({ chromium } = require("/opt/node22/lib/node_modules/playwright")); }
catch (_e) { try { ({ chromium } = require("playwright")); } catch (_e2) { console.error("Playwright no encontrado."); process.exit(2); } }

// Palabras que NO son handlers de la app (keywords JS + globals nativos): no se checkean.
const SKIP = new Set([
  "if", "for", "while", "return", "typeof", "var", "const", "let", "function", "new",
  "else", "switch", "case", "catch", "in", "of", "do", "void", "delete", "await",
  "async", "this", "event", "true", "false", "null", "undefined",
  "parseInt", "parseFloat", "String", "Number", "Boolean", "Array", "Object", "JSON",
  "Math", "Date", "alert", "confirm", "prompt", "isNaN", "isFinite", "RegExp",
  "encodeURIComponent", "decodeURIComponent", "setTimeout", "setInterval", "clearTimeout",
  "Promise", "Map", "Set", "escape", "unescape"
]);

function extractHandlerFns(src) {
  const attrRe = /on(?:click|input|change|submit|blur|focus|keyup|keydown|mousedown|mouseup|dblclick|toggle)\s*=\s*(["'`])([\s\S]*?)\1/g;
  const names = new Set();
  let m;
  while ((m = attrRe.exec(src))) {
    const body = m[2];
    // identificador seguido de '(' que NO viene precedido por '.' (evita métodos: e.preventDefault, this.value)
    const callRe = /(^|[^.\w$])([a-zA-Z_$][\w$]*)\s*\(/g;
    let c;
    while ((c = callRe.exec(body))) {
      const n = c[2];
      if (!SKIP.has(n)) names.add(n);
    }
  }
  return [...names].sort();
}

(async () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  const fns = extractHandlerFns(src);
  const b = await chromium.launch();
  const p = await b.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(e.message));
  await p.goto("file://" + path.join(__dirname, "..", "index.html"), { waitUntil: "domcontentloaded" });
  const missing = await p.evaluate((list) => list.filter((n) => typeof window[n] !== "function"), fns);
  const ok = missing.length === 0;
  console.log("dead-handlers: handlers=" + fns.length + " · muertos=" + missing.length + (missing.length ? " [" + missing.join(", ") + "]" : "") + " · pageerrors:", errs.length ? errs.join("|") : "none", "·", (ok && !errs.length) ? "✓ OK" : "✗ FAIL");
  await b.close();
  process.exit((ok && !errs.length) ? 0 : 1);
})();
