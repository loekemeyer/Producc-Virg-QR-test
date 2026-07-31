// arca-wsfe — Edge Function (Deno) para facturación electrónica propia contra ARCA (ex AFIP).
//
// v2 (2026-07-30): WSAA + WSFE **IMPLEMENTADOS** (firma CMS con node-forge, cache del TA en
// la tabla ARCA_TA, FECompUltimoAutorizado y FECAESolicitar, log en Comprobantes_ARCA).
// Sigue **GATEADA**: sin los secrets responde qué falta, y `emitir` exige ARCA_EMITIR=on.
// Ver diseño en docs/facturacion-arca.md. NO probada contra ARCA todavía (falta certificado);
// cuando llegue el cert de homologación, probar primero con {action:"ta"} y {action:"ultimo"}.
//
// Acciones (POST JSON {action:...}; GET = status):
//   status  → deployada, qué secrets faltan, si la emisión está habilitada.
//   ta      → hace el login WSAA real (o devuelve el TA cacheado). Prueba el certificado.
//   ultimo  → FECompUltimoAutorizado {tipo_cbte} → último nro autorizado del PDV.
//   emitir  → FECAESolicitar {tipo_cbte, neto, iva, doc_tipo?, doc_nro?, cond_iva_receptor?,
//             alic_id?, total?, np?, tanda?} → CAE. Solo con ARCA_EMITIR=on.
//   preciar → {np, tanda?} → calcula el importe de una NP (ítems de Entregas_Virgilio ×
//             precios del proyecto web, neto = list_price×(1−dto_vol)×(1−2%), IVA 21%).
//             NO emite (no requiere ARCA_EMITIR). Sirve de preview. Necesita WEB_SERVICE_KEY.
//   emitir_np → {np, tanda?, tipo_cbte?=1} → precia la NP y pide el CAE (Factura A por defecto,
//             receptor Responsable Inscripto por CUIT). Requiere ARCA_EMITIR=on + WEB_SERVICE_KEY.
//
// Secrets: ARCA_CERT (PEM), ARCA_KEY (PEM), ARCA_CUIT, ARCA_PTO_VTA, ARCA_ENV (homo|prod),
//          ARCA_EMITIR (on|off), y para preciar/emitir_np: WEB_SERVICE_KEY (service_role del
//          proyecto web de precios) + WEB_SUPABASE_URL (opcional, default hardcodeado).
//          SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY los inyecta Supabase.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import forge from "npm:node-forge@1.3.1";

const WS_URLS = {
  homo: {
    wsaa: "https://wsaahomo.afip.gov.ar/ws/services/LoginCms",
    wsfe: "https://wswhomo.afip.gov.ar/wsfev1/service.asmx",
  },
  prod: {
    wsaa: "https://wsaa.afip.gov.ar/ws/services/LoginCms",
    wsfe: "https://servicios1.afip.gov.ar/wsfev1/service.asmx",
  },
};

// CORS abierto: la app (github.io) llama a la función (supabase.co) = cross-origin.
// ⚠ Producción: restringir Access-Control-Allow-Origin al origen de la app + verify_jwt=on.
const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization, apikey",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Connection": "keep-alive", ...CORS },
  });
}

function readConfig() {
  const env = (Deno.env.get("ARCA_ENV") || "homo").toLowerCase() === "prod" ? "prod" : "homo";
  return {
    env,
    cert: Deno.env.get("ARCA_CERT") || "",
    key: Deno.env.get("ARCA_KEY") || "",
    cuit: (Deno.env.get("ARCA_CUIT") || "").replace(/\D/g, ""),
    ptoVta: (Deno.env.get("ARCA_PTO_VTA") || "").replace(/\D/g, ""),
    emitir: (Deno.env.get("ARCA_EMITIR") || "off").toLowerCase() === "on",
    // Proyecto web de PRECIOS (otro Supabase de la misma org): URL fija + service_role
    // como secret (customers está protegida; hay que leerla server-side, nunca del front).
    webUrl: Deno.env.get("WEB_SUPABASE_URL") || "https://kwkclwhmoygunqmlegrg.supabase.co",
    webKey: Deno.env.get("WEB_SERVICE_KEY") || "",
    urls: WS_URLS[env as "homo" | "prod"],
  };
}
type Cfg = ReturnType<typeof readConfig>;

