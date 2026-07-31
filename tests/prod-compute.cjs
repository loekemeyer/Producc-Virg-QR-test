/* Regresión (idea 6612): prodCompute — el motor del dashboard de Rendimiento de
   operarios. Si se corrompe, TODOS los reportes de productividad/premio salen mal
   SIN error visible. Alimenta con eventos sintéticos de un día y afirma:
   - armM3/pickM3 = m³ de la tanda acreditado 1 vez (por TAP/TP con ini<cli),
   - armTime/pickTime = tiempo productivo neto,
   - exclusión de legajos de prueba 0 y 1 (y legajo vacío),
   - factor de faltantes (PKC) aplicado al m³. */
const path = require("path");
let chromium;
try { ({ chromium } = require("/opt/node22/lib/node_modules/playwright")); }
catch (_e) { try { ({ chromium } = require("playwright")); } catch (_e2) { console.error("Playwright no encontrado."); process.exit(2); } }
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(e.message));
  await p.goto("file://" + path.join(__dirname, "..", "index.html"), { waitUntil: "domcontentloaded" });
  const r = await p.evaluate(() => {
    const h = 3600000;
    const di = _pvDi(Date.UTC(2026, 5, 15, 12, 0, 0));
    const D1 = _pvDayStart(di), D2 = D1 + 86400000, T0 = D1 + 8 * h;
    const evs = [
      { legajo: "50", opcion: "EP",  texto: "A1",            ini: null,     cli: T0 },
      { legajo: "50", opcion: "TP",  texto: "A1",            ini: T0,       cli: T0 + 1 * h },
      { legajo: "50", opcion: "AP",  texto: "A2",            ini: null,     cli: T0 + 1 * h },
      { legajo: "50", opcion: "TAP", texto: "A2",            ini: T0 + 1 * h, cli: T0 + 3 * h },
      { legajo: "50", opcion: "PKC", texto: "A1|C1|100|75",  ini: null,     cli: T0 },
      { legajo: "0",  opcion: "TP",  texto: "Z9",            ini: T0,       cli: T0 + 1 * h },
      { legajo: "1",  opcion: "TAP", texto: "Z8",            ini: T0,       cli: T0 + 1 * h },
      { legajo: "",   opcion: "TP",  texto: "Z7",            ini: T0,       cli: T0 + 1 * h }
    ];
    const m3map = { A1: 10, A2: 30 };
    const out = prodCompute(evs, m3map, D1, D2, {});
    const fm = _pvFaltanteFactores(evs, null);
    const out2 = prodCompute(evs, m3map, D1, D2, fm);
    const o = out["50"] || {}, o2 = out2["50"] || {};
    return {
      excl0: !out["0"], excl1: !out["1"], exclEmpty: !out[""],
      pickM3: o.pickM3, armM3: o.armM3, pickTime: o.pickTime, armTime: o.armTime,
      pickTandas: o.pickTandas, armTandas: o.armTandas,
      factorA1: fm.A1, pickM3f: o2.pickM3, armM3f: o2.armM3
    };
  });
  const near = (a, x) => Math.abs(a - x) < 1e-6;
  const ok = r.excl0 && r.excl1 && r.exclEmpty &&
    r.pickM3 === 10 && r.armM3 === 30 &&
    r.pickTime === 3600000 && r.armTime === 7200000 &&
    r.pickTandas === 1 && r.armTandas === 1 &&
    near(r.factorA1, 0.75) && near(r.pickM3f, 7.5) && r.armM3f === 30;
  console.log("prod-compute:", JSON.stringify(r), "· pageerrors:", errs.length ? errs.join("|") : "none", "·", (ok && !errs.length) ? "✓ OK" : "✗ FAIL");
  await b.close();
  process.exit((ok && !errs.length) ? 0 : 1);
})();
