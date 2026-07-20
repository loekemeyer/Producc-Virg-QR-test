/* Test de regresión (v5.17, hallazgo ALTA de la auditoría SE): el generador de OCs
   (ocgEnter) tiene que cruzar máximos ↔ stock ↔ demanda ↔ proyección ↔ capacidad con
   LA MISMA normalización de código (_ocgNorm = upper + sin ceros a la izquierda).
   Fixture: el máximo dice "007"/"066" pero el stock está cargado como "7"/"66" y la
   capacidad como "66". Si alguna pata vuelve a cruzar sin normalizar, el stock da 0
   silencioso y el generador sobre-pide → este test falla. Sale 1 si falla. */
const path = require("path");
let chromium;
try { ({ chromium } = require("/opt/node22/lib/node_modules/playwright")); }
catch (_e) {
  try { ({ chromium } = require("playwright")); }
  catch (_e2) { console.error("Playwright no encontrado (ver tests/smoke.cjs)."); process.exit(2); }
}
(async () => {
  const root = path.join(__dirname, "..");
  const b = await chromium.launch();
  const p = await b.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(e.message));
  await p.goto("file://" + path.join(root, "index.html"), { waitUntil: "domcontentloaded" });
  const r = await p.evaluate(async () => {
    // Stubs: son bindings léxicos globales (function/let), se reasignan SIN window.
    ocgFetchMaximos = async () => [
      { cod: "007", descripcion: "test A", max_cajas: 100, proveedor: "PROV", indice: null },
      { cod: "066", descripcion: "test B", max_cajas: 50, proveedor: "PROV", indice: null }
    ];
    stockFetchMovs = async () => [
      { cod_art: "7", deposito: "terminado", delta: 60, tipo: "inicial", ts: "2026-06-30T00:00:00Z" },
      { cod_art: "66", deposito: "terminado", delta: 20, tipo: "inicial", ts: "2026-06-30T00:00:00Z" }
    ];
    stockGetCutoff = async () => null;
    ocgDemanda = async () => ({});
    ocgFetchProyeccion = async () => ({});
    ocgFetchCapacidad = async () => ({ "66": 30 });
    _oc = { view: "gen", gen: null, rows: [] };
    ocRender = function () {};   // sin DOM del modal
    await ocgEnter();
    const items = (_oc.gen && _oc.gen.items) || [];
    const A = items.find((i) => i.cod === "007"), B = items.find((i) => i.cod === "066");
    return {
      A_stock: A ? A.stock : null, A_falta: A ? A.falta : null,                       // esperado 60 / 40
      B_stock: B ? B.stock : null, B_capped: B ? B.capped : null, B_falta: B ? B.falta : null,  // esperado 20 / true / 10
      error: (_oc.gen && _oc.gen.error) || null
    };
  });
  const pass = r.A_stock === 60 && r.A_falta === 40 && r.B_stock === 20 && r.B_capped === true && r.B_falta === 10 && !r.error && errs.length === 0;
  console.log("ocg-norm:", JSON.stringify(r), "· pageerrors:", errs.length ? errs.join("|") : "none", "·", pass ? "✓ OK" : "✗ FAIL");
  await b.close();
  process.exit(pass ? 0 : 1);
})();
