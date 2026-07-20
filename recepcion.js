/* =========================================================
   recepcion.js — MODO OP de Recepción de Mercadería, integrado en
   Producción Virgilio. Portado de la app "Control-Carga-Remitos-FC"
   (v1.13.0), pruning del modo Admin / Pendientes (eso queda en la otra app).

   Se dispara cuando el operario toca **RT (Recepción Mercadería)** y abre el
   flujo: Talleristas / Prov. Art. Terminado → buscar → línea + fecha →
   N° RTO/FC → grilla de códigos con pop-up de cajas → resumen → confirmar.
   Graba en "Entregas Tallerista Virgilio" / "Entregas Prov AT" + deja el
   pendiente en "Control_Modo_OP" (mismo Supabase que Producción).

   AISLAMIENTO: todo el DOM va dentro de #rcpRoot y todo el CSS está scopeado
   bajo #rcpRoot (con sus propias variables), así no pisa ni lo pisan los
   estilos de Producción (que tiene un `button{}` global, etc.).

   PUENTE CON PRODUCCIÓN: al confirmar un envío, suma las cajas al acumulador
   del día en localStorage ("vir_recepcion_cajas_<legajo>_<día>"). Producción
   lo lee al "Terminar Día" para cerrar RT con esa cantidad sin pedirla a mano.
   La app llama window.openRecepcionOp(legajo, dayKey).
   ========================================================= */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://hrxfctzncixxqmpfhskv.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_BqpAgZH6ty-9wft10_YMhw_0rcIPuWT";
// ⚠ storageKey PROPIA (v5.21): sin esto, este cliente comparte la key default
// "sb-<ref>-auth-token" con el login Google de index.html y el signInAnonymously
// de abajo PISABA la sesión del supervisor (deslogueos "de la nada"). Además:
// detectSessionInUrl:false para no canjear el ?code= del callback OAuth ajeno.
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storageKey: "sb-hrxfctzncixxqmpfhskv-recepcion",
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false
  }
});

// Sesion anonima silenciosa: las policies RLS de INSERT permiten rol authenticated.
const sessionReady = (async () => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) return session;
    const { data, error } = await supabase.auth.signInAnonymously();
    if (error) { console.error("Recepcion: anonymous sign-in failed:", error); return null; }
    return data.session;
  } catch (e) { console.error("Recepcion: auth init exception:", e); return null; }
})();

/* ============== Estado del puente con Producción ============== */
const RECP = { legajo: null, dayKey: null };
function recpAddCajas(n) {
  try {
    if (!RECP.legajo || !RECP.dayKey || !n) return;
    const k = "vir_recepcion_cajas_" + RECP.legajo + "_" + RECP.dayKey;
    const cur = parseInt(localStorage.getItem(k), 10) || 0;
    localStorage.setItem(k, String(cur + n));
  } catch (e) { /* no-op */ }
}

/* ============== CSS (scopeado bajo #rcpRoot) ============== */
const RCP_CSS = `
#rcpRoot{ --border:#d0d7de; --bg:#fafafa; --danger:#b42318; --ok:#0a7a2f; }
#rcpRoot *{ box-sizing:border-box; }
#rcpRoot button{ width:auto; margin:0; }
#rcpRoot .opSubtitle{ font-size:14px; font-weight:700; color:#555; margin:-6px 0 12px; min-height:18px; }
#rcpRoot .opGrid{ display:grid; gap:10px; }
#rcpRoot .opGrid.codes{ grid-template-columns:repeat(auto-fill,minmax(92px,1fr)); }
#rcpRoot .opTipoBtns{ display:flex; flex-direction:column; gap:16px; max-width:420px; margin:10px auto 0; }
#rcpRoot .opTipoBtn{ height:90px; font-size:22px; font-weight:900; border-radius:14px; border:2px solid var(--border); background:#fff; color:#111; cursor:pointer; }
#rcpRoot .opTipoBtn:hover{ border-color:#111; }
#rcpRoot .opLista{ display:grid; grid-template-columns:1fr 1fr; gap:10px; }
#rcpRoot .btnBig{ height:52px; font-size:18px; padding:0 24px; }
#rcpRoot .btnAnular{ border:2px solid var(--danger); background:#fff; color:var(--danger); border-radius:10px; padding:10px 16px; font-weight:900; cursor:pointer; }
#rcpRoot .resHeader{ font-size:24px; font-weight:900; margin-bottom:12px; }
#rcpRoot .resList{ display:flex; flex-direction:column; gap:8px; }
#rcpRoot .resItem{ display:flex; align-items:center; justify-content:space-between; border:2px solid var(--border); border-radius:10px; padding:12px 16px; }
#rcpRoot .resCod{ font-size:24px; font-weight:900; color:#111; }
#rcpRoot .resCajas{ font-size:18px; font-weight:900; color:var(--ok); }
#rcpRoot .resTotal{ margin-top:14px; font-size:16px; font-weight:900; color:#333; }
#rcpRoot .cajasCodLine{ font-size:20px; margin-bottom:4px; }
#rcpRoot .cajasCodLine strong{ font-size:34px; }
#rcpRoot .cajasLabel{ display:block; font-weight:900; font-size:18px; margin:6px 0 10px; }
#rcpRoot .cajasRow{ display:flex; align-items:stretch; gap:12px; }
#rcpRoot .modalCard input[type="text"].cajasInput{ width:104px; height:104px; font-size:48px; font-weight:900; text-align:center; letter-spacing:normal; padding:0; border:2px solid var(--border); border-radius:12px; box-sizing:border-box; flex:0 0 auto; }
#rcpRoot .cajasNext{ flex:1; font-size:24px; font-weight:900; border:0; border-radius:12px; background:#111; color:#fff; cursor:pointer; }
#rcpRoot .cajasActions{ margin-top:12px; display:flex; justify-content:flex-end; }
#rcpRoot .opFechaBox{ position:relative; }
#rcpRoot .opFechaTxt{ display:block; height:64px; line-height:64px; text-align:center; font-size:32px; font-weight:900; border:2px solid var(--border); border-radius:10px; background:#f5f5f5; color:#111; }
#rcpRoot .opFechaHidden{ position:absolute; inset:0; width:100%; height:100%; opacity:0; border:0; margin:0; cursor:pointer; }
#rcpRoot .opNameBtn{ padding:18px 12px; font-weight:900; font-size:16px; border:2px solid var(--border); border-radius:12px; background:#fff; cursor:pointer; text-align:center; line-height:1.2; }
#rcpRoot .opNameBtn:hover{ border-color:#111; }
#rcpRoot .opNameBtn .tag{ display:block; font-size:11px; font-weight:800; color:#a06000; margin-top:4px; }
#rcpRoot input[type="text"].opSearch{ width:100%; height:50px; font-size:18px; letter-spacing:normal; text-align:left; border-radius:10px; border:2px solid var(--border); padding:0 14px; box-sizing:border-box; margin-bottom:14px; }
#rcpRoot .opCodeBtn{ aspect-ratio:1/1; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:4px; font-weight:900; font-size:18px; border:2px solid var(--border); border-radius:12px; background:#fff; cursor:pointer; padding:6px; text-align:center; min-width:0; overflow-wrap:anywhere; }
#rcpRoot .opCodeBtn .cnt{ font-size:12px; font-weight:800; color:var(--ok); }
#rcpRoot .opCodeBtn.loaded{ background:#eef7ee; border-color:var(--ok); color:#333; }
#rcpRoot .opCodeBtn.opCodeAdd{ border:2px dashed var(--ok); color:var(--ok); background:#f6fff8; }
#rcpRoot .opCodeAddPlus{ font-size:34px; line-height:1; font-weight:900; }
#rcpRoot .opLineRow{ display:flex; gap:14px; margin-top:14px; }
#rcpRoot .opLineBtn{ flex:1; height:90px; font-size:24px; font-weight:900; border-radius:14px; border:2px solid var(--border); background:#fff; cursor:pointer; }
#rcpRoot .opLineBtn.active{ background:#111; color:#fff; border-color:#111; }
#rcpRoot .opField{ margin-top:14px; }
#rcpRoot .opField label{ display:block; font-weight:900; margin-bottom:6px; }
#rcpRoot input[type="text"].opRtoInput{ width:100%; height:56px; font-size:30px; letter-spacing:8px; text-align:center; border-radius:10px; border:2px solid var(--border); box-sizing:border-box; }
#rcpRoot .opEmpty{ padding:10px; color:#666; }
#rcpRoot .opOk{ padding:14px; color:var(--ok); font-weight:900; font-size:18px; }
#rcpRoot .opPage{ position:fixed; inset:0; background:var(--bg); overflow:auto; display:none; z-index:1300; }
#rcpRoot .opPage.open{ display:block; }
#rcpRoot .opPageInner{ max-width:780px; margin:0 auto; padding:16px; min-height:100%; box-sizing:border-box; display:flex; flex-direction:column; }
#rcpRoot .opHeader{ display:flex; align-items:center; justify-content:space-between; gap:10px; padding:8px 0 14px; margin-bottom:14px; border-bottom:1px solid var(--border); position:sticky; top:0; background:var(--bg); z-index:6; }
#rcpRoot .opPageTitle{ flex:1; text-align:center; font-size:22px; font-weight:900; }
#rcpRoot .opNav{ background:#fff; border:2px solid var(--border); border-radius:12px; padding:14px 20px; font-size:18px; font-weight:900; cursor:pointer; white-space:nowrap; }
#rcpRoot .opPageBody{ flex:1; }
#rcpRoot .opPageActions{ margin-top:18px; display:flex; flex-wrap:wrap; align-items:center; justify-content:flex-end; gap:10px; position:sticky; bottom:0; background:var(--bg); padding:12px 0; }
#rcpRoot .opPageActions .btnSend{ height:52px; font-size:18px; padding:0 24px; }
#rcpRoot .opPageActions .btnCancel, #rcpRoot .opPageActions .btnAnular{ height:52px; padding:0 16px; }
#rcpRoot .modal{ position:fixed; inset:0; background:rgba(0,0,0,.45); display:none; align-items:flex-start; justify-content:center; padding:24px; overflow:auto; z-index:1400; }
#rcpRoot .modal.open{ display:flex; }
#rcpRoot .modalCard{ background:#fff; border-radius:14px; padding:20px; width:100%; max-width:360px; max-height:90vh; display:flex; flex-direction:column; }
#rcpRoot .modalHeader{ display:flex; align-items:center; justify-content:space-between; margin-bottom:14px; }
#rcpRoot .modalTitle{ font-size:22px; font-weight:900; }
#rcpRoot .modalClose{ background:#fff; border:1px solid var(--border); width:32px; height:32px; border-radius:50%; cursor:pointer; font-size:14px; font-weight:900; }
#rcpRoot .btnCancel{ padding:10px 16px; border-radius:10px; border:1px solid var(--border); background:#fff; font-weight:900; cursor:pointer; }
#rcpRoot .btnSend{ padding:10px 16px; border-radius:10px; border:0; background:#111; color:#fff; font-weight:900; cursor:pointer; }
/* Pendientes (Marianela) = TARJETAS verticales (sin scroll horizontal): tilde + No
   corresponde + foto (adjuntar/arrastrar) + Enviar (código). */
#rcpRoot .opPage.pendWide .opPageInner{ max-width:none; }   /* PC: usa todo el ancho */
#rcpRoot .pendCards{ display:grid; grid-template-columns:repeat(auto-fill, minmax(min(100%, 360px), 360px)); gap:12px; align-items:start; }
#rcpRoot .pendCard{ border:2px solid var(--border); border-radius:14px; background:#fff; padding:12px 14px; }
#rcpRoot .pendCard.sentRow{ border-color:var(--ok); background:#f6fff8; }
#rcpRoot .pcHead{ display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
#rcpRoot .pcName{ font-size:18px; font-weight:900; color:#111; }
#rcpRoot .pcTag{ font-size:11px; font-weight:800; color:#a06000; background:#fff7e6; border:1px solid #ffd98a; border-radius:999px; padding:2px 8px; }
#rcpRoot .pcRto{ margin-left:auto; font-size:13px; font-weight:800; color:#475569; white-space:nowrap; }
#rcpRoot .pcMeta{ font-size:13px; color:#666; margin-top:3px; }
#rcpRoot .pcDemora{ font-weight:900; color:#b45309; font-size:14px; }
#rcpRoot .pcEntrega{ font-size:14px; color:#333; margin-top:6px; font-variant-numeric:tabular-nums; word-break:break-word; }
#rcpRoot .pcActs{ margin-top:10px; border-top:1px solid #eee; padding-top:10px; display:flex; flex-direction:column; gap:10px; }
#rcpRoot .pcRow{ display:flex; align-items:center; gap:12px; }
#rcpRoot .pcRow.pcFotoRow{ flex-wrap:wrap; }
#rcpRoot .pcLbl{ font-size:16px; font-weight:800; color:#111; }
#rcpRoot .tickBtn{ width:28px; height:28px; border-radius:8px; border:2px solid #cbd5e1; background:#fff; font-size:0; cursor:pointer; position:relative; padding:0; flex:0 0 auto; }
#rcpRoot .tickBtn.on{ background:var(--ok); border-color:var(--ok); }
#rcpRoot .tickBtn.on::after{ content:""; position:absolute; left:50%; top:46%; width:7px; height:13px; border:solid #fff; border-width:0 3px 3px 0; transform:translate(-50%,-50%) rotate(45deg); }
#rcpRoot .noBtn{ margin-left:auto; padding:8px 12px; font-size:12px; font-weight:800; border:2px solid var(--border); border-radius:9px; background:#fff; color:#111; cursor:pointer; white-space:nowrap; }
#rcpRoot .noBtn.on{ background:var(--danger); border-color:var(--danger); color:#fff; }
#rcpRoot .pcFotoRow .fotoDrop{ flex:1; }
#rcpRoot .fotoDrop{ display:inline-flex; align-items:center; justify-content:center; min-width:160px; min-height:46px; padding:8px 12px; border:2px dashed #cbd5e1; border-radius:10px; background:#fff; cursor:pointer; font-weight:800; font-size:13px; color:#475569; }
#rcpRoot .fotoDrop.has{ border-style:solid; border-color:var(--ok); color:var(--ok); background:#eef7ee; }
#rcpRoot .fotoDrop.drag{ border-color:#1e6bd6; background:#eff6ff; }
#rcpRoot .pcFoot{ margin-top:10px; display:flex; align-items:center; justify-content:flex-end; gap:12px; }
#rcpRoot .enviarBtn{ padding:11px 22px; font-size:16px; font-weight:900; border:0; border-radius:11px; background:#111; color:#fff; cursor:pointer; }
#rcpRoot .enviarBtn:disabled{ opacity:.4; cursor:default; }
#rcpRoot .codigoBox{ font-size:26px; font-weight:900; letter-spacing:4px; color:#0a7a2f; font-variant-numeric:tabular-nums; }
`;

