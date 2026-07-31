/* Regresión v6.12 — (A) Picking: ubicación por ORIGEN (Loeke NP>90000 vs Chef) para
   809E/437E/438E. (B) MG guarda el borrador en CADA cambio (se puede "Seguir Guardar a
   góndola" aunque no toquen "Cerrar"). Sale 1 si falla. */
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
    window.alert = function () {};
    window.pkFetchExcedente = async function () { return {}; };
    window.pkNotifySinPlanim = function () {};

    function mapOf(obj) { const m = new Map(); Object.keys(obj).forEach(function (k) { m.set(k, obj[k]); }); return m; }

    // walk picking: recorrer los pasos y juntar code -> {sector, orig}
    async function walk() {
      const acc = {};
      for (let guard = 0; guard < 30; guard++) {
        const cod = document.querySelector("#tandaModal .pk-cod-big");
        if (!cod) break;
        const sec = document.querySelector("#tandaModal .pk-sector-big");
        const orig = document.querySelector("#tandaModal .pk-orig");
        acc[cod.textContent.trim()] = { sector: sec ? sec.textContent.trim() : null, orig: orig ? orig.textContent.replace(/\s+/g, " ").trim() : null };
        const adelante = document.querySelector("#tandaModal .pk-navbtn:last-child");
        if (!adelante || adelante.disabled) break;
        pkNext();
        await new Promise(function (res) { setTimeout(res, 15); });
      }
      return acc;
    }

    // ===== (A) Tanda LOEKE (NP>90000) =====
    localStorage.clear();
    window.fetchMonitorSheet = async function () { return mapOf({ "L01": { pedidos: [{ np: "98500" }] } }); };
    window.fetchPickingBase = async function () { return mapOf({ "98500": [{ art: "809E", cajas: 3 }, { art: "437E", cajas: 2 }, { art: "438E", cajas: 4 }] }); };
    await showPickingList("L01", "55");
    await new Promise(function (res) { setTimeout(res, 60); });
    out.loeke = await walk();

    // ===== (B) Tanda CHEF (NP<=90000) =====
    localStorage.clear();
    window.fetchMonitorSheet = async function () { return mapOf({ "C01": { pedidos: [{ np: "44500" }] } }); };
    window.fetchPickingBase = async function () { return mapOf({ "44500": [{ art: "809E", cajas: 3 }, { art: "437E", cajas: 2 }, { art: "438E", cajas: 4 }] }); };
    await showPickingList("C01", "56");
    await new Promise(function (res) { setTimeout(res, 60); });
    out.chef = await walk();

    // ===== (C) MG auto-guarda el borrador sin "Cerrar" =====
    localStorage.clear();
    window.loadArtNombres = async function () { return {}; };
    window.stockFetchSaldos = async function () { return { "502": { cod: "502", desc: "X", a_guardar: 10, terminado: 0 } }; };
    showMGModal("77");
    await new Promise(function (res) { setTimeout(res, 60); });
    out.draftAntes = !!opDraftLoad("77");            // false: sin progreso todavía
    mgSet(0, 5);                                     // cargar 5 (dispara mgRender → auto-save)
    await new Promise(function (res) { setTimeout(res, 20); });
    const d = opDraftLoad("77");
    out.draftDespues = !!d;
    out.draftOp = d ? d.op : null;
    out.draftLabel = d ? d.label : null;
    out.draftCargar = (d && d.snap && d.snap.items && d.snap.items[0]) ? d.snap.items[0].cargar : null;
    return out;
  });

  const L = r.loeke || {}, C = r.chef || {};
  const okLoeke = L["809E"] && L["809E"].sector === "J13" && /LOEKE/.test(L["809E"].orig || "") &&
                  L["437E"] && L["437E"].sector === "F9" && /F9 a F12/.test(L["437E"].orig || "") &&
                  L["438E"] && L["438E"].sector === "F13";
  const okChef  = C["809E"] && C["809E"].sector === "M13" && /CHEF/.test(C["809E"].orig || "") &&
                  C["437E"] && C["437E"].sector === "L7" &&
                  C["438E"] && C["438E"].sector === "L5" && /L5 y L6/.test(C["438E"].orig || "");
  const okMg = r.draftAntes === false && r.draftDespues === true && r.draftOp === "MG" && r.draftCargar === 5;
  const pass = okLoeke && okChef && okMg && errs.length === 0;

  console.log("dual-ubic-mg-draft:", JSON.stringify(r));
  console.log("  pageerrors:", errs.length ? errs.join("|") : "none");
  console.log("  A loeke:", okLoeke ? "✓" : "✗", "· A chef:", okChef ? "✓" : "✗", "· B mg-draft:", okMg ? "✓" : "✗", "·", pass ? "OK" : "FAIL");
  await b.close();
  process.exit(pass ? 0 : 1);
})();