function missingSecrets(c: Cfg): string[] {
  const miss: string[] = [];
  if (!c.cert) miss.push("ARCA_CERT");
  if (!c.key) miss.push("ARCA_KEY");
  if (!c.cuit) miss.push("ARCA_CUIT");
  if (!c.ptoVta) miss.push("ARCA_PTO_VTA");
  return miss;
}

// ───────────────────────── utilitarios XML/SOAP ─────────────────────────
function tag(xml: string, name: string): string | null {
  const m = xml.match(new RegExp("<(?:[A-Za-z0-9_]+:)?" + name + "[^>]*>([\\s\\S]*?)</(?:[A-Za-z0-9_]+:)?" + name + ">"));
  return m ? m[1] : null;
}
function unesc(s: string): string {
  return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}
// ISO con offset fijo -03:00 (AR, sin DST)
function isoAR(d: Date): string {
  const t = new Date(d.getTime() - 3 * 3600 * 1000);
  return t.toISOString().slice(0, 19) + "-03:00";
}
function hoyAR(): string {
  const t = new Date(Date.now() - 3 * 3600 * 1000);
  return t.toISOString().slice(0, 10).replace(/-/g, "");
}
async function soap(url: string, action: string, body: string): Promise<string> {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "text/xml; charset=utf-8", "SOAPAction": action }, body });
  const t = await r.text();
  const fault = tag(t, "faultstring");
  if (fault) throw new Error("SOAP Fault: " + fault.slice(0, 300));
  if (!r.ok) throw new Error("SOAP HTTP " + r.status + ": " + t.slice(0, 300));
  return t;
}

// ───────────────── acceso a la base (service_role, inyectado) ─────────────────
function sbHeaders(): Record<string, string> {
  const k = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  return { apikey: k, Authorization: "Bearer " + k, "Content-Type": "application/json" };
}
function sbUrl(path: string): string {
  return (Deno.env.get("SUPABASE_URL") || "") + "/rest/v1/" + path;
}

// ───────────────────────── WSAA (login + cache del TA) ─────────────────────────
async function taGet(envName: string) {
  try {
    const r = await fetch(sbUrl("ARCA_TA") + "?service=eq.wsfe-" + envName + "&select=token,sign,expira", { headers: sbHeaders() });
    const rows = r.ok ? await r.json() : [];
    const row = rows[0];
    if (row && new Date(row.expira).getTime() > Date.now() + 5 * 60 * 1000) return row;
  } catch (_e) { /* sin cache → login */ }
  return null;
}
async function taSave(envName: string, token: string, sign: string, expira: string | null) {
  try {
    await fetch(sbUrl("ARCA_TA") + "?on_conflict=service", {
      method: "POST", headers: { ...sbHeaders(), Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify({ service: "wsfe-" + envName, entorno: envName, token, sign, expira: expira || new Date(Date.now() + 11 * 3600 * 1000).toISOString() }),
    });
  } catch (_e) { /* best-effort */ }
}
async function wsaaLogin(c: Cfg): Promise<{ token: string; sign: string; expira: string | null; cacheado: boolean }> {
  const cached = await taGet(c.env);
  if (cached) return { token: cached.token, sign: cached.sign, expira: cached.expira, cacheado: true };
  const now = Date.now();
  const xml = '<?xml version="1.0" encoding="UTF-8"?>' +
    '<loginTicketRequest version="1.0"><header>' +
    "<uniqueId>" + Math.floor(now / 1000) + "</uniqueId>" +
    "<generationTime>" + isoAR(new Date(now - 10 * 60 * 1000)) + "</generationTime>" +
    "<expirationTime>" + isoAR(new Date(now + 10 * 60 * 1000)) + "</expirationTime>" +
    "</header><service>wsfe</service></loginTicketRequest>";
  // firma CMS/PKCS#7 (SignedData con contenido) con el certificado + clave privada
  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(xml, "utf8");
  const cert = forge.pki.certificateFromPem(c.cert);
  p7.addCertificate(cert);
  p7.addSigner({
    key: forge.pki.privateKeyFromPem(c.key),
    certificate: cert,
    digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      { type: forge.pki.oids.signingTime, value: new Date() },
    ],
  });
  p7.sign();
  const cms = forge.util.encode64(forge.asn1.toDer(p7.toAsn1()).getBytes());
  const envlp = '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:wsaa="http://wsaa.view.sua.dvadac.desein.afip.gov"><soapenv:Header/><soapenv:Body><wsaa:loginCms><wsaa:in0>' + cms + "</wsaa:in0></wsaa:loginCms></soapenv:Body></soapenv:Envelope>";
  const resp = await soap(c.urls.wsaa, "", envlp);
  const inner = unesc(tag(resp, "loginCmsReturn") || "");
  const token = tag(inner, "token"), sign = tag(inner, "sign"), expira = tag(inner, "expirationTime");
  if (!token || !sign) throw new Error("WSAA sin token/sign: " + inner.slice(0, 300));
  await taSave(c.env, token, sign, expira);
  return { token, sign, expira, cacheado: false };
}