/* ============== DOM (inyectado dentro de #rcpRoot) ============== */
const RCP_HTML = `
<div id="opPage" class="opPage">
  <div class="opPageInner">
    <div class="opHeader">
      <button id="opBack" class="opNav" style="display:none">‹ Atrás</button>
      <div id="opTitle" class="opPageTitle">Recepción</div>
      <button id="opClose" class="opNav">✕ Salir</button>
    </div>
    <div id="opSubtitle" class="opSubtitle"></div>
    <div id="opBody" class="opPageBody"></div>
    <div id="opActions" class="opPageActions"></div>
  </div>
</div>
<div id="opCajasModal" class="modal" role="dialog" aria-modal="true">
  <div class="modalCard">
    <div class="modalHeader">
      <div class="modalTitle">Cajas entregadas</div>
      <button id="opCajasClose" class="modalClose" aria-label="Cerrar">×</button>
    </div>
    <div class="cajasCodLine">Código <strong id="opCajasCod"></strong></div>
    <label for="opCajasInput" class="cajasLabel">¿Cuántas cajas?</label>
    <div class="cajasRow">
      <input id="opCajasInput" class="cajasInput" type="text" inputmode="numeric" />
      <button id="opCajasNext" class="cajasNext">Siguiente</button>
    </div>
    <div class="cajasActions">
      <button id="opCajasDelete" class="btnCancel" style="display:none">Quitar</button>
    </div>
  </div>
</div>
`;

const rcpRoot = document.createElement("div");
rcpRoot.id = "rcpRoot";
rcpRoot.innerHTML = RCP_HTML;
const rcpStyle = document.createElement("style");
rcpStyle.textContent = RCP_CSS;
document.head.appendChild(rcpStyle);
document.body.appendChild(rcpRoot);

/* ============== Refs ============== */
const opPage = document.getElementById("opPage");
const opTitle = document.getElementById("opTitle");
const opSubtitle = document.getElementById("opSubtitle");
const opBody = document.getElementById("opBody");
const opActions = document.getElementById("opActions");
const opBack = document.getElementById("opBack");
const opClose = document.getElementById("opClose");
const opCajasModal = document.getElementById("opCajasModal");
const opCajasCod = document.getElementById("opCajasCod");
const opCajasInput = document.getElementById("opCajasInput");
const opCajasNext = document.getElementById("opCajasNext");
const opCajasDelete = document.getElementById("opCajasDelete");
const opCajasClose = document.getElementById("opCajasClose");

const opState = {
  step: null,
  tipo: null,        // 'tallerista' | 'prov_at'
  entidades: null,   // lista completa para el buscador
  tallCod: null, tallNombre: null,
  tallCods: null,    // { LK:codigo, CH:codigo } del tallerista (prov_at: {LK:true,CH:true})
  articulosManual: null,
  linea: null, fecha: null,
  remito: "",
  articulos: null,   // [{Cod_Art, Desc}]
  cargas: {},        // { Cod_Art: cajas }
  cajasCod: null,    // codigo abierto en el popup
  listaTipo: null
};

function opTodayStr() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return yyyy + "-" + mm + "-" + dd;
}

