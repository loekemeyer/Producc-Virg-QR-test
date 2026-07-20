/* Regresión v5.35 — switch admin del aviso "picking sin stock en góndola" (SSG):
   loadSsgSwitch refleja el flag de Stock_Config; toggleSsgAlert POSTea el flag flipeado
   (clave 'alerta_sin_stock_gondola') y actualiza el switch. Sale 1 si falla. */
const path = require("path");
let chromium;
try { ({ chromium } = require("/opt/node22/lib/node_modules/playwright")); }
catch (_e) { try { ({ chromium } = require("playwright")); } catch (_e2) { console.error("no playwright"); process.exit(2); } }
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  await p.goto("file://" + path.join(__dirname, "..", "index.html"), { waitUntil: "domcontentloaded" });
  const r = await p.evaluate(async () => {
    const out = {}, posts = [];
    window.fetch = function (url, opts) {
      if (opts && opts.method === "POST") { try { posts.push(JSON.parse(opts.body)); } catch (_e) {} return Promise.resolve({ ok: true, status: 200 }); }
      return Promise.resolve({ ok: true, json: function () { return Promise.resolve([{ valor: "1" }]); } });
    };
    await loadSsgSwitch();
    out.afterLoadOn = document.getElementById("ssgSw").classList.contains("on");
    await toggleSsgAlert();
    const last = posts[posts.length - 1] || {};
    out.postedClave = last.clave; out.postedValor = last.valor;
    out.afterToggleOn = document.getElementById("ssgSw").classList.contains("on");
    window.fetch = function () { return Promise.resolve({ ok: true, json: function () { return Promise.resolve([{ valor: "0" }]); } }); };
    await loadSsgSwitch();
    out.afterLoad0On = document.getElementById("ssgSw").classList.contains("on");
    return out;
  });
  const pass = r.afterLoadOn === true && r.postedClave === "alerta_sin_stock_gondola" &&
    r.postedValor === "0" && r.afterToggleOn === false && r.afterLoad0On === false && errs.length === 0;
  console.log("ssg-switch:", JSON.stringify(r), "· pageerrors:", errs.length ? errs.join("|") : "none", "·", pass ? "✓ OK" : "✗ FAIL");
  await b.close(); process.exit(pass ? 0 : 1);
})();
