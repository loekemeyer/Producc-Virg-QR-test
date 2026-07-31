/* Regresión (idea 5490): idempotencia de Movimientos_Stock. stockMove debe (a) ponerle
   un client_id a cada fila, (b) mandar Prefer con resolution=ignore-duplicates, y (c) si
   el POST falla (wifi), dejar la fila en vir_stock_pend con EL MISMO client_id; luego
   stockFlushPend la reintenta con ignore-duplicates y el mismo id → ON CONFLICT DO NOTHING
   en el server no vuelve a sumar cajas. Acá stubeamos fetch para verificar el contrato. */
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
  const r = await p.evaluate(async () => {
    try { localStorage.removeItem("vir_stock_pend"); } catch (_e) {}
    const cap = [];
    // 1) POST falla (red caída tras un posible insert) → debe encolar
    window.fetch = function (url, opts) { cap.push({ url: url, opts: opts }); return Promise.reject(new Error("net")); };
    await stockMove([{ cod_art: "TESTX", deposito: "a_guardar", delta: 5, tipo: "ajuste" }]);
    const req1 = cap[0] || {};
    const body1 = JSON.parse((req1.opts && req1.opts.body) || "[]");
    const prefer1 = (req1.opts && req1.opts.headers && req1.opts.headers.Prefer) || "";
    const pend = JSON.parse(localStorage.getItem("vir_stock_pend") || "[]");
    // 2) reintento OK → stockFlushPend manda ignore-duplicates + mismo client_id
    cap.length = 0;
    window.fetch = function (url, opts) { cap.push({ url: url, opts: opts }); return Promise.resolve({ ok: true }); };
    stockFlushPend();
    await new Promise(function (res) { setTimeout(res, 30); });
    const req2 = cap[0] || {};
    const body2 = JSON.parse((req2.opts && req2.opts.body) || "[]");
    const prefer2 = (req2.opts && req2.opts.headers && req2.opts.headers.Prefer) || "";
    return {
      sentCid: !!(body1[0] && body1[0].client_id),
      prefer1: prefer1,
      pendLen: pend.length,
      pendCid: pend[0] && pend[0].client_id,
      sameCid: !!(pend[0] && body1[0] && pend[0].client_id === body1[0].client_id),
      flushPrefer: prefer2,
      flushSameCid: !!(body2[0] && pend[0] && body2[0].client_id === pend[0].client_id)
    };
  });
  const ok =
    r.sentCid && /resolution=ignore-duplicates/.test(r.prefer1) &&
    r.pendLen === 1 && r.sameCid &&
    /resolution=ignore-duplicates/.test(r.flushPrefer) && r.flushSameCid;
  console.log("stock-idempotent:", JSON.stringify(r), "· pageerrors:", errs.length ? errs.join("|") : "none", "·", (ok && !errs.length) ? "✓ OK" : "✗ FAIL");
  await b.close();
  process.exit((ok && !errs.length) ? 0 : 1);
})();