/* ============== Navegación ============== */
function opResetState() {
  opState.step = null;
  opState.tipo = null;
  opState.entidades = null;
  opState.tallCod = null; opState.tallNombre = null; opState.tallCods = null;
  opState.articulosManual = null;
  opState.linea = null; opState.fecha = opTodayStr();
  opState.remito = ""; opState.articulos = null; opState.cargas = {};
}
function openOp() {
  opResetState();
  opState.fromMenu = false;     // operario (RT) entra directo a la carga, sin menú
  opPage.classList.remove("pendWide");
  opPage.classList.add("open");
  renderTipoElegir();
}
let _pendTimer = null;   // timer del "hace X hs" en vivo de Pendientes
function closeOp() { opPage.classList.remove("open"); if (_pendTimer) { clearInterval(_pendTimer); _pendTimer = null; } }
opClose.onclick = closeOp;

opBack.onclick = () => {
  if (opState.step === "tipo" || opState.step === "pend" || opState.step === "racks") renderMenu();
  else if (opState.step === "lista") renderTipoElegir();
  else if (opState.step === "linea") renderLista(opState.tipo);
  else if (opState.step === "remito") renderLinea();
  else if (opState.step === "articulos") renderRemito();
  else if (opState.step === "resumen") renderArticulos();
};

function opSetBack(show) { opBack.style.display = show ? "" : "none"; }

function opNorm(s) { return (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); }
function displayName(s) {
  return (s || "").replace(/\S+/g, w => /[a-z]/.test(w) ? w : (w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()));
}

const ORDEN_TALL = ["Poly", "Martin", "Lucho", "Rafael", "Carlos", "Garcia", "Pedernera", "German", "BlistPack", "Log/Fabr"];
const OCULTAR_TALL = ["Ester", "Aguirre Carlos Rodolfo"];
const OCULTAR_PROV = ["Rafael"];
const PROV_MANUAL = [
  { nombre: "Kuffo", cod_factura: null, articulos: ["193"] }
];
function claveTall(n) { return opNorm(n).replace(/[\s\-\/.]/g, ""); }

const ALIAS_NOMBRE = [
  { de: "Pettofrezza", a: "Rafael" }
];
function aliasNombre(n) {
  const k = claveTall(n);
  for (const x of ALIAS_NOMBRE) { if (k.includes(claveTall(x.de))) return x.a; }
  return n;
}

const ordenTallMap = {};
ORDEN_TALL.forEach((n, i) => { ordenTallMap[claveTall(n)] = i; });
const ocultarTallSet = new Set(OCULTAR_TALL.map(claveTall));
const ocultarProvSet = new Set(OCULTAR_PROV.map(claveTall));

const MESES_CORTO = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
function fechaCorta(yyyymmdd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(yyyymmdd || "");
  if (!m) return "—";
  return m[3] + "/" + MESES_CORTO[parseInt(m[2], 10) - 1] + "/" + m[1].slice(2);
}

/* ============== Carga de entidades ============== */
async function cargarEntidades() {
  const [tallRes, provRes] = await Promise.all([
    supabase.from("Codigos X Tallerista").select("Codigo,Nombre,Linea").order("Nombre"),
    supabase.from("Tall_ProvAT_PS").select("nombre,cod_factura")
      .eq("prov_at", true).eq("rec_virg", true).eq("activo", true).order("nombre")
  ]);
  if (tallRes.error) { opState.entidades = null; return tallRes.error.message; }

  const porNombre = new Map();
  (tallRes.data || []).forEach(r => {
    const nom = aliasNombre((r.Nombre || r.Codigo || "").trim());
    if (!nom || !r.Codigo) return;
    if (!porNombre.has(nom)) porNombre.set(nom, { tipo: 'tallerista', Nombre: nom, cods: {} });
    const e = porNombre.get(nom).cods;
    const linea = (r.Linea || "").trim().toUpperCase();
    if (linea === "LK") e.LK = r.Codigo;
    else if (linea === "CH") e.CH = r.Codigo;
    else { e.LK = e.LK || r.Codigo; e.CH = e.CH || r.Codigo; }
  });
  const entidades = [...porNombre.values()];

  const vistosProv = new Set();
  if (!provRes.error) {
    (provRes.data || []).forEach(r => {
      const nom = aliasNombre((r.nombre || "").trim());
      if (nom && !vistosProv.has(opNorm(nom))) {
        vistosProv.add(opNorm(nom));
        entidades.push({ tipo: 'prov_at', Nombre: nom, cod: r.cod_factura, cods: { LK: true, CH: true } });
      }
    });
  }

  PROV_MANUAL.forEach(p => {
    if (vistosProv.has(opNorm(p.nombre))) return;
    vistosProv.add(opNorm(p.nombre));
    entidades.push({
      tipo: 'prov_at', Nombre: p.nombre, cod: p.cod_factura || null,
      cods: { LK: true, CH: true },
      articulos: p.articulos.map(a => ({ Cod_Art: String(a), Desc: "" }))
    });
  });

  opState.entidades = entidades;
  return null;
}

function listaPorTipo(tipo, filtro) {
  const f = opNorm(filtro || "").trim();
  let arr = (opState.entidades || []).filter(e => e.tipo === tipo);
  if (tipo === 'tallerista') arr = arr.filter(e => !ocultarTallSet.has(claveTall(e.Nombre)));
  else if (tipo === 'prov_at') arr = arr.filter(e => !ocultarProvSet.has(claveTall(e.Nombre)));
  if (f) arr = arr.filter(e => opNorm(e.Nombre).includes(f));
  arr = arr.slice().sort((a, b) => {
    if (tipo === 'tallerista') {
      const ia = ordenTallMap[claveTall(a.Nombre)] != null ? ordenTallMap[claveTall(a.Nombre)] : 999;
      const ib = ordenTallMap[claveTall(b.Nombre)] != null ? ordenTallMap[claveTall(b.Nombre)] : 999;
      if (ia !== ib) return ia - ib;
    } else if (f) {
      const aw = opNorm(a.Nombre).startsWith(f) ? 0 : 1;
      const bw = opNorm(b.Nombre).startsWith(f) ? 0 : 1;
      if (aw !== bw) return aw - bw;
    }
    return a.Nombre.localeCompare(b.Nombre, 'es');
  });
  return arr;
}

/* ============== Paso 1: elegir tipo ============== */
async function renderTipoElegir() {
  opState.step = "tipo";
  opSetBack(opState.fromMenu === true);   // sólo muestra "Atrás" si se entró por el menú (supervisor)
  opTitle.textContent = "¿Qué vas a cargar?";
  opSubtitle.textContent = "";
  opActions.innerHTML = "";

  if (opState.entidades === null) {
    opBody.innerHTML = '<div class="opEmpty">Cargando…</div>';
    const err = await cargarEntidades();
    if (opState.step !== "tipo") return;
    if (err) { opBody.innerHTML = '<div class="opEmpty" style="color:var(--danger)">Error: ' + err + '</div>'; return; }
  }

  const nTall = listaPorTipo('tallerista').length;
  const nProv = listaPorTipo('prov_at').length;
  opBody.innerHTML = "";
  const cont = document.createElement("div");
  cont.className = "opTipoBtns";
  const bt = document.createElement("button");
  bt.type = "button"; bt.className = "opTipoBtn";
  bt.textContent = "Talleristas (" + nTall + ")";
  bt.onclick = () => renderLista('tallerista');
  const bp = document.createElement("button");
  bp.type = "button"; bp.className = "opTipoBtn";
  bp.textContent = "Prov. Art. Terminado (" + nProv + ")";
  bp.onclick = () => renderLista('prov_at');
  cont.appendChild(bt); cont.appendChild(bp);
  opBody.appendChild(cont);
}

/* ============== Paso 2: lista del tipo ============== */
function renderLista(tipo) {
  opState.step = "lista";
  opState.listaTipo = tipo;
  opSetBack(true);
  opTitle.textContent = tipo === 'tallerista' ? "Talleristas" : "Prov. Art. Terminado";
  opSubtitle.textContent = "";
  opActions.innerHTML = "";

  opBody.innerHTML = "";
  const search = document.createElement("input");
  search.className = "opSearch";
  search.type = "text";
  search.placeholder = "🔍 Buscar por nombre…";
  search.oninput = () => drawLista(search.value);
  opBody.appendChild(search);
  const grid = document.createElement("div");
  grid.id = "opListaGrid";
  grid.className = "opLista";
  opBody.appendChild(grid);
  drawLista("");
}

function drawLista(filter) {
  const grid = document.getElementById("opListaGrid");
  if (!grid) return;
  grid.innerHTML = "";
  const lista = listaPorTipo(opState.listaTipo, filter);
  if (lista.length === 0) { grid.innerHTML = '<div class="opEmpty">Nada coincide.</div>'; return; }
  lista.forEach(e => grid.appendChild(opEntBtn(e)));
}

function seleccionarEntidad(e) {
  opState.tipo = e.tipo;
  opState.tallNombre = e.Nombre;
  opState.tallCods = e.cods;
  opState.tallCod = e.tipo === 'prov_at' ? (e.cod || null) : null;
  opState.articulosManual = e.articulos || null;
  opState.linea = null;
  opState.articulos = null;
  opState.cargas = {};
  renderLinea();
}