// ───────────────────────── WSFE ─────────────────────────
const FE_NS = "http://ar.gov.afip.dif.FEV1/";
function feAuth(c: Cfg, ta: { token: string; sign: string }): string {
  return "<ar:Auth><ar:Token>" + ta.token + "</ar:Token><ar:Sign>" + ta.sign + "</ar:Sign><ar:Cuit>" + c.cuit + "</ar:Cuit></ar:Auth>";
}
function feEnvelope(inner: string): string {
  return '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ar="' + FE_NS + '"><soap:Body>' + inner + "</soap:Body></soap:Envelope>";
}
function feErrs(resp: string): string | null {
  const e = tag(resp, "Errors");
  if (!e) return null;
  const code = tag(e, "Code"), msg = tag(e, "Msg");
  return ((code ? code + ": " : "") + (msg || e)).slice(0, 300);
}
async function feUltimo(c: Cfg, ta: { token: string; sign: string }, tipoCbte: number): Promise<number> {
  const resp = await soap(c.urls.wsfe, FE_NS + "FECompUltimoAutorizado",
    feEnvelope("<ar:FECompUltimoAutorizado>" + feAuth(c, ta) + "<ar:PtoVta>" + c.ptoVta + "</ar:PtoVta><ar:CbteTipo>" + tipoCbte + "</ar:CbteTipo></ar:FECompUltimoAutorizado>"));
  const err = feErrs(resp);
  if (err) throw new Error("FECompUltimoAutorizado: " + err);
  return parseInt(tag(resp, "CbteNro") || "0", 10);
}
// deno-lint-ignore no-explicit-any
async function feEmitir(c: Cfg, ta: { token: string; sign: string }, p: any) {
  const tipoCbte = Number(p.tipo_cbte);
  const ultimo = await feUltimo(c, ta, tipoCbte);
  const nro = ultimo + 1;
  const neto = Math.round((Number(p.neto) || 0) * 100) / 100;
  const iva = Math.round((Number(p.iva) || 0) * 100) / 100;
  const total = p.total != null ? Math.round(Number(p.total) * 100) / 100 : Math.round((neto + iva) * 100) / 100;
  const alic = Number(p.alic_id) || 5; // 5 = 21%
  const det = "<ar:FECAEDetRequest>" +
    "<ar:Concepto>1</ar:Concepto>" + // 1 = productos
    "<ar:DocTipo>" + (p.doc_tipo != null ? Number(p.doc_tipo) : 99) + "</ar:DocTipo>" +
    "<ar:DocNro>" + (p.doc_nro != null ? String(p.doc_nro).replace(/\D/g, "") : "0") + "</ar:DocNro>" +
    "<ar:CbteDesde>" + nro + "</ar:CbteDesde><ar:CbteHasta>" + nro + "</ar:CbteHasta>" +
    "<ar:CbteFch>" + hoyAR() + "</ar:CbteFch>" +
    "<ar:ImpTotal>" + total.toFixed(2) + "</ar:ImpTotal><ar:ImpTotConc>0</ar:ImpTotConc>" +
    "<ar:ImpNeto>" + neto.toFixed(2) + "</ar:ImpNeto><ar:ImpOpEx>0</ar:ImpOpEx>" +
    "<ar:ImpTrib>0</ar:ImpTrib><ar:ImpIVA>" + iva.toFixed(2) + "</ar:ImpIVA>" +
    "<ar:MonId>PES</ar:MonId><ar:MonCotiz>1</ar:MonCotiz>" +
    (p.cond_iva_receptor != null ? "<ar:CondicionIVAReceptorId>" + Number(p.cond_iva_receptor) + "</ar:CondicionIVAReceptorId>" : "") +
    // CbtesAsoc: comprobantes asociados. Obligatorio en Notas de Crédito/Débito — referencian la factura que anulan.
    ((Array.isArray(p.cbtes_asoc) && p.cbtes_asoc.length)
      ? "<ar:CbtesAsoc>" + p.cbtes_asoc.map(function (a: { tipo: number; pto_vta: number; nro: number }) { return "<ar:CbteAsoc><ar:Tipo>" + Number(a.tipo) + "</ar:Tipo><ar:PtoVta>" + Number(a.pto_vta) + "</ar:PtoVta><ar:Nro>" + Number(a.nro) + "</ar:Nro></ar:CbteAsoc>"; }).join("") + "</ar:CbtesAsoc>"
      : "") +
    (iva > 0 ? "<ar:Iva><ar:AlicIva><ar:Id>" + alic + "</ar:Id><ar:BaseImp>" + neto.toFixed(2) + "</ar:BaseImp><ar:Importe>" + iva.toFixed(2) + "</ar:Importe></ar:AlicIva></ar:Iva>" : "") +
    "</ar:FECAEDetRequest>";
  const req = "<ar:FECAESolicitar>" + feAuth(c, ta) +
    "<ar:FeCAEReq><ar:FeCabReq><ar:CantReg>1</ar:CantReg><ar:PtoVta>" + c.ptoVta + "</ar:PtoVta><ar:CbteTipo>" + tipoCbte + "</ar:CbteTipo></ar:FeCabReq>" +
    "<ar:FeDetReq>" + det + "</ar:FeDetReq></ar:FeCAEReq></ar:FECAESolicitar>";
  const resp = await soap(c.urls.wsfe, FE_NS + "FECAESolicitar", feEnvelope(req));
  const errTop = feErrs(resp);
  const resultado = tag(resp, "Resultado") || "";
  const cae = tag(resp, "CAE") || null;
  const caeVto = tag(resp, "CAEFchVto") || null;
  const obs = tag(resp, "Observaciones");
  const estado = resultado === "A" && cae ? "autorizado" : "rechazado";
  // log SIEMPRE en Comprobantes_ARCA (autorizado o rechazado), best-effort
  try {
    await fetch(sbUrl("Comprobantes_ARCA"), {
      method: "POST", headers: { ...sbHeaders(), Prefer: "return=minimal" },
      body: JSON.stringify({
        np: p.np || null, tanda: p.tanda || null,
        cuit_cliente: p.doc_nro != null ? String(p.doc_nro).replace(/\D/g, "") : null,
        tipo_cbte: tipoCbte, pto_vta: Number(c.ptoVta), nro_cbte: nro,
        importe_neto: neto, importe_iva: iva, importe_total: total,
        cae, cae_vto: caeVto ? caeVto.slice(0, 4) + "-" + caeVto.slice(4, 6) + "-" + caeVto.slice(6, 8) : null,
        estado, entorno: c.env,
        raw_resp: { resultado, obs: obs ? String(obs).slice(0, 2000) : null, err: errTop, cbtes_asoc: p.cbtes_asoc || null },
      }),
    });
  } catch (_e) { /* el CAE ya salió; el log no debe romper la respuesta */ }
  return { ok: estado === "autorizado", estado, resultado, pto_vta: Number(c.ptoVta), nro_cbte: nro, cae, cae_vto: caeVto, obs: obs ? String(obs).slice(0, 800) : null, error: errTop };
}

