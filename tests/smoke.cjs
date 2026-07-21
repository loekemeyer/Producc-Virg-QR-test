/* Smoke-test: abre index.html headless, verifica que las funciones clave existen,
   que no hay errores de página, y un cálculo de stockComputeSaldos. Sale 1 si falla. */
const path = require("path");
let chromium;
try { ({ chromium } = require("/opt/node22/lib/node_modules/playwright")); }
catch (_e) {
  try { ({ chromium } = require("playwright")); }
  catch (_e2) { console.error("Playwright no encontrado. En este entorno: /opt/node22/lib/node_modules/playwright. En otra máquina: npm i -D playwright && npx playwright install chromium."); process.exit(2); }
}
(async () => {
  const root = path.join(__dirname, "..");
  const b = await chromium.launch();
  const p = await b.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(e.message));
  await p.goto("file://" + path.join(root, "index.html"), { waitUntil: "domcontentloaded" });
  const r = await p.evaluate(() => {
    const need = ["stockComputeSaldos", "stkBodyStocks", "stkBodyStocksTab", "stkBodyConteo", "stkBodyCapacidad", "openAgentesAdmin", "agtRender", "openProductividad", "prodRender",
      "prodCompute", "prodLoad", "prodExportCsv", "prodSetMeta", "_pvPremio", "_pvMetas",
      "stkBodyProceso", "ocBodyEntregas", "ocgEnter", "insRender", "mgRender", "pkRender", "stockBajaPicking",
      "stockSepararAFacturar", "stockSalidaFacturado",
      "showMGChooser", "showRacksBajarModal", "rkbRender", "rkbConfirmar", "rkbFetchCxM", "rkbSetSec",
      "showCPModal", "cpRender", "cpConfirm", "cpLoadPickSinArmar", "showInstructivo", "equivResolve", "pppZonaDeBarrio",
      "showRCModal", "rcConfirm", "rcLoadDonors", "showRemitoArmado", "armadoRemitoData", "armadoRemitoInnerHtml", "remitoPrintDoc",
      "openPrintStation", "psToggle", "psPoll", "psTestPrint", "psPrintBatch", "psSeedTodayIfNeeded", "psRender",
      "showEAModal", "eaFetchStock", "eaRender", "eaConfirmar", "eaEmitEvent",
      "goToOptions", "_enterOptions", "fichadaGate", "openFichadaScanner", "fichadaFicharAhora",
      "fichadaScanContinue", "fichadaScanClose", "fichadaScanBypass"];
    const missing = need.filter((n) => typeof window[n] !== "function");
    const ts = new Date().toISOString();
    const sal = stockComputeSaldos([
      { cod_art: "X", deposito: "terminado", delta: 100, tipo: "inicial", ts },
      { cod_art: "X", deposito: "terminado", delta: -20, tipo: "picking", ts },
      { cod_art: "X", deposito: "excedente", delta: 5, tipo: "guardado", ts }
    ], null);
    const saldoOk = !!(sal.X && sal.X.terminado === 80 && sal.X.excedente === 5);
    return { missing, saldoOk };
  });
  const pass = r.missing.length === 0 && r.saldoOk && errs.length === 0;
  console.log("smoke:", JSON.stringify(r), "· pageerrors:", errs.length ? errs.join("|") : "none", "·", pass ? "✓ OK" : "✗ FAIL");
  await b.close();
  process.exit(pass ? 0 : 1);
})();
