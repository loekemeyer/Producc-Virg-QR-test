/* Regresión (idea 2093): _monEnSilencio — operarios "en silencio" en vivo para el
   tablero. Debe listar por legajo el último evento de HOY cuando hace > gapMin que
   no marca, EXCLUYENDO: legajos de prueba (0/1), los que cerraron jornada (FJ hoy),
   y los que están en un descanso permitido (último evento PC/PB). Ordena desc por min. */
const path = require("path");
let chromium;
try { ({ chromium } = require("/opt/node22/lib/node_modules/playwright")); }
catch (_e) { try { ({ chromium } = require("playwright")); } catch (_e2) { console.error("Playwright no encontrado."); process.exit(2); } }
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(e.message));
  await p.goto("file://" + path.join(__dirname, "..", "index.html"), { waitUntil: "domcontentloaded" });
  const r = await p.evaluate(() => {
    const now = Date.now(), iso = (m) => new Date(now - m * 60000).toISOString(), tk = isoToDayKey(now);
    const fj = new Set(["52"]);
    const evs = [
      { legajo: "50", opcion: "EP", ts_cliente: iso(120) },   // silencio 120' → SÍ
      { legajo: "50", opcion: "TP", ts_cliente: iso(200) },   // más viejo (el último es EP@120)
      { legajo: "51", opcion: "MG", ts_cliente: iso(30) },    // reciente → NO
      { legajo: "52", opcion: "AP", ts_cliente: iso(150) },   // cerró jornada (FJ) → NO
      { legajo: "53", opcion: "PC", ts_cliente: iso(100) },   // descanso permitido → NO
      { legajo: "0",  opcion: "EP", ts_cliente: iso(300) },   // test → NO
      { legajo: "55", opcion: "AP", ts_cliente: iso(95) }     // silencio 95' → SÍ
    ];
    const out = _monEnSilencio(evs, tk, fj, now, 90);
    return { out, len: out.length, first: out[0], second: out[1] };
  });
  const ok = r.len === 2 && r.first.legajo === "50" && r.second.legajo === "55" && r.first.min >= 119 && r.second.min >= 94;
  console.log("mon-silencio:", JSON.stringify(r), "· pageerrors:", errs.length ? errs.join("|") : "none", "·", (ok && !errs.length) ? "✓ OK" : "✗ FAIL");
  await b.close();
  process.exit((ok && !errs.length) ? 0 : 1);
})();