// ───────── Precio de facturación: cruza Virgilio (Entregas_Virgilio) + proyecto web ─────────
// Regla del dueño: neto_unit = list_price × (1 − dto_vol) × (1 − 2%). IVA 21%. Precios SIN IVA.
const DTO_FIJO = 0.02;
function canonCod(s: string): string { return String(s == null ? "" : s).toUpperCase().trim().replace(/^0+(?=.)/, ""); }
async function webRest(c: Cfg, path: string): Promise<unknown[]> {
  const r = await fetch(c.webUrl + "/rest/v1/" + path, { headers: { apikey: c.webKey, Authorization: "Bearer " + c.webKey } });
  if (!r.ok) throw new Error("web REST " + r.status + ": " + (await r.text()).slice(0, 200));
  return await r.json();
}
// deno-lint-ignore no-explicit-any
async function preciarNp(c: Cfg, np: string, tanda: string): Promise<any> {
  np = String(np || "").trim();
  if (!np) throw new Error("Falta el número de NP.");
  // 1) ítems ENTREGADOS de la NP (Virgilio, service role propio)
  let q = sbUrl("Entregas_Virgilio") + "?select=cod_cliente,cod_art,cajas_entregadas&np=eq." + encodeURIComponent(np) + "&cajas_entregadas=gt.0";
  if (tanda) q += "&tanda=eq." + encodeURIComponent(tanda);
  // deno-lint-ignore no-explicit-any
  const items: any[] = await (await fetch(q, { headers: sbHeaders() })).json();
  if (!Array.isArray(items) || !items.length) throw new Error("La NP " + np + " no tiene ítems entregados en Entregas_Virgilio.");
  const codCliente = String(items[0].cod_cliente || "").replace(/\D/g, "");
  if (!codCliente) throw new Error("La NP " + np + " no tiene código de cliente.");
  const cajasPorCod: Record<string, number> = {};
  for (const it of items) { const k = canonCod(it.cod_art); if (k) cajasPorCod[k] = (cajasPorCod[k] || 0) + (Number(it.cajas_entregadas) || 0); }
  // 2) cliente (web): CUIT + dto_vol
  // deno-lint-ignore no-explicit-any
  const custRows: any[] = await webRest(c, "customers?select=cod_cliente,cuit,business_name,dto_vol&cod_cliente=eq." + codCliente + "&limit=1");
  const cust = custRows[0];
  if (!cust) throw new Error("El cliente " + codCliente + " no figura en el maestro web (sin CUIT/precios).");
  const cuit = String(cust.cuit || "").replace(/\D/g, "");
  if (cuit.length !== 11) throw new Error("El cliente " + codCliente + " (" + (cust.business_name || "") + ") no tiene CUIT válido en el maestro web.");
  const dto = Number(cust.dto_vol) || 0;
  // 3) precios (web): productos activos, match por código canónico (066↔66)
  // deno-lint-ignore no-explicit-any
  const prods: any[] = await webRest(c, "products?select=cod,list_price,uxb,active&active=eq.true&limit=2000");
  // deno-lint-ignore no-explicit-any
  const pmap: Record<string, any> = {};
  for (const p of prods) { const k = canonCod(p.cod); if (k && !(k in pmap)) pmap[k] = p; }
  // 4) calcular neto
  // deno-lint-ignore no-explicit-any
  const detalle: any[] = []; const faltan: string[] = []; let neto = 0;
  for (const cod of Object.keys(cajasPorCod)) {
    const p = pmap[cod]; const cajas = cajasPorCod[cod];
    if (!p || p.list_price == null || Number(p.list_price) <= 0) { faltan.push(cod); continue; }
    const uxb = Number(p.uxb) || 1;
    const punit = Number(p.list_price) * (1 - dto) * (1 - DTO_FIJO);
    const nlin = cajas * uxb * punit;
    neto += nlin;
    detalle.push({ cod, cajas, uxb, list_price: Number(p.list_price), precio_unit: Math.round(punit * 100) / 100, neto_linea: Math.round(nlin * 100) / 100 });
  }
  neto = Math.round(neto * 100) / 100;
  const iva = Math.round(neto * 0.21 * 100) / 100;
  const total = Math.round((neto + iva) * 100) / 100;
  return { np, tanda: tanda || null, cod_cliente: codCliente, cuit, cliente: cust.business_name || null, dto_vol: dto, neto, iva, total, detalle, faltan };
}

