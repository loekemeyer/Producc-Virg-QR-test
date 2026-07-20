/* Regresión v5.25/v5.26 — Armado: retomar después de una pausa.
   1) Botón "▶ Seguir armado" retoma el asistente donde quedó, SIN re-mandar AP, y se
      ve INCLUSO con un toggle activo (durante la comida).
   2) Guard v5.26: apretar AP sobre la MISMA tanda ya abierta NO genera un 2º evento AP
      (reabre el asistente); sobre OTRA tanda sí arranca armado nuevo.
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
    window.alert = function () {};

    // ---- Check 1: botón "Seguir armado" visible durante una pausa (PC comida) ----
    {
      const st = getLegajoState(leg);
      st.armado = { active: true, value: "C99Z", ts_inicio: null };
      st.toggles = Object.assign({}, st.toggles || {}, { PC: new Date().toISOString() });
      setLegajoState(leg, st);
      localStorage.setItem("vir_comp_C99Z", JSON.stringify({ _ts: Date.now(), step: 2, tanda: "C99Z", nps: [{ np: "1" }] }));
      let called = null; window.showCompletarWizard = function (l, c) { called = [l, c]; };
      renderPendingSuggestion();
      const box = document.getElementById("pendingSuggestion");
      const seguir = [].slice.call(box.querySelectorAll("button")).find(function (x) { return x.innerText.indexOf("Seguir armado") >= 0; });
      out.btnShownDuringToggle = !!seguir;
      out.btnText = seguir ? seguir.innerText : null;
      if (seguir) seguir.click();
      out.btnClick = called;
      const st2 = getLegajoState(leg); st2.armado = { active: false, value: "", ts_inicio: null }; st2.toggles = {}; setLegajoState(leg, st2);
      renderPendingSuggestion();
      const box2 = document.getElementById("pendingSuggestion");
      out.btnHiddenWhenInactive = ![].slice.call(box2.querySelectorAll("button")).some(function (x) { return x.innerText.indexOf("Seguir armado") >= 0; });
    }

    // ---- Check 2: AP repetido sobre la misma tanda NO duplica; otra tanda sí ----
    {
      window.maybeRegisterLateArrival = async function () {};
      window.trySendOneReport = async function () { return { ok: true }; };
      let comp = null; window.showCompletarWizard = function (l, c) { comp = [l, c]; };
      const enq = []; window.enqueueReport = function (pl) { enq.push(pl && pl.opcion); };
      const st = getLegajoState(leg);
      st.armado = { active: true, value: "C99Z", ts_inicio: new Date().toISOString() };
      st.toggles = {}; setLegajoState(leg, st);
      // AP de la MISMA tanda (C99Z) → guard: no encola, reabre el asistente.
      selectOption("AP"); textInput.value = "C99Z";
      await send();
      out.sameTandaEnq = enq.slice();
      out.sameTandaReopened = comp;
      // AP de OTRA tanda (D11X) → armado nuevo → encola "AP".
      enq.length = 0;
      selectOption("AP"); textInput.value = "D11X";
      await send();
      out.otherTandaEnq = enq.slice();
    }
    return out;
  });
  const pass =
    r.btnShownDuringToggle && r.btnClick && r.btnClick[1] === "C99Z" &&
    /Paso 2/.test(r.btnText || "") && r.btnHiddenWhenInactive &&
    r.sameTandaEnq.indexOf("AP") < 0 && r.sameTandaReopened && r.sameTandaReopened[1] === "C99Z" &&
    r.otherTandaEnq.indexOf("AP") >= 0 &&
    errs.length === 0;
  console.log("ap-resume:", JSON.stringify(r), "· pageerrors:", errs.length ? errs.join("|") : "none", "·", pass ? "✓ OK" : "✗ FAIL");
  await b.close();
  process.exit(pass ? 0 : 1);
})();
