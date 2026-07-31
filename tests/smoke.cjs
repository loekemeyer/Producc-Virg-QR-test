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
      "stkBodyRacks", "stkRacksCapCompute", "stkRacksCapSummary", "stkPlnSet", "stkPlaniLoad", "stkBodyStocksTab", "stkExportExcedentes",
      "stkAutoBajadaCompute", "stkAutoBajadaSection", "stkToggleAutoBajada", "stkAutoBajadaGenerar",
      "opDraftSave", "opDraftLoad", "opDraftClear", "opAskClose", "opDraftResume",
      "mgAskClose", "rkbAskClose", "insAskClose", "scAskClose", "eaAskClose", "cpAskClose", "rcAskClose",
      "showMoverModal", "mvRender", "mvPickOrigen", "mvConfirmar", "closeMv", "stkFiltroToggleE",
      "pppSugerirInline", "pppSugInlineClose", "_pppEsCiudadela",
      "stkBodyProceso", "ocBodyEntregas", "ocgEnter", "insRender", "mgRender", "mgConfirmar", "pkRender", "stockBajaPicking",
      "stockSepararAFacturar", "stockSalidaFacturado", "stockMove", "_stockNormRows",
      "esLegajoPrueba", "esOperadorPrueba", "enqueueReport", "facFetchCajas", "facFaltBadge", "facToggleSoloFalt",
      "faltPoll", "faltPollStart", "faltDecidePopup", "faltAsignarme", "faltCompletar", "faltYaListo", "faltSoltar",
      "faltSnoozeId", "faltMaybeCompletar", "faltHtmlPend", "faltHtmlMine", "faltHtmlTaken", "showFaltAvisar", "faltCrear",
      "facFetchTareas", "facTareaActiva", "facTareaBadge", "_compTandaYaArmada",
      "getActivityStatus", "tandaReservar", "tandaLiberar",
      "showMGChooser", "showRacksBajarModal", "rkbRender", "rkbConfirmar", "rkbFetchCxM", "rkbSetSec",
      "showExcModal", "excRender", "excConfirmar", "excSet", "excChg", "excAskClose", "closeExc",
      "showCPModal", "cpRender", "cpConfirm", "cpLoadPickSinArmar", "showInstructivo", "equivResolve", "pppZonaDeBarrio",
      "showRCModal", "rcConfirm", "rcLoadDonors", "showRemitoArmado", "armadoRemitoData", "armadoRemitoInnerHtml", "remitoPrintDoc",
      "openPrintStation", "psToggle", "psPoll", "psTestPrint", "psPrintBatch", "psSeedTodayIfNeeded", "psRender",
      "showEAModal", "eaFetchStock", "eaRender", "eaConfirmar", "eaEmitEvent",
      "eaFetchUbics", "eaRenderEdit", "eaEditUbic", "eaEditSet", "eaUbicCancel", "eaUbicSave", "eaUbicDelete",
      "showIngresoRacksModal", "irRender", "irCargar", "irEmitEvent", "irFetchCxM", "irSetCod", "irSetM", "irSetSec", "irSetEmp",
      "irRevisar", "irRenderConfirm", "irVolver",
      "stkOpenPedidos", "stkOpenGondola", "stkGondRender", "_stkPopAgg", "_stkFetchNpsByTanda", "stkCapSort",
      "askPickUbicacion", "emitPickUbic", "askArmadoUbicaciones", "emitArmadoUbic",
      "pkForzarGondola", "pkEmitRetiroGondola",
      "pkNpEsLoeke", "pkDualBreakdown", "opDraftSaveQuiet",
      "emitGuardadoSesion", "stkGRate", "stkGRacksOn", "stkGuardadoToggleRacks", "stkGConfVal",
      "facFacturarNP", "facFCOpen", "facFCEmitir", "facFCClose", "arcaCall", "facFmtMoney", "facFCEnsureModal",
      "facNCOpen", "facNCEmitir", "facNCEnsure", "facNCClose",
      "goToOptions", "_enterOptions", "fichadaGate", "openFichadaScanner", "fichadaFicharAhora", "fichadaScanContinue", "fichadaScanClose", "fichadaScanBypass", "fichadaNoPuedo"];
    const missing = need.filter((n) => typeof window[n] !== "function");
    const ts = new Date().toISOString();
    const sal = stockComputeSaldos([
      { cod_art: "X", deposito: "terminado", delta: 100, tipo: "inicial", ts },
      { cod_art: "X", deposito: "terminado", delta: -20, tipo: "picking", ts },
      { cod_art: "X", deposito: "excedente", delta: 5, tipo: "guardado", ts }
    ], null);
    const saldoOk = !!(sal.X && sal.X.terminado === 80 && sal.X.excedente === 5);
    // Guardado a excedente: filas con claves distintas (una con ubicacion, otra sin)
    // se deben normalizar al mismo set de claves, si no PostgREST tira 400 y se pierde.
    const nr = _stockNormRows([
      { cod_art: "X", deposito: "a_guardar", delta: -5, tipo: "guardado" },
      { cod_art: "X", deposito: "excedente", delta: 5, tipo: "guardado", ubicacion: "N11" }
    ]);
    const normOk = nr.length === 2 && ("ubicacion" in nr[0]) && ("ubicacion" in nr[1]) &&
      nr[0].ubicacion === null && nr[1].ubicacion === "N11" &&
      JSON.stringify(Object.keys(nr[0]).sort()) === JSON.stringify(Object.keys(nr[1]).sort());
    // Candado legajo de prueba: el operador logueado como 0/1 no persiste (v5.68).
    let pruebaOk = esLegajoPrueba("0") && esLegajoPrueba("1") && !esLegajoPrueba("104") && !esLegajoPrueba("");
    const li = document.getElementById("legajoInput");
    if (li) {
      const orig = li.value;
      li.value = "0";   pruebaOk = pruebaOk && esOperadorPrueba() === true;
      li.value = "104"; pruebaOk = pruebaOk && esOperadorPrueba() === false;
      li.value = orig;
    } else { pruebaOk = false; }
    // v6.64: botón "Anular factura (Nota de Crédito)" presente en el bloque de cierre.
    const ncBtn = Array.from(document.querySelectorAll("button")).find((b) =>
      (b.getAttribute("onclick") || "").indexOf("facNCOpen") >= 0 ||
      /Anular factura/i.test(b.textContent || ""));
    const ncBtnOk = !!ncBtn;
    return { missing, saldoOk, normOk, pruebaOk, ncBtnOk };
  });
  const pass = r.missing.length === 0 && r.saldoOk && r.normOk && r.pruebaOk && r.ncBtnOk && errs.length === 0;
  console.log("smoke:", JSON.stringify(r), "· pageerrors:", errs.length ? errs.join("|") : "none", "·", pass ? "✓ OK" : "✗ FAIL");
  await b.close();
  process.exit(pass ? 0 : 1);
})();
