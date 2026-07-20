/* Regresión del GATE DE FICHADA QR (v5.53).
   Verifica la LÓGICA de decisión de fichadaGate() sin cámara real:
   - ya fichó hoy (RPC ficho=true)      → entra (optionsScreen visible), NO abre lector
   - no fichó (RPC ficho=false)         → abre el lector (#fichadaScan.show), NO entra
   - RPC falla (fail-open)              → entra igual
   - sin correo resoluble (fail-open)   → entra igual
   Stubbea window.fetch y window.virGetIdentity. Sale 1 si falla. */
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
    const $ = (id) => document.getElementById(id);
    const opts = $("optionsScreen"), leg = $("legajoScreen"), scan = $("fichadaScan"), legInp = $("legajoInput");

    function reset() {
      opts.classList.add("hidden");
      leg.classList.remove("hidden");
      scan.classList.remove("show");
      try { localStorage.removeItem("vir_ficho_qr"); } catch (_e) {}
    }
    const realFetch = window.fetch;
    window.fetch = function (url, o) {
      const u = String(url);
      if (u.indexOf("fichadaqr_ficho_hoy") !== -1) {
        if (window.__rpcFail) return Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) });
        return Promise.resolve({ ok: true, json: () => Promise.resolve(window.__fichoResp) });
      }
      if (u.indexOf("/Empleados") !== -1) {
        // Sin correo cargado para ese legajo → email null (fuerza fail-open).
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      }
      return realFetch(url, o);
    };

    async function runCase(cfg) {
      reset();
      // La RPC ahora devuelve también `correo` (el habilitado, resuelto por legajo/email).
      const correo = cfg.correo || cfg.email || (cfg.ficho ? "op@x.com" : null);
      window.__fichoResp = { ficho: !!cfg.ficho, hora: cfg.ficho ? "08:15" : null, correo: correo };
      window.__rpcFail = !!cfg.rpcFail;
      window.virGetIdentity = () => cfg.email ? { type: "operario", email: cfg.email } : null;
      legInp.value = cfg.legajo || "237";   // el operario siempre entra con un legajo
      let err = null;
      try { window.goToOptions(); } catch (e) { err = String(e && e.message || e); }
      await new Promise((res) => setTimeout(res, 300));
      return {
        optionsVisible: !opts.classList.contains("hidden"),
        scannerShown: scan.classList.contains("show"),
        err,
      };
    }

    const out = {};
    out.yaFicho   = await runCase({ email: "op@x.com", ficho: true });
    out.noFicho   = await runCase({ email: "op@x.com", ficho: false });
    out.rpcFail   = await runCase({ email: "op@x.com", rpcFail: true });
    out.sinCorreo = await runCase({ email: null, legajo: "" });
    // Sólo legajo (sin Google): el server resuelve legajo→correo. Si ya fichó → entra.
    out.porLegajoFicho   = await runCase({ email: null, legajo: "263", ficho: true, correo: "eli@x.com" });
    // Sólo legajo y NO fichó, pero resolvió correo → abre el lector.
    out.porLegajoNoFicho = await runCase({ email: null, legajo: "263", ficho: false, correo: "eli@x.com" });
    scan.classList.remove("show");
    return out;
  });

  const pass =
    r.yaFicho.optionsVisible && !r.yaFicho.scannerShown &&
    !r.noFicho.optionsVisible && r.noFicho.scannerShown &&
    r.rpcFail.optionsVisible && !r.rpcFail.scannerShown &&
    r.sinCorreo.optionsVisible && !r.sinCorreo.scannerShown &&
    r.porLegajoFicho.optionsVisible && !r.porLegajoFicho.scannerShown &&
    !r.porLegajoNoFicho.optionsVisible && r.porLegajoNoFicho.scannerShown &&
    errs.length === 0;

  console.log("fichada-gate:", JSON.stringify(r), "· pageerrors:", errs.length ? errs.join("|") : "none", "·", pass ? "✓ OK" : "✗ FAIL");
  await b.close();
  process.exit(pass ? 0 : 1);
})();