function opEntBtn(e) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "opNameBtn";
  b.textContent = displayName(e.Nombre);
  b.onclick = () => seleccionarEntidad(e);
  return b;
}

/* ============== Paso 2: fecha + línea ============== */
function renderLinea() {
  opState.step = "linea";
  opSetBack(true);
  opTitle.textContent = displayName(opState.tallNombre);
  opSubtitle.textContent = "Fecha y línea";
  opActions.innerHTML = "";

  opBody.innerHTML = "";
  const fField = document.createElement("div");
  fField.className = "opField";
  fField.innerHTML = '<label>Fecha</label>';
  const fBox = document.createElement("div");
  fBox.className = "opFechaBox";
  const fTxt = document.createElement("span");
  fTxt.className = "opFechaTxt";
  fTxt.textContent = fechaCorta(opState.fecha);
  const fInput = document.createElement("input");
  fInput.type = "date";
  fInput.className = "opFechaHidden";
  fInput.value = opState.fecha;
  fInput.oninput = () => { opState.fecha = fInput.value; fTxt.textContent = fechaCorta(fInput.value); };
  fBox.appendChild(fTxt);
  fBox.appendChild(fInput);
  fField.appendChild(fBox);
  opBody.appendChild(fField);

  const lbl = document.createElement("div");
  lbl.className = "opField";
  lbl.innerHTML = '<label>Línea</label>';
  opBody.appendChild(lbl);

  const cods = opState.tallCods || {};
  const row = document.createElement("div");
  row.className = "opLineRow";
  [["LK", "Loeke"], ["CH", "Chef"]].forEach(([lineCode, nom]) => {
    const tieneCod = !!cods[lineCode];
    const b = document.createElement("button");
    b.type = "button";
    b.className = "opLineBtn" + (opState.linea === lineCode ? " active" : "");
    b.innerHTML = lineCode + '<br><span style="font-size:13px;font-weight:700">' + nom + '</span>';
    b.disabled = !tieneCod;
    if (!tieneCod) { b.style.opacity = ".35"; b.style.cursor = "not-allowed"; b.title = "Este tallerista no trabaja para " + nom; }
    b.onclick = () => {
      if (!tieneCod) return;
      if (opState.linea !== lineCode) { opState.articulos = null; opState.cargas = {}; }
      opState.linea = lineCode;
      if (opState.tipo === 'tallerista') opState.tallCod = cods[lineCode];
      renderRemito();
    };
    row.appendChild(b);
  });
  opBody.appendChild(row);
}

/* ============== Paso 3: N° RTO/FC ============== */
function renderRemito() {
  opState.step = "remito";
  opSetBack(true);
  opTitle.textContent = displayName(opState.tallNombre);
  opSubtitle.textContent = opState.linea + " · " + fechaCorta(opState.fecha);

  opBody.innerHTML = "";

  const actRow = document.createElement("div");
  actRow.style.display = "flex";
  actRow.style.justifyContent = "flex-end";
  actRow.style.marginBottom = "16px";
  const cont = document.createElement("button");
  cont.className = "btnSend btnBig";
  cont.textContent = "Continuar";
  cont.disabled = opState.remito.length === 0;
  cont.onclick = () => { if (opState.remito.length > 0) renderArticulos(); };
  actRow.appendChild(cont);
  opBody.appendChild(actRow);

  const field = document.createElement("div");
  field.className = "opField";
  field.innerHTML = '<label for="opRto">N° RTO/FC</label>';
  const inp = document.createElement("input");
  inp.id = "opRto";
  inp.className = "opRtoInput";
  inp.type = "text";
  inp.inputMode = "numeric";
  inp.maxLength = 5;
  inp.value = opState.remito;
  inp.oninput = () => {
    inp.value = inp.value.replace(/\D/g, "").slice(0, 5);
    opState.remito = inp.value;
    cont.disabled = opState.remito.length === 0;
    cont.classList.toggle("enabled", opState.remito.length > 0);
  };
  field.appendChild(inp);
  opBody.appendChild(field);

  opActions.innerHTML = "";
}

/* ============== Paso 4: grilla de códigos ============== */
async function renderArticulos() {
  opState.step = "articulos";
  opSetBack(true);
  opTitle.textContent = displayName(opState.tallNombre);
  opSubtitle.textContent = opState.linea + " · " + fechaCorta(opState.fecha) + " · RTO/FC " + opState.remito;
  opActions.innerHTML = "";

  if (opState.articulos === null) {
    opBody.innerHTML = '<div class="opEmpty">Cargando códigos…</div>';
    let lista = [], error = null;

    if (opState.articulosManual) {
      lista = opState.articulosManual.map(a => ({ Cod_Art: a.Cod_Art, Desc: a.Desc || "" }));
    } else if (opState.tipo === 'prov_at') {
      const res = await supabase
        .from("Articulos x Prov AT")
        .select("Cod_Art,Descripcion")
        .eq("Proveedor", opState.tallNombre)
        .eq("Activo", true)
        .order("Cod_Art");
      error = res.error;
      if (res.data) {
        const todos = res.data.map(r => ({ Cod_Art: r.Cod_Art, Desc: r.Descripcion }));
        const cods = todos.map(r => r.Cod_Art).filter(c => c);
        const lineaPorCod = {};
        if (cods.length > 0) {
          const lr = await supabase
            .from("Articulos Virgilio X Tallerista")
            .select("Cod_Art,Linea")
            .in("Cod_Art", cods);
          if (!lr.error && lr.data) {
            lr.data.forEach(r => { if (r.Cod_Art && !(r.Cod_Art in lineaPorCod)) lineaPorCod[r.Cod_Art] = r.Linea; });
          }
        }
        lista = todos.filter(r => lineaPorCod[r.Cod_Art] === opState.linea);
      }
    } else {
      const res = await supabase
        .from("Articulos Virgilio X Tallerista")
        .select("Cod_Art")
        .eq("Cod_Tallerista", opState.tallCod)
        .eq("Linea", opState.linea)
        .order("Cod_Art");
      error = res.error;
      if (res.data) lista = res.data.map(r => ({ Cod_Art: r.Cod_Art, Desc: "" }));
    }

    if (opState.step !== "articulos") return;
    if (error) { opBody.innerHTML = '<div class="opEmpty" style="color:var(--danger)">Error: ' + error.message + '</div>'; return; }
    const vistos = new Set();
    opState.articulos = [];
    // En Log/Fabr no aplicamos el filtro "empieza con número" (ahí van los
    // códigos agregados a mano con "+", que ya viven en la misma tabla).
    const permitirNoNum = arEsLogFabr();
    lista.forEach(r => {
      const codArt = String(r.Cod_Art || "").trim();
      if (codArt && (permitirNoNum || /^[0-9]/.test(codArt)) && !vistos.has(r.Cod_Art)) {
        vistos.add(r.Cod_Art);
        opState.articulos.push({ Cod_Art: r.Cod_Art, Desc: r.Desc || "" });
      }
    });
  }

  drawArticulosGrid();
}

function drawArticulosGrid() {
  opBody.innerHTML = "";
  const hayArts = opState.articulos && opState.articulos.length > 0;
  // Sin códigos: aviso normal, salvo en Log/Fabr (ahí igual mostramos el "+").
  if (!hayArts && !arEsLogFabr()) {
    opBody.innerHTML = '<div class="opEmpty">No hay códigos para la línea ' + opState.linea + '.</div>';
    opActions.innerHTML = "";
    return;
  }
  const grid = document.createElement("div");
  grid.className = "opGrid codes";
  // Orden numérico por código (el agregado a mano queda en su lugar, no al final).
  const numKey = c => { const m = String(c).match(/^(\d+)/); return m ? parseInt(m[1], 10) : Number.MAX_SAFE_INTEGER; };
  const artsOrden = (opState.articulos || []).slice().sort((a, b) =>
    (numKey(a.Cod_Art) - numKey(b.Cod_Art))
    || (String(a.Cod_Art) < String(b.Cod_Art) ? -1 : String(a.Cod_Art) > String(b.Cod_Art) ? 1 : 0)
  );
  artsOrden.forEach(a => {
    const cajas = opState.cargas[a.Cod_Art];
    const b = document.createElement("button");
    b.type = "button";
    b.className = "opCodeBtn" + (cajas > 0 ? " loaded" : "");
    b.innerHTML = '<span>' + a.Cod_Art + '</span>' + (cajas > 0 ? '<span class="cnt">' + cajas + ' caja' + (cajas === 1 ? '' : 's') + '</span>' : '');
    b.onclick = () => openCajas(a.Cod_Art);
    grid.appendChild(b);
  });
  // Log/Fabr: botón "+" para agregar un artículo nuevo (queda fijo).
  if (arEsLogFabr()) {
    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "opCodeBtn opCodeAdd";
    addBtn.innerHTML = '<span class="opCodeAddPlus">+</span>';
    addBtn.title = "Agregar artículo a Log/Fabr";
    addBtn.onclick = arAddCode;
    grid.appendChild(addBtn);
  }
  opBody.appendChild(grid);

  const total = Object.values(opState.cargas).filter(n => n > 0).length;
  opActions.innerHTML = "";
  const enviarBtn = document.createElement("button");
  enviarBtn.className = "btnSend btnBig";
  enviarBtn.textContent = "Enviar" + (total > 0 ? " (" + total + ")" : "");
  enviarBtn.disabled = total === 0;
  enviarBtn.onclick = renderResumen;
  opActions.appendChild(enviarBtn);
}

