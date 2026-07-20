/* Regresión v5.30 — MG "De los racks" (rkbConfirmar) ahora PROPONE (Racks_Bajadas
   estado='propuesta') para la aprobación de Marianela, en vez de mover el stock directo.
   Verifica: NO llama stockMove, POSTea a Racks_Bajadas con estado='propuesta' y cajas en
   INNER (master × CxM). Sale 1 si falla. */
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
    window.alert = function () {};
    // Stubs para armar _rkb sin red (showRacksBajarModal solo llama estas 3).
    window.stockFetchSaldos = async function () { return { "590E": { cod: "590E", desc: "Aceitera", racks: 100 } }; };
    window.loadArtNombres = async function () { return; };
    window.rkbFetchCxM = async function () { return { cxm: { "590E": 12 }, locs: {} }; };
    let stockMoveCalled = 0; const fetches = [];
    window.stockMove = function () { stockMoveCalled++; };
    window.fetch = function (url, opts) {
      fetches.push({ url: String(url), body: (opts && opts.body) || null });
      return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve([]); } });
    };
    await showRacksBajarModal("237");
    if (typeof _rkb === "undefined" || !_rkb || !_rkb.items || !_rkb.items.length) return { err: "no _rkb" };
    const it = _rkb.items.find(function (x) { return String(x.cod).toUpperCase() === "590E"; });
    if (!it) return { err: "no 590E item" };
    it.baja = 2;    // 2 master; cxm 12 → inner 24
    it.sec = null;  // sin ubicación → no dispara la RPC de planimetría
    rkbConfirmar();
    await new Promise(function (res) { setTimeout(res, 10); });
    const bajPost = fetches.find(function (f) { return f.url.indexOf("Racks_Bajadas") >= 0; });
    let parsed = null; try { parsed = bajPost ? JSON.parse(bajPost.body) : null; } catch (_e) {}
    return { stockMoveCalled: stockMoveCalled, postedToBajadas: !!bajPost, row: (parsed && parsed[0]) || null };
  });
  const row = r.row || {};
  const pass = r.stockMoveCalled === 0 && r.postedToBajadas === true &&
    row.estado === "propuesta" && Number(row.cajas) === 24 && String(row.cod_art) === "590E" &&
    (row.orden_id === null || row.orden_id === undefined) && errs.length === 0;
  console.log("racks-propuesta:", JSON.stringify(r), "· pageerrors:", errs.length ? errs.join("|") : "none", "·", pass ? "✓ OK" : "✗ FAIL");
  await b.close();
  process.exit(pass ? 0 : 1);
})();
