/* Regresión v5.97 — picking OFFLINE-FIRST (mal WiFi al fondo del depósito).
   Si la tanda ya se precargó hoy (guardado local), reabrir el picking debe
   restaurar del guardado SIN tocar la red. Una tanda sin guardado sí baja de red.
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
    const leg = "55", tanda = "C90A";
    legajoInput.value = leg;
    window.alert = function () {};
    // Si showPickingList toca la RED, estos suben. En offline-first deben quedar en 0.
    let monitorCalls = 0, baseCalls = 0;
    window.fetchMonitorSheet = async function () { monitorCalls++; throw new Error("sin red"); };
    window.fetchPickingBase   = async function () { baseCalls++;  throw new Error("sin red"); };
    window.pkFetchExcedente   = async function () { return {}; };

    // Picking YA precargado hoy (como si se hubiera bajado entero con señal).
    const snap = { day: getTodayKey(), tanda: tanda, legajo: leg,
      items: [ { art: "502", key: "502", esp: 6, sector: "A01" }, { art: "321", key: "321", esp: 1, sector: "A02" }, { art: "501", key: "501", esp: 2, sector: "A03" } ],
      idx: 1, results: { "502": 6 }, mode: "item" };
    localStorage.setItem("vir_pk_" + leg, JSON.stringify(snap));

    // A) reabrir la MISMA tanda → restaura del guardado SIN red
    await showPickingList(tanda, leg);
    await new Promise(function (res) { setTimeout(res, 40); });
    out.count = (typeof pkCount === "function") ? pkCount() : -1;   // 1 (502 marcado)
    out.modalShown = document.getElementById("tandaModal").classList.contains("show");
    out.sinRed = (monitorCalls === 0 && baseCalls === 0);
    out.muestraCodigo = !!document.querySelector("#tandaModal .pk-cod-big");

    // B) tanda DISTINTA sin guardado → SÍ intenta la red
    monitorCalls = 0;
    await showPickingList("Z99Z", leg);
    await new Promise(function (res) { setTimeout(res, 40); });
    out.otraTandaTocaRed = monitorCalls >= 1;

    return out;
  });

  const pass = r.count === 1 && r.modalShown === true && r.sinRed === true &&
    r.muestraCodigo === true && r.otraTandaTocaRed === true && errs.length === 0;
  console.log("pk-offline:", JSON.stringify(r));
  console.log("  pageerrors:", errs.length ? errs.join("|") : "none");
  console.log(" ", r.sinRed ? "A sin-red ✓" : "A sin-red ✗", "·", r.count === 1 ? "A restauró ✓" : "A restauró ✗", "·", r.muestraCodigo ? "A render ✓" : "A render ✗", "·", r.otraTandaTocaRed ? "B otra→red ✓" : "B otra→red ✗", "·", pass ? "OK" : "FAIL");
  await b.close();
  process.exit(pass ? 0 : 1);
})();