/* ============== Agregar artículo a Log/Fabr (botón "+") ==============
   Solo para el tallerista Log/Fabr. El código nuevo se inserta en la MISMA tabla
   que lee la grilla ("Articulos Virgilio X Tallerista"), para las dos líneas de
   Log/Fabr → queda fijo y compartido entre dispositivos, SIN tablas extra. */
function arEsLogFabr() {
  return opState.tipo === 'tallerista' && claveTall(opState.tallNombre || "") === claveTall("Log/Fabr");
}
/* Guarda el código en "Articulos Virgilio X Tallerista" (best-effort).
   MAESTRO: busca una fila existente del MISMO código (cualquier tallerista) y
   COPIA todas sus columnas (Desc, UxB y cualquier otro dato del artículo);
   solo cambia Cod_Tallerista + Línea. Así el alta queda con la descripción y
   demás datos que el sistema usa después, sin dejar nada vacío. Inserta una fila
   por cada línea de Log/Fabr (LK y CH) → aparece en ambas y en cualquier device.
   Si el código no existe en ningún lado, cae a un alta mínima (Desc: ""). */
async function arSaveCodeRemote(cod) {
  let base = null;
  try {
    const res = await supabase.from("Articulos Virgilio X Tallerista")
      .select("*").eq("Cod_Art", cod).limit(1);
    if (!res.error && res.data && res.data.length) base = res.data[0];
  } catch (e) { /* sin red: alta mínima */ }

  const cods = opState.tallCods || {};
  const dest = [];
  if (cods.LK) dest.push({ codTall: cods.LK, linea: "LK" });
  if (cods.CH) dest.push({ codTall: cods.CH, linea: "CH" });
  if (!dest.length && opState.tallCod) dest.push({ codTall: opState.tallCod, linea: opState.linea });
  if (!dest.length) return;

  const rows = dest.map(function (d) {
    const row = base ? Object.assign({}, base) : { Cod_Art: cod, Desc: "" };
    delete row.id; delete row.created_at; delete row.updated_at;   // PK/auto: que las genere la DB
    row.Cod_Art = cod;
    row.Cod_Tallerista = d.codTall;
    row.Linea = d.linea;
    return row;
  });
  try {
    const ins = await supabase.from("Articulos Virgilio X Tallerista").insert(rows);
    if (ins && ins.error) {
      console.warn("alta artículo Log/Fabr:", ins.error.message);
      alert("El código quedó para esta carga, pero NO se pudo guardar fijo en la base:\n" +
            ins.error.message + "\n\nAvisá al admin.");
    }
  } catch (e) { /* no-op */ }
}
function arAddCode() {
  let cod = prompt("Código del artículo nuevo para Log/Fabr:");
  if (cod == null) return;                       // canceló
  cod = String(cod).trim().toUpperCase();
  if (!cod) return;
  if (!opState.articulos) opState.articulos = [];
  const existe = opState.articulos.some(a => String(a.Cod_Art).toUpperCase() === cod);
  if (!existe) {
    opState.articulos.push({ Cod_Art: cod, Desc: "" });   // mostrar al instante
    arSaveCodeRemote(cod);                                  // guardar fijo (compartido)
  }
  drawArticulosGrid();
  openCajas(cod);                                // que le cargue las cajas ya mismo
}

/* ============== Paso 5: resumen ============== */
function renderResumen() {
  const items = Object.entries(opState.cargas)
    .filter(([, n]) => n > 0)
    .map(([cod, n]) => ({ cod, cajas: n }));
  if (items.length === 0) { alert("Cargá al menos un código con cajas."); return; }

  opState.step = "resumen";
  opSetBack(true);
  opTitle.textContent = "Confirmá el envío";
  opSubtitle.textContent = opState.linea + " · " + fechaCorta(opState.fecha) + " · RTO/FC " + opState.remito;

  opBody.innerHTML = "";
  const h = document.createElement("div");
  h.className = "resHeader";
  h.textContent = displayName(opState.tallNombre);
  opBody.appendChild(h);

  const list = document.createElement("div");
  list.className = "resList";
  items.forEach(i => {
    const r = document.createElement("div");
    r.className = "resItem";
    const c = document.createElement("span"); c.className = "resCod"; c.textContent = i.cod;
    const q = document.createElement("span"); q.className = "resCajas"; q.textContent = i.cajas + " caja" + (i.cajas === 1 ? "" : "s");
    r.appendChild(c); r.appendChild(q);
    list.appendChild(r);
  });
  opBody.appendChild(list);

  const tot = document.createElement("div");
  tot.className = "resTotal";
  const totalCajas = items.reduce((s, i) => s + i.cajas, 0);
  tot.textContent = "Total: " + items.length + " código(s) · " + totalCajas + " cajas";
  opBody.appendChild(tot);

  opActions.innerHTML = "";
  const volver = document.createElement("button");
  volver.className = "btnCancel btnBig";
  volver.textContent = "‹ Volver";
  volver.onclick = () => renderArticulos();
  const conf = document.createElement("button");
  conf.className = "btnSend btnBig";
  conf.id = "opConfirmar";
  conf.textContent = "✓ Confirmar y enviar";
  conf.onclick = opEnviar;
  opActions.appendChild(volver);
  opActions.appendChild(conf);
}

/* ============== Popup de cajas ============== */
function openCajas(cod) {
  opState.cajasCod = cod;
  opCajasCod.textContent = cod;
  const actual = opState.cargas[cod];
  opCajasInput.value = actual > 0 ? String(actual) : "";
  opCajasDelete.style.display = actual > 0 ? "" : "none";
  opCajasModal.classList.add("open");
  setTimeout(() => opCajasInput.focus(), 50);
}
function closeCajas() { opCajasModal.classList.remove("open"); opState.cajasCod = null; }
opCajasInput.oninput = () => { opCajasInput.value = opCajasInput.value.replace(/\D/g, ""); };
opCajasInput.addEventListener("keydown", e => {
  if (e.key === "Enter") { e.preventDefault(); opCajasNext.click(); }
});
opCajasClose.onclick = closeCajas;
// Antes: tocar el fondo oscuro cerraba el pop-up. Lo sacamos para que NO se cierre
// solo si el empleado tarda en cargar / toca fuera sin querer — solo se cierra con
// la ✕ o al cargar el número. (Pedido: "que se mantenga".)
opCajasNext.onclick = () => {
  const n = parseInt(opCajasInput.value, 10) || 0;
  if (n > 0) opState.cargas[opState.cajasCod] = n;
  else delete opState.cargas[opState.cajasCod];
  closeCajas();
  drawArticulosGrid();
};
opCajasDelete.onclick = () => {
  delete opState.cargas[opState.cajasCod];
  closeCajas();
  drawArticulosGrid();
};

