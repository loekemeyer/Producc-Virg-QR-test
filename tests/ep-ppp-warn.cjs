/* Regresión v5.27 — EP sobre una tanda que NO está en el PPP de hoy avisa ANTES de
   arrancar el picking (y si el operario cancela, NO registra el EP). Casos:
   1) no en PPP + cancelar → confirm llamado, EP NO encolado.
   2) no en PPP + aceptar  → confirm llamado, EP encolado.
   3) en PPP               → confirm NO llamado, EP encolado.
   4) PPP vacío (sin red)  → falla ABIERTO: confirm NO llamado, EP encolado.
   Sale 1 si falla. */
const path = require("path");
let chromium;
try { ({ chromium } = require("/opt/node22/lib/node_modules/playwright")); }
catch (_e) {
  try { ({ chromium } = require("playwright")); }
  catch (_e2) { console.error("Playwright no encontrado."); process.exit(2); }
}
(async () => {
  const root = path.join(__dirname, "..");
  const b = await chromium.launch();
  const p = await b.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(e.message));
  await p.goto("file://" + path.join(root, "index.html"), { waitUntil: "domcontentloaded" });
  const r = await p.evaluate(async () => {
    const out = {};
    const leg = "999";
    legajoInput.value = leg;
    window.maybeRegisterLateArrival = async function () {};
    window.trySendOneReport = async function () { return { ok: true }; };
    window.showPickingList = async function () {};
    window.stockBajaPicking = async function () {};
    let enq = []; window.enqueueReport = function (pl) { enq.push(pl && pl.opcion); };
    let confirmCalls = 0; let confirmRet = true;
    window.confirm = function () { confirmCalls++; return confirmRet; };
    async function run(sheetTandas, tanda) {
      enq = []; confirmCalls = 0;
      window.fetchMonitorSheet = async function () {
        const m = new Map(); (sheetTandas || []).forEach(function (t) { m.set(t, { pedidos: [] }); }); return m;
      };
      const st = getLegajoState(leg); st.picking = { active: false, value: "", ts_inicio: null }; st.toggles = {}; setLegajoState(leg, st);
      selectOption("EP"); textInput.value = tanda;
      await send();
      return { enqHasEP: enq.indexOf("EP") >= 0, confirmCalls: confirmCalls };
    }
    confirmRet = false; out.notInPPP_cancel = await run(["C99Z"], "C72F");
    confirmRet = true;  out.notInPPP_accept = await run(["C99Z"], "C72F");
    confirmRet = false; out.inPPP = await run(["C72F", "C99Z"], "C72F");
    confirmRet = false; out.emptySheet = await run([], "C72F");
    return out;
  });
  const pass =
    r.notInPPP_cancel.confirmCalls === 1 && r.notInPPP_cancel.enqHasEP === false &&
    r.notInPPP_accept.confirmCalls === 1 && r.notInPPP_accept.enqHasEP === true &&
    r.inPPP.confirmCalls === 0 && r.inPPP.enqHasEP === true &&
    r.emptySheet.confirmCalls === 0 && r.emptySheet.enqHasEP === true &&
    errs.length === 0;
  console.log("ep-ppp-warn:", JSON.stringify(r), "· pageerrors:", errs.length ? errs.join("|") : "none", "·", pass ? "✓ OK" : "✗ FAIL");
  await b.close();
  process.exit(pass ? 0 : 1);
})();
