/* Regresión v5.70 — Facturación: chip "⚠ Con faltante: N" + filtro "solo faltantes".
   La operadora entra a facturar ANTES de que el pedido salga y tiene que ver, por NP,
   cuáles salieron cortos. Esto agrega un contador arriba y un clic para ver SOLO esos.
   Test aislado (no reusa fac-npc para no arrastrar _facNpsHoy tickeados). Sin red. */
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
    // El modal arranca display:none; lo mostramos para poder medir geometría (clipping).
    const _fm = document.getElementById("facturacionModal"); if (_fm) _fm.style.display = "block";
    function J(data) {
      return Promise.resolve({ ok: true, status: 200, headers: { get: function () { return null; } }, json: function () { return Promise.resolve(data); } });
    }
    // Solo la NP 500 salió con faltante; la 501 salió completa.
    window.fetch = function (url) {
      url = String(url);
      if (url.indexOf("Entregas_Virgilio") >= 0 && url.indexOf("cajas_falto=gt.0") >= 0) {
        return J([{ np: "500", cod_art: "315", cajas_falto: 8, cajas_pedidas: 20 }]);
      }
      return J([]);
    };
    await facFetchFaltantes();

    // Tandas fake con 2 NPs (500 con faltante, 501 sin). _facNpsHoy/_todos vacíos
    // en carga fresca → no se ocultan.
    const tandas = [{
      tanda: "C90A", fechaEntrega: "20/07", fechaEntregaRaw: "2026-07-20",
      pedidos: [
        { np: "500", cod: "111", razonSocial: "Cliente Con Falta", direccion: "Calle 1", m3: 1.2, barrio: "Centro", zona: "Z1" },
        { np: "501", cod: "222", razonSocial: "Cliente OK",        direccion: "Calle 2", m3: 0.9, barrio: "Centro", zona: "Z1" }
      ]
    }];
    const nRows = function () { return document.querySelectorAll("#facContainer tr[data-fac-np]").length; };
    const has = function (np) { return !!document.querySelector('#facContainer tr[data-fac-np="' + np + '"]'); };

    // 1) Render normal: chip visible con "1", las 2 filas, la 500 marcada
    facRender(tandas);
    out.chipCount = (document.getElementById("facCntFalt") || {}).textContent;                 // "1"
    out.chipShown = (document.getElementById("facChipFalt") || {}).style.display !== "none";    // true
    out.rowsAll   = nRows();                                                                    // 2
    out.class500  = /fac-has-falta/.test((document.querySelector('#facContainer tr[data-fac-np="500"]') || {}).className || "");
    // v5.80: los faltantes van en COLUMNA aparte (.fac-falta-col), SOLO la distribución
    // por artículo (cod×faltó), sin el total "FALTA N cj".
    const _row500 = document.querySelector('#facContainer tr[data-fac-np="500"]');
    const _fc500 = _row500 ? _row500.querySelector("td.fac-falta-col") : null;
    out.faltDist500 = /315×8/.test((_fc500 || {}).innerHTML || "");            // muestra la distribución
    out.noTotalInDist = !/FALTA|cj/.test((_fc500 || {}).innerHTML || "");      // NO el total "FALTA N cj"
    out.faltColExists = !!_fc500;
    if (_fc500) {
      const br = _fc500.getBoundingClientRect();
      out.faltColWraps = getComputedStyle(_fc500).whiteSpace;                  // "normal" (no se corta)
      out.faltColNotClipped = br.width > 0 && br.height > 0;
    }
    // la Razón Social YA NO lleva el badge de faltante
    const _td500rs = _row500 ? _row500.querySelector("td.fac-rs-cell") : null;
    out.rsNoFaltaBadge = _td500rs ? !_td500rs.querySelector(".fac-falta-badge") : false;
    out.rsCellWraps = _td500rs ? getComputedStyle(_td500rs).whiteSpace : "";   // sigue "normal"
    // la 501 (sin faltante) → columna vacía
    const _row501 = document.querySelector('#facContainer tr[data-fac-np="501"]');
    out.dist501empty = ((_row501 && _row501.querySelector("td.fac-falta-col") || {}).innerHTML || "") === "";
    out.chipOffBefore = !(document.getElementById("facChipFalt") || { classList: { contains: function () { return false; } } }).classList.contains("on");

    // 2) Filtro ON: solo la 500
    facToggleSoloFalt();
    out.rowsFiltered = nRows();                                                                 // 1
    out.only500      = has("500") && !has("501");                                               // true
    out.chipOnAfter  = document.getElementById("facChipFalt").classList.contains("on");         // true

    // 3) Filtro OFF: vuelven las 2
    facToggleSoloFalt();
    out.rowsBack = nRows();                                                                     // 2
    out.chipOffAfter = !document.getElementById("facChipFalt").classList.contains("on");        // true

    // 4) Sin faltantes → chip oculto y filtro no se traba
    window.fetch = function () { return J([]); };
    // forzar recomputo del map a vacío: facFetchFaltantes cachea 30s, así que
    // probamos el caso "sin faltante" con una NP que no está en el map.
    const tandas2 = [{
      tanda: "C91A", fechaEntrega: "20/07", fechaEntregaRaw: "2026-07-20",
      pedidos: [{ np: "999", cod: "333", razonSocial: "Sin Falta", direccion: "x", m3: 1, barrio: "b", zona: "z" }]
    }];
    facRender(tandas2);
    out.chipHiddenNoFalt = (document.getElementById("facChipFalt") || {}).style.display === "none"; // true
    out.rows999 = nRows();                                                                      // 1
    return out;
  });

  const pass =
    r.chipCount === "1" && r.chipShown === true && r.rowsAll === 2 &&
    r.faltDist500 === true && r.noTotalInDist === true && r.class500 === true && r.chipOffBefore === true &&
    r.faltColExists === true && r.faltColWraps === "normal" && r.faltColNotClipped === true &&
    r.rsNoFaltaBadge === true && r.rsCellWraps === "normal" && r.dist501empty === true &&
    r.rowsFiltered === 1 && r.only500 === true && r.chipOnAfter === true &&
    r.rowsBack === 2 && r.chipOffAfter === true &&
    r.chipHiddenNoFalt === true && r.rows999 === 1 &&
    errs.length === 0;
  console.log("fac-falta-filter:", JSON.stringify(r));
  console.log("  pageerrors:", errs.length ? errs.join("|") : "none", "·", pass ? "✓ OK" : "✗ FAIL");
  await b.close();
  process.exit(pass ? 0 : 1);
})();
