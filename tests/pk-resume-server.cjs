/* Regresión v5.91 — continuar un PICKING que cruzó de día (bug urgente 24/07).
   Un picking abierto ayer, sin snapshot local hoy (se borró por cambio de día),
   debe poder CONTINUARSE reconstruyendo el avance desde el servidor (eventos PKC):
   A) pkResumeServer siembra lo ya pickeado (502, 321) y ubica en el 1er sin marcar.
      Ignora PKC de OTRA tanda.
   B) pkLoadSaved: guardado de otro día + picking ABIERTO de esa tanda → SE CONSERVA.
   C) pkLoadSaved: guardado de otro día + picking CERRADO → se limpia (basura vieja).
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
    const leg = "122", tanda = "C90A";
    legajoInput.value = leg;
    window.alert = function () {}; window.confirm = function () { return true; };
    window.trySendOneReport = async function () { return { ok: true }; };
    window.enqueueReport = function () {};
    window.removeFromQueue = function () {};
    window.updatePendingIndicator = function () {};
    window.pkNotifySinPlanim = function () {};

    // Lista de la tanda: 4 códigos. El servidor dice que YA marcó 502 y 321 (no 501/246).
    window.fetchMonitorSheet = async function () { const m = new Map(); m.set(tanda, { pedidos: [{ np: "97978" }] }); return m; };
    window.fetchPickingBase = async function () { const m = new Map(); m.set("97978", [{ art: "502", cajas: 6 }, { art: "321", cajas: 1 }, { art: "501", cajas: 2 }, { art: "246", cajas: 1 }]); return m; };
    window.pkFetchExcedente = async function () { return {}; };
    // supaFetchAll acá SOLO lo usa pkFetchServerMarks → devolvemos los PKC de ayer.
    window.supaFetchAll = async function (endpoint, query) {
      if (String(query).indexOf("opcion=eq.PKC") >= 0) {
        return [
          { texto: "C90A|502|6|6", ts_cliente: "2026-07-23T19:05:00Z" },
          { texto: "C90A|321|1|1", ts_cliente: "2026-07-23T19:07:00Z" },
          { texto: "OTRA|999|1|1", ts_cliente: "2026-07-23T19:08:00Z" }   // otra tanda → se ignora
        ];
      }
      return [];
    };

    // Estado: picking ABIERTO para C90A, SIN snapshot local (simula cruce de día).
    const st = getLegajoState(leg); st.picking = { active: true, value: tanda, ts_inicio: "2026-07-23T19:04:00Z" }; st.toggles = {}; setLegajoState(leg, st);
    try { localStorage.removeItem("vir_pk_" + leg); } catch (_e) {}

    // --- A) retomar desde el servidor ---
    await pkResumeServer(tanda, leg);
    await new Promise(function (res) { setTimeout(res, 60); });
    out.count = (typeof pkCount === "function") ? pkCount() : -1;   // 2 (502 y 321), NO la de OTRA
    out.modalShown = document.getElementById("tandaModal").classList.contains("show");
    const codeEl = document.querySelector("#tandaModal .pk-cod-big");
    out.currentCode = codeEl ? codeEl.textContent.trim() : "";      // 1er sin marcar → 246 o 501
    out.posAtUnmarked = out.currentCode === "246" || out.currentCode === "501";

    // --- B) pkLoadSaved: otro día + picking abierto de esa tanda → conserva ---
    const snap = { day: "2000-01-01", tanda: tanda, legajo: leg, items: [{ art: "502", key: "502", esp: 6 }], idx: 1, results: { "502": 6 }, mode: "item" };
    localStorage.setItem("vir_pk_" + leg, JSON.stringify(snap));
    const st2 = getLegajoState(leg); st2.picking = { active: true, value: tanda, ts_inicio: "x" }; setLegajoState(leg, st2);
    out.keepsCrossDayWhenOpen = !!pkLoadSaved(leg);

    // --- C) pkLoadSaved: otro día + picking cerrado → limpia ---
    localStorage.setItem("vir_pk_" + leg, JSON.stringify(snap));
    const st3 = getLegajoState(leg); st3.picking = { active: false, value: "", ts_inicio: null }; setLegajoState(leg, st3);
    out.clearsCrossDayWhenClosed = (pkLoadSaved(leg) === null) && (localStorage.getItem("vir_pk_" + leg) === null);

    return out;
  });

  const pass = r.count === 2 && r.modalShown === true && r.posAtUnmarked === true &&
    r.keepsCrossDayWhenOpen === true && r.clearsCrossDayWhenClosed === true &&
    errs.length === 0;
  console.log("pk-resume-server:", JSON.stringify(r));
  console.log("  pageerrors:", errs.length ? errs.join("|") : "none");
  console.log(" ", r.count === 2 ? "A count ✓" : "A count ✗", "·", r.posAtUnmarked ? "A pos ✓" : "A pos ✗", "·", r.keepsCrossDayWhenOpen ? "B keep ✓" : "B keep ✗", "·", r.clearsCrossDayWhenClosed ? "C clear ✓" : "C clear ✗", "·", pass ? "OK" : "FAIL");
  await b.close();
  process.exit(pass ? 0 : 1);
})();
