/* Regresión v5.74 — exclusividad de tanda (no pueden empezar dos el mismo picking/armado).
   getActivityStatus ahora arma pickingEnCursoBy / armadoEnCursoBy (tanda EN CURSO -> legajo).
   send() bloquea EP/AP si OTRO la tiene en curso; populateTandasList (AP) la esconde.
   Se testea el cálculo (fetch stub) + el cableado en send() y populateTandasList. */
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
    function J(data) { return Promise.resolve({ ok: true, status: 200, headers: { get: function () { return null; } }, json: function () { return Promise.resolve(data); } }); }
    window.fetch = function (url) {
      url = String(url);
      if (url.indexOf("opcion=in.(EP,TP,AP,TAP)") >= 0) {
        return J([
          // TANDA_A: picking EN CURSO por 104 (EP sin TP)
          { opcion: "EP", texto: "TANDA_A", ts_cliente: "2026-07-23T10:00:00Z", legajo: "104" },
          // TANDA_B: armado EN CURSO por 55 (AP sin TAP)
          { opcion: "AP", texto: "TANDA_B", ts_cliente: "2026-07-23T10:05:00Z", legajo: "55" },
          // TANDA_C: picking TERMINADO (EP+TP) → no en curso
          { opcion: "EP", texto: "TANDA_C", ts_cliente: "2026-07-23T09:00:00Z", legajo: "104" },
          { opcion: "TP", texto: "TANDA_C", ts_cliente: "2026-07-23T09:30:00Z", legajo: "104" },
          // TANDA_D: armado TERMINADO (AP+TAP) → no en curso
          { opcion: "AP", texto: "TANDA_D", ts_cliente: "2026-07-23T09:00:00Z", legajo: "55" },
          { opcion: "TAP", texto: "TANDA_D", ts_cliente: "2026-07-23T09:30:00Z", legajo: "55" }
        ]);
      }
      return J([]);
    };
    const s = await getActivityStatus(true);
    out.pickA        = s.pickingEnCursoBy.get("TANDA_A");   // "104"
    out.pickC_done   = s.pickingEnCursoBy.has("TANDA_C");   // false
    out.armB         = s.armadoEnCursoBy.get("TANDA_B");    // "55"
    out.armD_done    = s.armadoEnCursoBy.has("TANDA_D");    // false
    out.mapsExist    = (s.pickingEnCursoBy instanceof Map) && (s.armadoEnCursoBy instanceof Map);

    // Cableado: send() bloquea con estos mapas; populateTandasList (AP) los usa para esconder
    const srcSend = send.toString();
    out.sendUsaPick  = /pickingEnCursoBy/.test(srcSend);
    out.sendUsaArm   = /armadoEnCursoBy/.test(srcSend);
    out.sendForce    = /getActivityStatus\(true\)/.test(srcSend);
    out.apEsconde    = /armadoEnCursoBy/.test(populateTandasList.toString());

    // v5.74b — reserva ATÓMICA (RPC). tandaReservar devuelve el dueño que quedó.
    window.fetch = function (url) {
      url = String(url);
      if (url.indexOf("rpc/tanda_reservar") >= 0) return J({ tanda: "TANDA_X", fase: "picking", legajo: "77", nombre: "Marta" });
      return J([]);
    };
    const lk = await tandaReservar("TANDA_X", "picking", "104", "Yo");
    out.reservaDueno   = lk && lk.legajo === "77";        // otro (77) es el dueño → yo pierdo
    out.sendReserva    = /tandaReservar/.test(srcSend);   // send() usa la reserva atómica
    out.sendLibera     = /tandaLiberar/.test(srcSend);    // send() libera al terminar (TP/TAP)
    return out;
  });

  const pass =
    r.pickA === "104" && r.pickC_done === false && r.armB === "55" && r.armD_done === false &&
    r.mapsExist === true &&
    r.sendUsaPick === true && r.sendUsaArm === true && r.sendForce === true && r.apEsconde === true &&
    r.reservaDueno === true && r.sendReserva === true && r.sendLibera === true &&
    errs.length === 0;
  console.log("tanda-lock:", JSON.stringify(r));
  console.log("  pageerrors:", errs.length ? errs.join("|") : "none", "·", pass ? "✓ OK" : "✗ FAIL");
  await b.close();
  process.exit(pass ? 0 : 1);
})();
