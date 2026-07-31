/* Regresión v6.11 — (A) Picking: FORZAR retirar de góndola aunque el excedente cubra
   todo (deja de saltear + saca el paso ·EXC + avisa PGE por Telegram con el nombre).
   (B) compTerminar: el cartel de confirmación aparece SOLO cuando faltan líos, no
   cuando ya está todo hecho. Sale 1 si falla. */
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
    window.confirm = function () { return true; };   // aceptar el "¿retirar de góndola?"
    let enq = [];
    window.enqueueReport = function (pl) { enq.push(pl); };
    window.trySendOneReport = function () { return Promise.resolve({ ok: false }); };

    // ===== (A) Forzar góndola =====
    const leg = "122", tanda = "C89A";
    // 505 con excedente que cubre TODO (skip=true) + su paso ·EXC al final
    const snap = { day: getTodayKey(), tanda: tanda, legajo: leg,
      items: [
        { art: "505", key: "505", esp: 5, sector: "A01", skip: true, exc: 5, excUbic: "P5" },
        { art: "321", key: "321", esp: 2, sector: "A02" },
        { art: "505", key: "505·EXC", esp: 5, sector: "P5", excUbic: "P5", isExc: true, exc: 5 }
      ],
      idx: 0, results: {}, mode: "item", forced: {} };
    localStorage.setItem("vir_pk_" + leg, JSON.stringify(snap));

    pkResume(leg);
    await new Promise(function (res) { setTimeout(res, 40); });
    out.skipShownBefore = !!document.querySelector("#tandaModal .pk-skip");
    out.forceBtnShown = !!document.querySelector("#tandaModal .pk-forcegond");

    pkForzarGondola(0);
    await new Promise(function (res) { setTimeout(res, 40); });
    out.skipGoneAfter = !document.querySelector("#tandaModal .pk-skip");
    out.forcedNoteShown = !!document.querySelector("#tandaModal .pk-forced-note");
    out.cajasShown = !!document.querySelector("#tandaModal .pk-cajas");

    out.enqOpcion = enq.length ? enq[0].opcion : null;
    out.enqTexto = enq.length ? enq[0].texto : null;

    const saved = JSON.parse(localStorage.getItem("vir_pk_" + leg));
    out.savedHasExcStep = saved.items.some(function (x) { return x.key === "505·EXC"; });
    out.savedForced505 = !!(saved.forced && saved.forced["505"]);
    out.savedItemUnskipped = saved.items.some(function (x) { return x.key === "505" && x.skip === false && x.forcedGond === true; });

    // Re-abrir con showPickingList NO debe re-saltear (forced persiste). Simulamos el
    // rebuild aplicando la misma lógica que mete showPickingList: acá basta con
    // verificar que el snapshot llevó forced y el item desaparecido; el rebuild real
    // se cubre en pk-offline. (chequeo de persistencia arriba).

    // ===== (B) compTerminar: confirm solo con líos pendientes =====
    const src = compTerminar.toString();
    out.noConfirmSiempre = src.indexOf("Terminaste de armar la tanda") < 0;   // el cartel viejo se sacó
    out.confirmSoloPend = /Todav[ií]a faltan armar l[ií]os/.test(src);         // el nuevo, gateado
    // el confirm nuevo está DENTRO del if de pendLios (aparece después de calcular pendLios)
    out.confirmDentroPend = src.indexOf("pendLios") >= 0 &&
      src.indexOf("Todav") > src.indexOf("pendLios.length");

    return out;
  });

  const passA = r.skipShownBefore && r.forceBtnShown && r.skipGoneAfter &&
    r.forcedNoteShown && r.cajasShown &&
    r.enqOpcion === "PGE" && r.enqTexto === "505|C89A" &&
    r.savedHasExcStep === false && r.savedForced505 === true && r.savedItemUnskipped === true;
  const passB = r.noConfirmSiempre && r.confirmSoloPend && r.confirmDentroPend;
  const pass = passA && passB && errs.length === 0;

  console.log("pk-forzar-gondola:", JSON.stringify(r));
  console.log("  pageerrors:", errs.length ? errs.join("|") : "none");
  console.log("  A(forzar góndola):", passA ? "✓" : "✗", "· B(confirm solo pend):", passB ? "✓" : "✗", "·", pass ? "OK" : "FAIL");
  await b.close();
  process.exit(pass ? 0 : 1);
})();
