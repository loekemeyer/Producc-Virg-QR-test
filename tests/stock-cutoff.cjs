/* Regresión (idea 8624): stockComputeSaldos con CUTOFF y ASOF — la función central de
   TODOS los reportes de stock. El smoke sólo la prueba con cutoff=null. Acá cubrimos:
   - tipo 'inicial' SIEMPRE cuenta como base (aunque sea previo al cutoff o posterior al asOf).
   - los movimientos REALES previos al cutoff se ignoran.
   - los movimientos REALES posteriores al asOf se ignoran.
   - depósitos terminado / separar_pedidos / a_facturar / a_guardar.
   Un signo mal acá rompe todo saldo sin dar error de página. */
const path = require("path");
let chromium;
try { ({ chromium } = require("/opt/node22/lib/node_modules/playwright")); }
catch (_e) { try { ({ chromium } = require("playwright")); } catch (_e2) { console.error("Playwright no encontrado."); process.exit(2); } }
(async () => {
  const root = path.join(__dirname, "..");
  const b = await chromium.launch();
  const p = await b.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(e.message));
  await p.goto("file://" + path.join(root, "index.html"), { waitUntil: "domcontentloaded" });
  const r = await p.evaluate(() => {
    const tBefore = "2026-01-01T10:00:00Z";   // antes del cutoff
    const cutoff  = "2026-01-02T00:00:00Z";
    const tAfter  = "2026-01-03T10:00:00Z";   // entre cutoff y asOf
    const asOf    = "2026-01-04T00:00:00Z";
    const tPost   = "2026-01-05T10:00:00Z";   // después del asOf

    // CUTOFF: inicial previo cuenta; picking previo se ignora; picking posterior cuenta.
    const sc = stockComputeSaldos([
      { cod_art: "Y", deposito: "terminado",       delta: 50,  tipo: "inicial",  ts: tBefore },
      { cod_art: "Y", deposito: "terminado",       delta: -10, tipo: "picking",  ts: tBefore },
      { cod_art: "Y", deposito: "terminado",       delta: -5,  tipo: "picking",  ts: tAfter },
      { cod_art: "Y", deposito: "separar_pedidos", delta: 8,   tipo: "separado", ts: tAfter }
    ], cutoff);
    const cutoffOk = !!(sc.Y && sc.Y.terminado === 45 && sc.Y.separar_pedidos === 8);

    // ASOF: inicial posterior cuenta; facturado previo cuenta; facturado posterior se ignora.
    const sa = stockComputeSaldos([
      { cod_art: "Z", deposito: "a_facturar", delta: 30,  tipo: "inicial",   ts: tPost },
      { cod_art: "Z", deposito: "a_facturar", delta: -10, tipo: "facturado", ts: tAfter },
      { cod_art: "Z", deposito: "a_facturar", delta: -5,  tipo: "facturado", ts: tPost },
      { cod_art: "Z", deposito: "a_guardar",  delta: 12,  tipo: "recepcion", ts: tAfter }
    ], null, asOf);
    const asOfOk = !!(sa.Z && sa.Z.a_facturar === 20 && sa.Z.a_guardar === 12);

    // control: sin cutoff/asOf, todo suma.
    const sb = stockComputeSaldos([
      { cod_art: "Y", deposito: "terminado", delta: 50,  tipo: "inicial", ts: tBefore },
      { cod_art: "Y", deposito: "terminado", delta: -10, tipo: "picking", ts: tBefore },
      { cod_art: "Y", deposito: "terminado", delta: -5,  tipo: "picking", ts: tAfter }
    ], null);
    const baseOk = !!(sb.Y && sb.Y.terminado === 35);

    return { cutoffOk, asOfOk, baseOk };
  });
  const pass = r.cutoffOk && r.asOfOk && r.baseOk && errs.length === 0;
  console.log("stock-cutoff:", JSON.stringify(r), "· pageerrors:", errs.length ? errs.join("|") : "none", "·", pass ? "✓ OK" : "✗ FAIL");
  await b.close();
  process.exit(pass ? 0 : 1);
})();
