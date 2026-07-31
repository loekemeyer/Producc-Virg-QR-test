/* Regresión v5.72 — candado anti doble-armado.
   Si una tanda YA fue armada (ya tiene Entregas), compTerminar NO la arma de nuevo
   (evita duplicar el pedido, lo que rompió la NP 98114). Se testea el helper
   _compTandaYaArmada (con fetch stubbeado) + el cableado dentro de compTerminar. */
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
    function J(data, ok) { return Promise.resolve({ ok: ok !== false, status: ok === false ? 500 : 200, headers: { get: function () { return null; } }, json: function () { return Promise.resolve(data); } }); }

    // 1) Tanda YA armada (Entregas devuelve filas) → true
    window.fetch = function (url) {
      url = String(url);
      if (url.indexOf("Entregas_Virgilio") >= 0 && url.indexOf("tanda=eq.D02A") >= 0) return J([{ id: 1 }]);
      return J([]);
    };
    out.armada = await _compTandaYaArmada("D02A");        // true
    out.armadaLower = await _compTandaYaArmada("d02a");    // true (normaliza a upper)

    // 2) Tanda nueva (Entregas vacío) → false
    out.nueva = await _compTandaYaArmada("ZZ99");          // false

    // 3) Error de red (ok:false) → false (no traba el laburo)
    window.fetch = function () { return J([{ id: 1 }], false); };
    out.errorNoBloquea = await _compTandaYaArmada("D02A"); // false

    // 4) vacío / null → false
    out.vacio = await _compTandaYaArmada("");              // false

    // 5) Cableado: compTerminar usa el candado ANTES de mandar los líos
    const src = compTerminar.toString();
    out.usaCandado = /_compTandaYaArmada/.test(src);
    out.usaTerminando = /_terminando/.test(src);
    out.candadoAntesDeLios = src.indexOf("_compTandaYaArmada") < src.indexOf("liosSend") && src.indexOf("_compTandaYaArmada") > 0;

    // 6) Cableado: showCompletarWizard bloquea al ABRIR, ANTES de restaurar/armar (v5.73)
    const src2 = showCompletarWizard.toString();
    out.openUsaCandado = /_compTandaYaArmada/.test(src2);
    out.openAntesDeRestore = src2.indexOf("_compTandaYaArmada") > 0 && src2.indexOf("_compTandaYaArmada") < src2.indexOf("_compRestore");
    return out;
  });

  const pass =
    r.armada === true && r.armadaLower === true && r.nueva === false &&
    r.errorNoBloquea === false && r.vacio === false &&
    r.usaCandado === true && r.usaTerminando === true && r.candadoAntesDeLios === true &&
    r.openUsaCandado === true && r.openAntesDeRestore === true &&
    errs.length === 0;
  console.log("comp-doblearmado:", JSON.stringify(r));
  console.log("  pageerrors:", errs.length ? errs.join("|") : "none", "·", pass ? "✓ OK" : "✗ FAIL");
  await b.close();
  process.exit(pass ? 0 : 1);
})();