/* ============== Enviar (graba todo) ============== */
async function opEnviar() {
  const descPorCod = {};
  (opState.articulos || []).forEach(a => { descPorCod[a.Cod_Art] = a.Desc || ""; });
  const items = Object.entries(opState.cargas)
    .filter(([, n]) => n > 0)
    .map(([cod, n]) => ({ cod, cajas: n, desc: descPorCod[cod] || "" }));
  if (items.length === 0) { alert("Cargá al menos un código con cajas."); return; }
  const totalCajas = items.reduce((s, i) => s + i.cajas, 0);

  const btn = document.getElementById("opConfirmar");
  btn.disabled = true;
  const prev = btn.textContent;
  btn.textContent = "Enviando…";

  const session = await sessionReady;
  if (!session) {
    btn.disabled = false; btn.textContent = prev;
    alert("No se pudo iniciar sesión anónima. Avisá al admin y refrescá la página.");
    return;
  }

  let tabla, rows;
  if (opState.tipo === 'prov_at') {
    tabla = "Entregas Prov AT";
    const partes = (opState.fecha || "").split("-");
    const diaMes = (partes.length === 3) ? (partes[2] + "-" + partes[1]) : "";
    rows = items.map(i => ({
      Dia_mes: diaMes,
      Proveedor: opState.tallNombre,
      Cod_Art: i.cod,
      Descripcion: i.desc,
      Cantidad: i.cajas,
      Remito: opState.remito
    }));
  } else {
    tabla = "Entregas Tallerista Virgilio";
    rows = items.map(i => ({
      Fecha: opState.fecha,
      Codigo_Tall: opState.tallCod,
      Nombre_Tall: opState.tallNombre,
      Cod: i.cod,
      Cajas: i.cajas,
      Remito: opState.remito
    }));
  }
  const { error } = await supabase.from(tabla).insert(rows);

  if (error) {
    btn.disabled = false; btn.textContent = prev;
    const msg = error.message || "";
    if (/remito/i.test(msg)) {
      alert('Falta crear la columna "Remito" en la tabla "' + tabla + '".\n\n' +
        'Pedile al admin que ejecute en el SQL Editor de Supabase:\n\n' +
        'ALTER TABLE "' + tabla + '" ADD COLUMN "Remito" text;');
    } else {
      alert("Error al guardar: " + msg);
    }
    return;
  }

  // Suma al acumulador del día para que Producción cierre RT con esta cantidad.
  recpAddCajas(totalCajas);

  // v4.06: STOCK — lo recibido ENTRA a "Mercadería a guardar" (Movimientos_Stock).
  // Best-effort; si falla, queda en vir_stock_pend y lo reintenta index.html (stockFlushPend).
  try {
    const stockRows = items.map(i => ({
      cod_art: String(i.cod), descripcion: i.desc || null,
      deposito: 'a_guardar', delta: i.cajas, tipo: 'recepcion', ref: opState.remito || null
    }));
    const { error: stErr } = await supabase.from("Movimientos_Stock").insert(stockRows);
    if (stErr) throw stErr;
  } catch (e) {
    console.warn("Movimientos_Stock recepcion (queda pendiente):", e);
    try {
      const p = JSON.parse(localStorage.getItem("vir_stock_pend") || "[]");
      items.forEach(i => p.push({ cod_art: String(i.cod), descripcion: i.desc || null, deposito: 'a_guardar', delta: i.cajas, tipo: 'recepcion', ref: opState.remito || null }));
      localStorage.setItem("vir_stock_pend", JSON.stringify(p.slice(-5000)));
    } catch (_e) {}
  }

  // v4.61 — AVISO recepción sin planimetría: si llegan códigos que NO tienen lugar en
  // la góndola (window.GONDOLA, planimetría), se emite un evento RSP → trigger Telegram
  // + categoría "sin_planimetria" en el tablero Agentes. Best-effort, no bloquea.
  try {
    const G = (typeof window !== "undefined" && window.GONDOLA) ? window.GONDOLA : null;
    if (G) {
      const norm = c => String(c == null ? "" : c).toUpperCase().trim().replace(/^0+(?=.)/, "");
      const seen = {}, sinLugar = [];
      items.forEach(i => { const k = norm(i.cod); if (k && !G[k] && !seen[k]) { seen[k] = 1; sinLugar.push(String(i.cod)); } });
      if (sinLugar.length) {
        const cid = "rsp_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
        supabase.from("Registros_Produccion_Virgilio").insert({
          client_id: cid, legajo: String(RECP.legajo || ""), opcion: "RSP",
          descripcion: "Recepción sin planimetría",
          texto: (opState.remito || "s/remito") + "|" + sinLugar.join(","),
          ts_cliente: new Date().toISOString()
        }).then(() => {}, () => {});
      }
    }
  } catch (_e) {}

  // Registro para el checklist de Marianela (un renglón por envío). No bloquea.
  let pendId = null;
  try {
    const detalle = items.map(i => i.cod + " → " + i.cajas).join(" · ");
    const { data: regData, error: errReg } = await supabase.from("Control_Modo_OP").insert({
      fecha: opState.fecha,
      tipo: opState.tipo,
      nombre: opState.tallNombre,
      codigo_tall: opState.tallCod || null,
      linea: opState.linea,
      remito: opState.remito,
      detalle: detalle,
      cantidad_total: totalCajas,
      estado: 'pendiente'
    }).select("id").single();
    if (errReg) console.warn("Control_Modo_OP insert error (¿falta crear la tabla?):", errReg);
    else { pendId = regData ? regData.id : null; }
  } catch (e) { console.warn("Control_Modo_OP excepcion:", e); }

  opSetBack(false);
  opTitle.textContent = "Listo";
  opSubtitle.textContent = "";
  opBody.innerHTML = "";
  const ok = document.createElement("div");
  ok.className = "opOk";
  ok.textContent = "✓ Enviado. " + rows.length + " código(s) guardado(s) para " + displayName(opState.tallNombre) +
    " (" + opState.linea + ") · RTO/FC " + opState.remito + ".";
  opBody.appendChild(ok);

  opActions.innerHTML = "";
  const cerrar = document.createElement("button");
  cerrar.className = "btnCancel";
  cerrar.textContent = "Cerrar";
  cerrar.onclick = closeOp;
  if (pendId != null) {
    const anular = document.createElement("button");
    anular.className = "btnAnular";
    anular.textContent = "✕ Anular este envío";
    anular.onclick = async () => {
      const okAnu = await anularModoOP(pendId);
      if (okAnu) {
        recpAddCajas(-totalCajas);   // revertir el acumulador del día
        opBody.innerHTML = '<div class="opOk" style="color:var(--danger)">✕ Envío anulado. Cargalo de nuevo cuando quieras.</div>';
        opActions.innerHTML = "";
        const c = document.createElement("button"); c.className = "btnSend"; c.textContent = "Cargar de nuevo"; c.onclick = openOp;
        const cc = document.createElement("button"); cc.className = "btnCancel"; cc.textContent = "Cerrar"; cc.onclick = closeOp;
        opActions.appendChild(cc); opActions.appendChild(c);
      }
    };
    opActions.appendChild(anular);
  }
  const otra = document.createElement("button");
  otra.className = "btnSend";
  otra.textContent = "Cargar otra entrega";
  otra.onclick = openOp;
  opActions.appendChild(cerrar);
  opActions.appendChild(otra);
}

async function anularModoOP(pendId) {
  if (pendId == null) { alert("No se puede anular (no se guardó el registro)."); return false; }
  if (!confirm("¿ANULAR esta carga?\n\nSe borra de la base y vas a tener que cargarla de nuevo.")) return false;
  const { data, error } = await supabase.rpc("anular_modo_op", { p_id: pendId });
  if (error) {
    alert("No se pudo anular: " + error.message + "\n\n(Puede que falte crear la función 'anular_modo_op' en Supabase.)");
    return false;
  }
  if (data === 'ok') return true;
  if (data === 'vencido') { alert("Esta carga tiene más de 48 h: no se puede anular desde la app. Pedíselo al admin."); return false; }
  if (data === 'ya_anulado') { alert("Esta carga ya estaba anulada."); return false; }
  alert("No se encontró la carga."); return false;
}

/* ============== Menú (supervisor) + Pendientes ==============
   El supervisor entra por "Carga Recepción Mercadería" → menú LOCAL con dos
   opciones: Carga Manual (el mismo flujo del operario) y Pendientes (checklist
   de las recepciones cargadas, leídas de Control_Modo_OP). Todo embebido, sin
   iframe. "Listo" marca la recepción como revisada (estado='listo'). */
function renderMenu() {
  opState.step = "menu";
  opState.fromMenu = true;
  opPage.classList.remove("pendWide");
  opSetBack(false);
  opTitle.textContent = "Recepción de Mercadería";
  opSubtitle.textContent = "";
  opActions.innerHTML = "";
  opBody.innerHTML = "";
  const cont = document.createElement("div");
  cont.className = "opTipoBtns";
  const bc = document.createElement("button");
  bc.type = "button"; bc.className = "opTipoBtn";
  bc.textContent = "✍️ Carga Manual";
  bc.onclick = () => { opResetState(); renderTipoElegir(); };   // fromMenu sigue true → "Atrás" vuelve al menú
  const bp = document.createElement("button");
  bp.type = "button"; bp.className = "opTipoBtn";
  bp.textContent = "📋 Pendientes";
  bp.onclick = () => renderPendientes();
  const br = document.createElement("button");
  br.type = "button"; br.className = "opTipoBtn";
  br.textContent = "📦 Bajadas Racks → góndola";
  br.onclick = () => renderBajadasRacks();
  cont.appendChild(bc); cont.appendChild(bp); cont.appendChild(br);
  opBody.appendChild(cont);
  // Si hay bajadas de racks esperando aprobación, lo marco en el botón.
  racksBadgePend(br);
}
/* ===== RACKS → góndola (v4.08): Marianela aprueba acá lo que los operarios
   marcaron para bajar. Al aprobar se hace el movimiento entre depósitos
   (racks − / terminado +) en Movimientos_Stock y la bajada queda 'aprobada'
   (si era la última de la orden, la orden pasa a 'bajado' y se apaga la alarma). */
