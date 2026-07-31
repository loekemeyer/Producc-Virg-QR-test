/* Regresión — FALT (v6.15+): el pop-up de faltantes EN VIVO está DESACTIVADO
   (FALT_POPUP_ENABLED=false, pedido del dueño). La carga de faltantes se hace
   desde el módulo CP. Este test garantiza el contrato ACTUAL:
   A) con tareas pendientes/asignadas, faltPoll() NO muestra el pop-up.
   E) legajo de prueba (0) tampoco.
   D) Facturación: facTareaActiva/facTareaBadge (aviso "⏳ Completando") sigue
      andando con el gate v6.18/v6.19 — se muestra solo si la NP tiene faltante
      con cajas>0 Y el código está a_guardar>0 (o guardado hoy); si el faltante
      ya se completó (cajas 0) el badge desaparece aunque la tarea siga abierta.
   La coordinación en vivo (asignación atómica: faltAsignarme/faltHtmlMine/…)
   queda DORMIDA con el pop-up; si se reactiva, restaurar la cobertura A/B/C/F
   desde el historial de git (commits ≤ v6.14).
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

  // Setup: stub fetch + operador "activo" en la botonera (legajo 55).
  await p.evaluate(() => {
    window.__TASKS = [];
    window.alert = function () {};
    function J(data) { return Promise.resolve({ ok: true, status: 200, headers: { get: function () { return null; } }, json: function () { return Promise.resolve(data); } }); }
    window.fetch = function (url) {
      url = String(url);
      if (url.indexOf("Faltantes_Tareas") >= 0) return J(window.__TASKS);
      if (url.indexOf("Empleados") >= 0) return J([{ Legajo: "55", Empleado: "Pedro" }]);
      return J([]);
    };
    document.getElementById("legajoInput").value = "55";
    const ls = document.getElementById("legajoScreen"); if (ls) ls.classList.add("hidden");
    const os = document.getElementById("optionsScreen"); if (os) os.classList.remove("hidden");
  });

  const popupShown = () => p.evaluate(() => { const o = document.getElementById("faltPopup"); return !!(o && o.classList.contains("show")); });

  // A) Pop-up DESACTIVADO: con pendiente y con asignada-a-mí, faltPoll() no lo muestra.
  const A = await p.evaluate(async () => {
    const flagOff = (typeof FALT_POPUP_ENABLED !== "undefined" && FALT_POPUP_ENABLED === false);
    window.__TASKS = [{ id: 1, np: "98114", estado: "pendiente", articulos: [{ cod: "315", falto: 10 }] }];
    await faltPoll();
    const o1 = document.getElementById("faltPopup");
    const pendHidden = !(o1 && o1.classList.contains("show"));
    window.__TASKS = [{ id: 1, np: "98114", estado: "asignado", asignado_legajo: "55", asignado_nombre: "Pedro", articulos: [{ cod: "315", falto: 10 }] }];
    await faltPoll();
    const o2 = document.getElementById("faltPopup");
    const asigHidden = !(o2 && o2.classList.contains("show"));
    return { flagOff, pendHidden, asigHidden };
  });

  // E) legajo de PRUEBA (0) tampoco ve el pop-up
  const E = await p.evaluate(async () => {
    document.getElementById("legajoInput").value = "0";
    window.__TASKS = [{ id: 9, np: "777", estado: "pendiente", articulos: [] }];
    faltHidePopup();
    await faltPoll();
    const o = document.getElementById("faltPopup");
    return { hiddenForPrueba: !(o && o.classList.contains("show")) };
  });

  // D) Facturación: badge "⏳ Completando" con el gate v6.18/v6.19.
  const D = await p.evaluate(async () => {
    document.getElementById("legajoInput").value = "55";
    window.__TASKS = [{ np: "98114", estado: "asignado", asignado_legajo: "55", asignado_nombre: "Pedro" }];
    await facFetchTareas();
    // Preconds del gate: faltante con cajas>0 + código a_guardar>0.
    _facFalt = new Map([["98114", { cajas: 10, items: [{ cod: "315", falto: 10, ped: 80 }] }]]);
    _facSaldosN = { "315": { a_guardar: 10, terminado: 0 } };
    _facGuardadoHoy = new Set();
    const t = facTareaActiva("98114");
    const badge = facTareaBadge("98114");
    const noneForOther = facTareaActiva("00000") === null;
    const badgeOtroVacio = facTareaBadge("00000") === "";               // sin tarea → sin badge
    // v6.19: faltante YA completado (cajas 0), la tarea sigue abierta → badge vacío
    _facFalt = new Map([["98114", { cajas: 0, items: [] }]]);
    const badgeCompletoVacio = facTareaBadge("98114") === "";
    // v6.18: tarea + faltante con cajas pero SIN stock (a_guardar 0, no guardado hoy) → badge vacío
    _facFalt = new Map([["98114", { cajas: 10, items: [{ cod: "315", falto: 10, ped: 80 }] }]]);
    _facSaldosN = { "315": { a_guardar: 0, terminado: 0 } };
    const badgeSinStockVacio = facTareaBadge("98114") === "";
    return { active: !!t, hasCompletando: /Completando/.test(badge), hasPedro: /Pedro/.test(badge), noneForOther, badgeOtroVacio, badgeCompletoVacio, badgeSinStockVacio };
  });

  const okA = A.flagOff && A.pendHidden && A.asigHidden;
  const okE = E.hiddenForPrueba;
  const okD = D.active && D.hasCompletando && D.hasPedro && D.noneForOther && D.badgeOtroVacio && D.badgeCompletoVacio && D.badgeSinStockVacio;
  const pass = okA && okE && okD && errs.length === 0;
  console.log("falt-tareas:", JSON.stringify({ A, E, D }));
  console.log("  pageerrors:", errs.length ? errs.join("|") : "none");
  console.log(" ", okA ? "A popup-off ✓" : "A popup-off ✗", "·", okE ? "E prueba ✓" : "E prueba ✗", "·", okD ? "D fac-badge ✓" : "D fac-badge ✗", "·", pass ? "OK" : "FAIL");
  await b.close();
  process.exit(pass ? 0 : 1);
})();
