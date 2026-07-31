/* Regresión v5.89 — "Cargar las cajas" (faltante asignado) abre el CP ENFOCADO en esa NP:
   no muestra toda la lista de faltantes; va derecho a cargar cajas + lío de la NP del
   operario. Multi-artículo → lista filtrada solo de esa NP; 1 artículo → salta al paso 2.
   Con fetch stubbeado. Sale 1 si falla. */
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
    function J(data) {
      const n = Array.isArray(data) ? data.length : 0;
      return Promise.resolve({
        ok: true, status: 200,
        headers: { get: function (h) { return (String(h).toLowerCase() === "content-range" && n > 0) ? ("0-" + (n - 1) + "/" + n) : null; } },
        json: function () { return Promise.resolve(data); }
      });
    }
    // 98114 tiene 2 artículos con faltante; 99999 tiene 1. Además 315/561/700.
    const FALT = [
      { id: 1, np: "98114", cod_cliente: "771", cod_art: "315", cajas_pedidas: 80, cajas_entregadas: 20, cajas_falto: 60, tanda: "D02A", fecha_salida: "2026-07-24" },
      { id: 2, np: "98114", cod_cliente: "771", cod_art: "561", cajas_pedidas: 90, cajas_entregadas: 30, cajas_falto: 60, tanda: "D02A", fecha_salida: "2026-07-24" },
      { id: 3, np: "99999", cod_cliente: "800", cod_art: "700", cajas_pedidas: 10, cajas_entregadas: 5, cajas_falto: 5, tanda: "C97A", fecha_salida: "2026-07-24" }
    ];
    // v6.18: el CP SIN foco filtra a "a_guardar>0 O guardado hoy". Para que la
    // sección 3 (lista completa) muestre 315 y 700, les damos saldo a_guardar.
    const SALDOS = [
      { cod_art: "315", descripcion: "", a_guardar: 60, terminado: 0, excedente: 0, separar_pedidos: 0, a_facturar: 0, racks: 0, insumos: 0 },
      { cod_art: "561", descripcion: "", a_guardar: 60, terminado: 0, excedente: 0, separar_pedidos: 0, a_facturar: 0, racks: 0, insumos: 0 },
      { cod_art: "700", descripcion: "", a_guardar: 5,  terminado: 0, excedente: 0, separar_pedidos: 0, a_facturar: 0, racks: 0, insumos: 0 }
    ];
    window.fetch = function (url) {
      url = String(url);
      if (url.indexOf("Entregas_Virgilio") >= 0 && url.indexOf("cajas_falto=gt.0") >= 0) return J(FALT);
      if (url.indexOf("vista_saldos_stock") >= 0) return J(SALDOS);   // stockFetchSaldos (filtro v6.18)
      if (url.indexOf("opcion=eq.TAL") >= 0) return J([]);   // cpLoadLios
      return J([]);   // Facturacion_NP, PKC, Movimientos, Articulos, etc.
    };
    const body = function () { const b = document.getElementById("cpBody"); return b ? b.innerHTML : ""; };

    // 1) Multi-artículo: foco en 98114 → lista SOLO de 98114 (315 y 561), sin 700, en paso 1
    await showCPModal("104", null, "98114");
    const h1 = body();
    out.multi_315 = /315/.test(h1);
    out.multi_561 = /561/.test(h1);
    out.multi_no700 = !/700/.test(h1);
    out.multi_esLista = /cp-frow/.test(h1) && !/Cuántas cajas/.test(h1);

    // 2) Un artículo: foco en 99999 → salta DERECHO al paso 2 (cargar cajas + lío)
    await showCPModal("104", null, "99999");
    const h2 = body();
    out.single_paso2 = /Cuántas cajas/.test(h2);
    out.single_700 = /700/.test(h2);
    out.single_no315 = !/315/.test(h2);

    // 3) Sin foco (CP normal desde botonera) → muestra TODAS (98114 + 99999)
    await showCPModal("104");
    const h3 = body();
    out.full_todas = /315/.test(h3) && /700/.test(h3);

    // 4) Cableado: "Cargar las cajas" pasa la NP como foco
    out.faltPasaNp = /showCPModal\(_faltMiLegajo\(\), null, np\)/.test(faltCompletar.toString());
    return out;
  });

  const pass =
    r.multi_315 && r.multi_561 && r.multi_no700 && r.multi_esLista &&
    r.single_paso2 && r.single_700 && r.single_no315 &&
    r.full_todas && r.faltPasaNp && errs.length === 0;
  console.log("cp-focus:", JSON.stringify(r));
  console.log("  pageerrors:", errs.length ? errs.join("|") : "none", "·", pass ? "✓ OK" : "✗ FAIL");
  await b.close();
  process.exit(pass ? 0 : 1);
})();