// ───────────────────────── handler ─────────────────────────
Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const c = readConfig();
  const miss = missingSecrets(c);
  let body: Record<string, unknown> = {};
  let action = "status";
  if (req.method === "POST") {
    try { body = await req.json(); action = typeof body?.action === "string" ? (body.action as string) : "status"; } catch (_e) { /* status */ }
  }

  if (action === "status") {
    return json({
      ok: true, service: "arca-wsfe", version: 2, estado: "implementado (gateado)",
      configured: miss.length === 0, emitir_habilitado: c.emitir, entorno: c.env,
      faltan_secrets: miss,
      acciones: ["status", "ta", "ultimo", "emitir", "preciar", "emitir_np", "emitir_nc"],
      web_precios: c.webKey ? "conectado" : "falta WEB_SERVICE_KEY",
      nota: miss.length ? "Cargá los secrets para poder probar (action=ta) — ver docs/facturacion-arca.md." : (c.emitir ? "Listo para emitir." : "Secrets OK. Probá action=ta / ultimo; para emitir prendé ARCA_EMITIR=on."),
    });
  }

  if (miss.length > 0) return json({ ok: false, error: "faltan_secrets", faltan: miss }, 501);

  try {
    if (action === "ta") {
      const ta = await wsaaLogin(c);
      return json({ ok: true, entorno: c.env, expira: ta.expira, cacheado: ta.cacheado, nota: "WSAA OK — el certificado firma y ARCA lo acepta." });
    }
    if (action === "ultimo") {
      const tipo = Number(body.tipo_cbte);
      if (!tipo) return json({ ok: false, error: "tipo_cbte requerido (1=FA A, 6=FA B, 11=FA C…)" }, 400);
      const ta = await wsaaLogin(c);
      const nro = await feUltimo(c, ta, tipo);
      return json({ ok: true, entorno: c.env, pto_vta: Number(c.ptoVta), tipo_cbte: tipo, ultimo_autorizado: nro });
    }
    if (action === "emitir") {
      if (!c.emitir) return json({ ok: false, error: "emision_deshabilitada", nota: "Prendé el secret ARCA_EMITIR=on para habilitar la emisión." }, 501);
      if (!body.tipo_cbte) return json({ ok: false, error: "tipo_cbte requerido" }, 400);
      if (body.neto == null || body.iva == null) return json({ ok: false, error: "neto e iva requeridos (el importe NO sale de la app todavía — bloqueo #1 del doc)" }, 400);
      const ta = await wsaaLogin(c);
      const r = await feEmitir(c, ta, body);
      return json(r, r.ok ? 200 : 422);
    }
    if (action === "preciar") {
      // Preview del importe de una NP (sin emitir; NO requiere ARCA_EMITIR). Necesita WEB_SERVICE_KEY.
      if (!c.webKey) return json({ ok: false, error: "falta_web_key", nota: "Cargá el secret WEB_SERVICE_KEY (service_role del proyecto web de precios)." }, 501);
      const pr = await preciarNp(c, String(body.np || ""), body.tanda ? String(body.tanda) : "");
      return json({ ok: pr.faltan.length === 0, ...pr, entorno: c.env, nota: pr.faltan.length ? ("Faltan precios para: " + pr.faltan.join(", ")) : "Precio calculado (sin emitir)." });
    }
    if (action === "emitir_np") {
      // Factura una NP completa: precia (Virgilio + web) y pide el CAE. Factura A (tipo 1) por defecto.
      if (!c.emitir) return json({ ok: false, error: "emision_deshabilitada", nota: "Prendé el secret ARCA_EMITIR=on." }, 501);
      if (!c.webKey) return json({ ok: false, error: "falta_web_key", nota: "Cargá el secret WEB_SERVICE_KEY." }, 501);
      const pr = await preciarNp(c, String(body.np || ""), body.tanda ? String(body.tanda) : "");
      if (pr.faltan.length) return json({ ok: false, error: "faltan_precios", faltan: pr.faltan, nota: "No emito: hay artículos sin precio en el maestro web." }, 422);
      if (pr.neto <= 0) return json({ ok: false, error: "neto_cero", nota: "El neto calculado dio 0." }, 422);
      // SIEMPRE Factura A (decisión del dueño: NO se hace Factura B, ni a monotributistas).
      // cond_iva_receptor por defecto 1 (Resp.Inscripto); se puede override por body si algún
      // día hace falta, pero el tipo queda 1 (Factura A) salvo override explícito.
      const tipo = Number(body.tipo_cbte) || 1;
      const cond = Number(body.cond_iva_receptor) || 1;
      const ta = await wsaaLogin(c);
      const r = await feEmitir(c, ta, { tipo_cbte: tipo, neto: pr.neto, iva: pr.iva, doc_tipo: 80, doc_nro: pr.cuit, cond_iva_receptor: cond, np: pr.np, tanda: pr.tanda });
      return json({ ...r, entorno: c.env, tipo_cbte: tipo, letra: "A", cliente: pr.cliente, cuit: pr.cuit, cod_cliente: pr.cod_cliente, neto: pr.neto, iva: pr.iva, total: pr.total, detalle: pr.detalle }, r.ok ? 200 : 422);
    }
    if (action === "emitir_nc") {
      // Anula una factura ya emitida con una Nota de Crédito por el mismo importe,
      // referenciándola en CbtesAsoc. Se busca el comprobante original por CAE (o np).
      if (!c.emitir) return json({ ok: false, error: "emision_deshabilitada", nota: "Prendé el secret ARCA_EMITIR=on." }, 501);
      const caeRef = body.cae ? String(body.cae).replace(/\D/g, "") : "";
      const npRef = body.np ? String(body.np) : "";
      let filtro = "";
      if (caeRef) filtro = "cae=eq." + encodeURIComponent(caeRef);
      else if (npRef) filtro = "np=eq." + encodeURIComponent(npRef) + "&tipo_cbte=in.(1,6,11)";
      else return json({ ok: false, error: "falta_referencia", nota: "Indicá 'cae' o 'np' de la factura a anular." }, 400);
      // deno-lint-ignore no-explicit-any
      const rows: any[] = await (await fetch(sbUrl("Comprobantes_ARCA") + "?" + filtro + "&estado=eq.autorizado&order=creado.desc&limit=1", { headers: sbHeaders() })).json();
      const orig = Array.isArray(rows) ? rows[0] : null;
      if (!orig) return json({ ok: false, error: "original_no_encontrado", nota: "No encontré una factura autorizada con ese CAE/NP." }, 404);
      if (orig.entorno !== c.env) return json({ ok: false, error: "entorno_distinto", nota: "La factura es de entorno '" + orig.entorno + "' y estás en '" + c.env + "'." }, 409);
      if (Number(orig.pto_vta) !== Number(c.ptoVta)) return json({ ok: false, error: "pto_vta_distinto", nota: "La factura es del PV " + orig.pto_vta + " y el secret ARCA_PTO_VTA es " + c.ptoVta + "." }, 409);
      // Factura A(1)→NC A(3), FA B(6)→NC B(8), FA C(11)→NC C(13)
      const ncMap: Record<number, number> = { 1: 3, 6: 8, 11: 13 };
      const tipoNc = ncMap[Number(orig.tipo_cbte)] || 3;
      const ta = await wsaaLogin(c);
      const r = await feEmitir(c, ta, {
        tipo_cbte: tipoNc,
        neto: Number(orig.importe_neto), iva: Number(orig.importe_iva), total: Number(orig.importe_total),
        doc_tipo: 80, doc_nro: orig.cuit_cliente, cond_iva_receptor: 1,
        np: orig.np, tanda: orig.tanda,
        cbtes_asoc: [{ tipo: Number(orig.tipo_cbte), pto_vta: Number(orig.pto_vta), nro: Number(orig.nro_cbte) }],
      });
      return json({ ...r, entorno: c.env, tipo_cbte: tipoNc, letra: tipoNc === 3 ? "A" : (tipoNc === 8 ? "B" : "C"), anula: { cae: orig.cae, pto_vta: orig.pto_vta, nro_cbte: orig.nro_cbte, np: orig.np } }, r.ok ? 200 : 422);
    }
  } catch (e) {
    return json({ ok: false, error: String((e as Error)?.message || e).slice(0, 500) }, 502);
  }

  return json({ ok: false, error: "accion_desconocida", action }, 400);
});