async function racksBadgePend(btn) {
  try {
    await sessionReady;
    const r = await supabase.from("Racks_Bajadas").select("id", { count: "exact", head: true }).eq("estado", "propuesta");
    const n = r.count || 0;
    if (n > 0 && btn) btn.textContent = "📦 Bajadas Racks → góndola (" + n + ")";
  } catch (_e) {}
}
async function renderBajadasRacks() {
  opState.step = "racks";
  opPage.classList.add("pendWide");
  opSetBack(true);
  opTitle.textContent = "Bajadas Racks → góndola";
  opSubtitle.textContent = "Lo que los operarios marcaron para bajar. Revisá y aprobá: recién ahí pasa de racks a góndola.";
  opActions.innerHTML = "";
  opBody.innerHTML = '<div class="opEmpty">Cargando…</div>';
  await sessionReady;
  let res, fres;
  try {
    res = await supabase.from("Racks_Bajadas").select("id,orden_id,cod_art,descripcion,cajas,estado,creada_por,ts").eq("estado", "propuesta").order("ts", { ascending: true }).limit(500);
    fres = await supabase.from("Articulos Virgilio X Tallerista").select("Cod_Art,Cajas_x_Master,Uni_x_Caja").limit(20000);
  } catch (e) { res = { error: e }; }
  if (opState.step !== "racks") return;
  if (res.error) { opBody.innerHTML = '<div class="opEmpty" style="color:var(--danger)">No se pudo leer Racks_Bajadas.<br><small>' + (res.error.message || "") + '</small></div>'; return; }
  const rows = res.data || [];
  _racksFactors = {};
  ((fres && fres.data) || []).forEach(function (x) { const k = String(x.Cod_Art || "").toUpperCase(); if (k && !_racksFactors[k]) _racksFactors[k] = { cajasXMaster: Number(x.Cajas_x_Master) || 0, uniXCaja: Number(x.Uni_x_Caja) || 0 }; });
  if (!rows.length) { opBody.innerHTML = '<div class="opOk">✓ No hay bajadas pendientes de aprobar.</div>'; return; }
  opBody.innerHTML = "";
  const list = document.createElement("div"); list.className = "pendCards";
  rows.forEach(function (b) { list.appendChild(racksBajaCard(b)); });
  opBody.appendChild(list);
}
let _racksFactors = {};
function racksFmtUnits(cajas, cod) {
  const f = _racksFactors[String(cod).toUpperCase()] || {}, M = f.cajasXMaster > 0 ? f.cajasXMaster : 0, U = f.uniXCaja > 0 ? f.uniXCaja : 0, p = [];
  if (M) p.push((Math.round((cajas / M) * 100) / 100) + " master");
  if (U) p.push((cajas * U) + " u");
  return p.length ? p.join(" · ") : "";
}
function racksBajaCard(b) {
  const card = document.createElement("div"); card.className = "pendCard"; card.setAttribute("data-id", String(b.id));
  const head = document.createElement("div"); head.className = "pcHead";
  const name = document.createElement("span"); name.className = "pcName"; name.textContent = b.cod_art || "—";
  const tag = document.createElement("span"); tag.className = "pcTag"; tag.textContent = b.creada_por ? ("Leg " + b.creada_por) : "operario";
  head.appendChild(name); head.appendChild(tag);
  card.appendChild(head);
  const ent = document.createElement("div"); ent.className = "pcEntrega";
  const u = racksFmtUnits(Number(b.cajas), b.cod_art);
  ent.textContent = (b.descripcion || "") + "   ·   " + b.cajas + " cajas" + (u ? "  (" + u + ")" : "");
  card.appendChild(ent);
  const foot = document.createElement("div"); foot.className = "pcFoot";
  const ok = document.createElement("button"); ok.type = "button"; ok.className = "enviarBtn"; ok.textContent = "✓ Aprobar";
  ok.onclick = function () { racksAprobarBaja(b, foot); };
  foot.appendChild(ok);
  card.appendChild(foot);
  return card;
}
async function racksAprobarBaja(b, foot) {
  const btn = foot.querySelector("button");
  if (btn) { btn.disabled = true; btn.textContent = "Aprobando…"; }
  try {
    await sessionReady;
    const ref = "orden " + (b.orden_id || "");
    const mov = await supabase.from("Movimientos_Stock").insert([
      { cod_art: b.cod_art, descripcion: b.descripcion || null, deposito: "racks", delta: -Number(b.cajas), tipo: "baja_racks", ref: ref, legajo: "0" },
      { cod_art: b.cod_art, descripcion: b.descripcion || null, deposito: "terminado", delta: Number(b.cajas), tipo: "baja_racks", ref: ref, legajo: "0" }
    ]);
    if (mov.error) throw mov.error;
    const upd = await supabase.from("Racks_Bajadas").update({ estado: "aprobada", aprobada_at: new Date().toISOString() }).eq("id", b.id);
    if (upd.error) throw upd.error;
    // ¿Era la última propuesta de la orden? Entonces cerramos la orden (apaga la alarma).
    if (b.orden_id) {
      const rest = await supabase.from("Racks_Bajadas").select("id", { count: "exact", head: true }).eq("orden_id", b.orden_id).eq("estado", "propuesta");
      if ((rest.count || 0) === 0) {
        await supabase.from("Racks_Ordenes").update({ estado: "bajado", cerrada_at: new Date().toISOString() }).eq("id", b.orden_id);
      }
    }
    const card = foot.closest(".pendCard");
    if (card) { card.classList.add("sentRow"); foot.innerHTML = '<span class="pcLbl" style="color:var(--ok);font-weight:900">✓ Aprobado — pasó a góndola</span>'; }
  } catch (e) {
    if (btn) { btn.disabled = false; btn.textContent = "✓ Aprobar"; }
    alert("No se pudo aprobar: " + (e.message || e));
  }
}
let _pendRows = {};   // id -> estado vivo (espejo de lo persistido en Supabase). NADA en localStorage.
async function renderPendientes() {
  opState.step = "pend";
  opPage.classList.add("pendWide");   // PC: ancho completo → grilla de tarjetas (menos scroll)
  opSetBack(true);
  opTitle.textContent = "Pendientes";
  opSubtitle.textContent = "Recepciones cargadas. Tildá, adjuntá la foto y tocá Enviar.";
  opActions.innerHTML = "";
  opBody.innerHTML = '<div class="opEmpty">Cargando…</div>';
  await sessionReady;
  let res;
  try {
    res = await supabase.from("Control_Modo_OP")
      .select("id,fecha,tipo,nombre,linea,remito,detalle,cantidad_total,created_at,isis,control_partes,faltantes,foto_url,codigo")
      .eq("estado", "pendiente")
      .order("created_at", { ascending: true })
      .limit(300);
  } catch (e) { res = { error: e }; }
  if (opState.step !== "pend") return;
  if (res.error) {
    opBody.innerHTML = '<div class="opEmpty" style="color:var(--danger)">No se pudo leer Pendientes (¿permisos de Control_Modo_OP?).<br><small>' + (res.error.message || "") + '</small></div>';
    return;
  }
  const rows = res.data || [];
  if (!rows.length) { opBody.innerHTML = '<div class="opOk">✓ No hay recepciones pendientes.</div>'; return; }
  _pendRows = {};
  opBody.innerHTML = "";
  const list = document.createElement("div"); list.className = "pendCards";
  rows.forEach(function (r) { list.appendChild(pendCard(r)); });
  opBody.appendChild(list);
  if (_pendTimer) clearInterval(_pendTimer);
  _pendTimer = setInterval(pendTickElapsed, 30000);   // refresca "Demora" en vivo
}
function pendFmtFecha(fecha, tsMs) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(fecha || ""));
  if (m) return m[3] + "-" + m[2];
  if (tsMs) { const d = new Date(tsMs); return String(d.getDate()).padStart(2, "0") + "-" + String(d.getMonth() + 1).padStart(2, "0"); }
  return "";
}
function pendFmtHora(tsMs) {
  if (!tsMs) return "";
  try { return new Date(tsMs).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Argentina/Buenos_Aires" }); }
  catch (_e) { const d = new Date(tsMs); return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); }
}
function pendFmtDemora(tsMs) {
  let hh = Math.round((Date.now() - tsMs) / 1800000);   // medias horas
  if (hh < 0) hh = 0;
  const h = hh / 2;
  return (Number.isInteger(h) ? String(h) : (Math.floor(h) + ",5")) + "hs";
}
function pendTickElapsed() {
  if (opState.step !== "pend") { if (_pendTimer) { clearInterval(_pendTimer); _pendTimer = null; } return; }
  document.querySelectorAll("#rcpRoot .pendDemora").forEach(function (el) {
    const ts = parseInt(el.getAttribute("data-ts"), 10);
    if (ts) el.textContent = "⏱ " + pendFmtDemora(ts);
  });
}
function pendCard(r) {
  const id = r.id;
  _pendRows[id] = { isis: !!r.isis, partes: r.control_partes || null, faltantes: !!r.faltantes, foto_url: r.foto_url || null, sent: false };
  const tsMs = r.created_at ? new Date(r.created_at).getTime() : 0;
  const card = document.createElement("div"); card.className = "pendCard"; card.setAttribute("data-id", String(id));
  const head = document.createElement("div"); head.className = "pcHead";
  const name = document.createElement("span"); name.className = "pcName"; name.textContent = r.nombre || "—";
  const tag = document.createElement("span"); tag.className = "pcTag"; tag.textContent = (r.tipo === "prov_at") ? "Prov. AT" : "Tallerista";
  const rto = document.createElement("span"); rto.className = "pcRto"; rto.textContent = r.remito ? ("RTO/FC " + r.remito) : "";
  head.appendChild(name); head.appendChild(tag); head.appendChild(rto);
  card.appendChild(head);
  const meta = document.createElement("div"); meta.className = "pcMeta";
  const mp = [pendFmtFecha(r.fecha, tsMs)]; if (tsMs) mp.push(pendFmtHora(tsMs)); if (r.linea) mp.push(r.linea);
  meta.textContent = mp.filter(Boolean).join(" · ");
  if (tsMs) {
    const dem = document.createElement("span"); dem.className = "pcDemora pendDemora"; dem.setAttribute("data-ts", String(tsMs));
    dem.textContent = "⏱ " + pendFmtDemora(tsMs);
    meta.appendChild(document.createTextNode(" · ")); meta.appendChild(dem);
  }
  card.appendChild(meta);
  const ent = document.createElement("div"); ent.className = "pcEntrega";
  ent.textContent = (r.detalle || "") + (r.cantidad_total != null ? "   ·   " + r.cantidad_total + " cajas" : "");
  card.appendChild(ent);
  const acts = document.createElement("div"); acts.className = "pcActs";
  acts.appendChild(pendCheckRow(id, "isis", "Carga ISIS"));
  acts.appendChild(pendPartesRow(id));
  acts.appendChild(pendCheckRow(id, "faltantes", "Faltantes x Día"));
  acts.appendChild(pendFotoRow(id));
  card.appendChild(acts);
  const foot = document.createElement("div"); foot.className = "pcFoot";
  if (r.codigo) {
    const lab = document.createElement("span"); lab.className = "pcLbl"; lab.textContent = "Código:";
    const c = document.createElement("div"); c.className = "codigoBox"; c.textContent = r.codigo;
    foot.appendChild(lab); foot.appendChild(c); card.classList.add("sentRow");
  } else {
    const b = document.createElement("button"); b.type = "button"; b.className = "enviarBtn"; b.textContent = "Enviar"; b.disabled = !pendRowComplete(id);
    b.onclick = function () { pendEnviar(id, foot); };
    foot.appendChild(b);
  }
  card.appendChild(foot);
  return card;
}
/* Cada cambio se PERSISTE en Supabase al toque (UPDATE de la fila; no duplica, nada
   en localStorage). Al recargar, la tarjeta vuelve con lo ya guardado. */
async function pendPersist(id, patch) {
  await sessionReady;
  const r = await supabase.from("Control_Modo_OP").update(patch).eq("id", id);
  if (r.error) throw r.error;
}
function pendCheckRow(id, field, label) {
  const row = document.createElement("div"); row.className = "pcRow";
  const b = document.createElement("button"); b.type = "button"; b.className = "tickBtn" + (_pendRows[id][field] ? " on" : "");
  b.onclick = async function () {
    if (_pendRows[id].sent) return;
    const nv = !_pendRows[id][field]; b.disabled = true;
    try { await pendPersist(id, field === "isis" ? { isis: nv } : { faltantes: nv }); _pendRows[id][field] = nv; b.classList.toggle("on", nv); }
    catch (e) { alert("No se pudo guardar: " + (e.message || e)); }
    b.disabled = false; pendRefreshEnviar(id);
  };
  const lbl = document.createElement("span"); lbl.className = "pcLbl"; lbl.textContent = label;
  row.appendChild(b); row.appendChild(lbl); return row;
}
function pendPartesRow(id) {
  const row = document.createElement("div"); row.className = "pcRow";
  const tick = document.createElement("button"); tick.type = "button"; tick.className = "tickBtn";
  const lbl = document.createElement("span"); lbl.className = "pcLbl"; lbl.textContent = "Control Partes Talleristas";
  const no = document.createElement("button"); no.type = "button"; no.className = "noBtn"; no.textContent = "No corresponde";
  function sync() { const v = _pendRows[id].partes; tick.classList.toggle("on", v === "corresponde"); no.classList.toggle("on", v === "no"); }
  async function setVal(v) {
    if (_pendRows[id].sent) return;
    const nv = (_pendRows[id].partes === v) ? null : v; tick.disabled = no.disabled = true;
    try { await pendPersist(id, { control_partes: nv }); _pendRows[id].partes = nv; sync(); }
    catch (e) { alert("No se pudo guardar: " + (e.message || e)); }
    tick.disabled = no.disabled = false; pendRefreshEnviar(id);
  }
  tick.onclick = function () { setVal("corresponde"); };
  no.onclick = function () { setVal("no"); };
  sync(); row.appendChild(tick); row.appendChild(lbl); row.appendChild(no); return row;
}
function pendFotoRow(id) {
  const row = document.createElement("div"); row.className = "pcRow pcFotoRow";
  const lbl = document.createElement("span"); lbl.className = "pcLbl"; lbl.textContent = "Foto RTO";
  const drop = document.createElement("label"); drop.className = "fotoDrop" + (_pendRows[id].foto_url ? " has" : "");
  const input = document.createElement("input"); input.type = "file"; input.accept = "image/*"; input.style.display = "none";
  const txt = document.createElement("span"); txt.className = "fotoTxt"; txt.textContent = _pendRows[id].foto_url ? "✓ Foto" : "📎 Adjuntar o arrastrar";
  drop.appendChild(input); drop.appendChild(txt);
  async function setFile(file) {
    if (!file || _pendRows[id].sent) return;
    txt.textContent = "Subiendo…";
    try { const url = await pendUploadFoto(id, file); await pendPersist(id, { foto_url: url }); _pendRows[id].foto_url = url; drop.classList.add("has"); txt.textContent = "✓ Foto"; }
    catch (e) { txt.textContent = _pendRows[id].foto_url ? "✓ Foto" : "📎 Adjuntar o arrastrar"; alert("No se pudo subir la foto: " + (e.message || e)); }
    pendRefreshEnviar(id);
  }
  input.onchange = function () { if (input.files && input.files[0]) setFile(input.files[0]); };
  drop.ondragover = function (e) { e.preventDefault(); drop.classList.add("drag"); };
  drop.ondragleave = function () { drop.classList.remove("drag"); };
  drop.ondrop = function (e) { e.preventDefault(); drop.classList.remove("drag"); const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (f) setFile(f); };
  row.appendChild(lbl); row.appendChild(drop); return row;
}
async function pendUploadFoto(id, file) {
  await sessionReady;
  const ext = (file.name && file.name.indexOf(".") >= 0) ? file.name.split(".").pop().toLowerCase().replace(/[^a-z0-9]/g, "") : "jpg";
  const path = id + "_" + Date.now() + "." + (ext || "jpg");
  const up = await supabase.storage.from("remitos").upload(path, file, { upsert: true, contentType: file.type || "image/jpeg" });
  if (up.error) throw up.error;
  const pub = supabase.storage.from("remitos").getPublicUrl(path);
  return (pub && pub.data) ? pub.data.publicUrl : null;
}
function pendRowComplete(id) { const s = _pendRows[id]; return !!(s && s.isis && s.partes && s.faltantes && s.foto_url); }
function pendRefreshEnviar(id) {
  const card = document.querySelector('#rcpRoot .pendCard[data-id="' + id + '"]');
  if (!card) return; const b = card.querySelector(".enviarBtn");
  if (b && !_pendRows[id].sent) b.disabled = !pendRowComplete(id);
}
async function pendEnviar(id, foot) {
  if (!pendRowComplete(id) || _pendRows[id].sent) return;
  const b = foot.querySelector(".enviarBtn"); if (b) { b.disabled = true; b.textContent = "Enviando…"; }
  try {
    const codigo = await pendGenCodigo();
    await pendPersist(id, { estado: "procesado", procesado_at: new Date().toISOString(), codigo: codigo });
    _pendRows[id].sent = true;
    foot.innerHTML = "";
    const lab = document.createElement("span"); lab.className = "pcLbl"; lab.textContent = "Código:";
    const c = document.createElement("div"); c.className = "codigoBox"; c.textContent = codigo;
    foot.appendChild(lab); foot.appendChild(c);
    const card = foot.parentNode; if (card) card.classList.add("sentRow");
  } catch (e) {
    if (b) { b.disabled = false; b.textContent = "Enviar"; }
    alert("No se pudo enviar: " + (e.message || e));
  }
}
async function pendGenCodigo() {
  await sessionReady;
  const usados = new Set();
  try {
    const since = new Date(); since.setHours(0, 0, 0, 0);
    const r = await supabase.from("Control_Modo_OP").select("codigo").gte("created_at", since.toISOString()).not("codigo", "is", null);
    if (r.data) r.data.forEach(function (x) { if (x.codigo) usados.add(String(x.codigo)); });
  } catch (_e) {}
  let c, tries = 0;
  do { c = String(Math.floor(1000 + Math.random() * 9000)); tries++; } while (usados.has(c) && tries < 200);
  return c;
}

/* ============== API pública para Producción ============== */
window.openRecepcionOp = function (legajo, dayKey) {
  RECP.legajo = String(legajo || "").trim() || null;
  RECP.dayKey = dayKey || opTodayStr();
  openOp();
};
/* Menú de Recepción (supervisor "Carga Recepción Mercadería"): Carga / Pendientes, LOCALES. */
window.openRecepcionMenu = function () {
  RECP.legajo = null;
  RECP.dayKey = opTodayStr();
  opPage.classList.add("open");
  renderMenu();
};
