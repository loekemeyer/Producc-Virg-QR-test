# Facturación electrónica propia (ARCA / ex AFIP) — diseño y guía de puesta en marcha

> ## ✅ Estado: **PRODUCCIÓN ACTIVA** (2026-07-30)
> La app **emite Facturas A reales con validez fiscal**. Ya se emitió la primera:
> NP 98277, **CAE 86316114309666**, PV **11**, `entorno='prod'`. Config vigente:
> certificado de producción **`virgilioapp`** (creado en "Administración de Certificados
> Digitales" de AFIP y autorizado al servicio `wsfe`), **PV 11** ("APP PRODUCCIÓN WS"),
> secrets en Supabase: `ARCA_CERT`, `ARCA_KEY` (de `virgilioapp`), `ARCA_ENV=prod`,
> `ARCA_PTO_VTA=11`, `ARCA_CUIT=30515842450`, `ARCA_EMITIR=on`, `WEB_SERVICE_KEY`.
> Notas de Crédito para anular: acción `emitir_nc` + botón "Anular factura (NC)" (v6.64).
> **Todo lo de "HOMOLOGACIÓN / falta certificado" de abajo quedó SUPERADO** — se conserva
> como historial del camino recorrido.

> Estado histórico: **HOMOLOGACIÓN PROBADA de punta a punta** (2026-07-30) — la app ya podía pedir y
> obtener un **CAE** de ARCA en el entorno de PRUEBA. (Superado: hoy está en producción, ver arriba.)
> Este documento es la guía viva del camino "la app emite desde
> un punto de venta nuevo, e Isis levanta de ARCA". Ver también `GUIA-PROYECTO.md` (Isis vs 2º emisor).
>
> **✅ Avance 2026-07-30 — HOMOLOGACIÓN OK end-to-end.** Se completó el §4 (shopping list) en el
> entorno de PRUEBA y se probó la Edge Function `arca-wsfe` contra ARCA homologación, en orden:
> **`ta`** (login WSAA firmando con el certificado) → OK (token ~12 h); **`ultimo`**
> (`FECompUltimoAutorizado`, PDV 11) → OK (devolvió 0, PDV nuevo); **`emitir`** (`FECAESolicitar`,
> Factura B de prueba $121) → **CAE AUTORIZADO** (`resultado='A'`) y logueado en `Comprobantes_ARCA`
> (`entorno='homo'`, `estado='autorizado'`). **Config de la prueba:** **PDV nuevo = 11**
> (`ARCA_PTO_VTA`), `ARCA_ENV=homo`. **Modelo de certificado:** por una limitación de la
> homologación de AFIP (ata el certificado al CUIT de la **persona** que opera, no deja cambiarlo),
> el **certificado es del representante (persona)** con una **autorización `wsfe` cuyo *representado*
> es la EMPRESA** → así el **emisor de las facturas es la empresa** igual (delegación). En producción
> se puede sacar el certificado **directo a nombre de la empresa** vía "Administración de Certificados
> Digitales". Los **secrets** (`ARCA_CERT`, `ARCA_KEY`, `ARCA_CUIT`, `ARCA_PTO_VTA`, `ARCA_ENV=homo`,
> `ARCA_EMITIR=on`) están cargados en **Supabase** (NO en el repo; el `.key` nunca se commitea).
>
> **Avance v6.41**: esqueleto — (1) tabla `Comprobantes_ARCA` en Supabase con RLS (anon solo
> lectura, DDL en `sql/comprobantes_arca.sql`); (2) Edge Function `arca-wsfe`
> (`supabase/functions/arca-wsfe/index.ts`), gateada por secrets + `ARCA_EMITIR`.

## 1. Objetivo

Que la **app** pueda **facturar sola** (emitir factura electrónica con CAE contra ARCA),
sin doble carga y **sin depender del Isis on-premise**. La contabilidad se consolida en
Isis levantando esas facturas **desde ARCA** (pendiente de confirmar que Isis puede
importar de ARCA automáticamente — ver ticket a Isis).

Flujo elegido: **App → ARCA (Web Service) → Isis trae de ARCA por CAE**.

## 2. Por qué hace falta un backend (Edge Function)

La app es **estática** (GitHub Pages) + Supabase. **No puede** hablar con ARCA directo:
- ARCA usa **SOAP** y exige **autenticación con certificado digital** (WSAA).
- El certificado (clave privada) **no puede vivir en el navegador** (lo vería cualquiera).

Solución: un **backend mínimo = Supabase Edge Function** (Deno) que:
- Guarda el **certificado + clave privada** como **secrets** de Supabase.
- Hace el login WSAA (firma CMS) y llama a WSFE (pedir CAE).
- La app le pega a esa función; nunca ve el certificado.

Ventaja sobre el plan "API de Isis": **no** hay que exponer el Isis local a internet.
Todo queda en la nube.

## 3. Arquitectura

```
Navegador (app)                 Supabase                         ARCA (ex AFIP)
--------------                  --------                         --------------
[Facturar NP] ── HTTPS ──▶ Edge Function `arca-wsfe`
                            1) WSAA: firma LoginTicketRequest ── SOAP ──▶ WSAA  → token+sign (TA, ~12 h, cacheado)
                            2) WSFE: FECAESolicitar ─────────── SOAP ──▶ WSFE  → CAE + vto
                            3) guarda en tabla `Comprobantes_ARCA`
                        ◀── JSON { cae, nro, pdv, vto } ──
[muestra CAE / imprime]
```

- **WSAA** (auth): `https://wsaahomo.afip.gov.ar/ws/services/LoginCms` (homologación) /
  `https://wsaa.afip.gov.ar/ws/services/LoginCms` (producción). Se firma un XML
  (LoginTicketRequest) en formato **CMS/PKCS#7** con el certificado → devuelve
  **token + sign** válidos ~12 h (se cachean, no se pide en cada factura).
- **WSFEv1** (factura): `https://wswhomo.afip.gov.ar/wsfev1/service.asmx` (homologación) /
  `https://servicios1.afip.gov.ar/wsfev1/service.asmx` (producción). Métodos clave:
  - `FEDummy` — healthcheck sin auth (ya probado, ver §7).
  - `FECompUltimoAutorizado` — último número autorizado de ese PDV+tipo (para el correlativo).
  - `FECAESolicitar` — pide el **CAE** de un comprobante.
  - `FECompConsultar` — consulta un comprobante ya emitido (trae su CAE) → sirve para
    reconciliar / recuperar (lo que hizo el dueño una vez).

## 4. Qué hay que sacar de ARCA (shopping list — lo hace el dueño)

1. **Certificado digital** para Web Service, atado al CUIT de la empresa
   (uno de **homologación** para probar + uno de **producción**). Se genera en el portal
   de ARCA ("Administración de Certificados Digitales" / "WSASS").
2. **Punto de venta NUEVO**, distinto al que usa Isis, dado de alta como
   **"Factura Electrónica - Web Services (RECE/WS)"** (no "Comprobantes en línea").
3. **Asociar el servicio `wsfe`** (Factura Electrónica) a ese certificado en ARCA
   (delegación de servicio), para que el certificado tenga permiso de facturar.
4. Pasar a Claude: el **CUIT**, el **número de PDV nuevo**, y los **dos certificados**
   (.crt + .key) — se cargan como **secrets** en Supabase, NO se commitean al repo.

## 5. Decisiones que necesito del dueño (antes de codear la emisión)

- **⚠ ¿De dónde sale el IMPORTE de cada factura?** — La app hoy tiene **cajas y m³, NO
  precios**. Para emitir una factura válida hace falta **neto + IVA**. Opciones:
  (a) la operadora lo **tipea** por NP al facturar; (b) una **lista de precios** en la app;
  (c) traerlo de Isis. **Sin una fuente del importe, no se puede emitir.** (Es el bloqueo
  #1.)
- **Tipo de comprobante y condición IVA**: ¿Factura **A** (clientes responsables
  inscriptos, la mayoría son S.R.L.), **B** (consumidor final/monotributo), o ambas según
  el cliente? Define la lógica y las alícuotas. **Confirmar con el contador.**
- **Alícuota de IVA** por artículo (21% / 10,5% / etc.) — ¿única o varía?
- **Empezamos en homologación** (pruebas, sin validez fiscal) y recién cuando esté 100%
  pasamos a producción.

## 6. Piezas a construir (cuando lleguen certificado + decisiones)

- **Tabla `Comprobantes_ARCA`** (log de emitidos). ✅ **YA CREADA** (migración
  `comprobantes_arca_skeleton`, DDL versionado en `sql/comprobantes_arca.sql`). RLS: anon
  solo lectura, escritura vía service_role (verificado que anon no puede insertar). DDL:
  ```sql
  create table if not exists public."Comprobantes_ARCA" (
    id           bigint generated always as identity primary key,
    np           text,
    tanda        text,
    cuit_cliente text,
    tipo_cbte    int,            -- 1=FA A, 6=FA B, etc. (tabla ARCA)
    pto_vta      int,
    nro_cbte     bigint,
    importe_neto numeric,
    importe_iva  numeric,
    importe_total numeric,
    cae          text,
    cae_vto      date,
    estado       text default 'pendiente',  -- pendiente|autorizado|rechazado
    entorno      text default 'homo',        -- homo|prod
    raw_resp     jsonb,
    creado       timestamptz not null default now()
  );
  -- RLS: anon SOLO lectura; la escritura la hace la Edge Function (service_role).
  ```
- **Edge Function `arca-wsfe`** (reemplaza al healthcheck): WSAA (firma CMS con
  `node-forge` vía `npm:`) + cache del TA + `FECAESolicitar` + `FECompUltimoAutorizado` +
  guarda en `Comprobantes_ARCA`. Certificado como **secret** (`ARCA_CERT`, `ARCA_KEY`,
  `ARCA_CUIT`, `ARCA_PTO_VTA`, `ARCA_ENV`).
  ✅ **v2 (2026-07-30): WSAA + WSFE IMPLEMENTADOS y DEPLOYADOS** en
  `supabase/functions/arca-wsfe/index.ts` (`verify_jwt=off`, temporal): firma CMS del
  LoginTicketRequest con `node-forge`, **cache del TA** en la tabla `ARCA_TA` (ARCA
  rechaza pedir un TA nuevo con uno vigente), `FECompUltimoAutorizado`,
  `FECAESolicitar` (incluye `CondicionIVAReceptorId`, RG 5616) y log de cada intento
  (autorizado/rechazado) en `Comprobantes_ARCA` vía service_role. **Sigue GATEADA**:
  sin secrets responde qué falta (501) y `emitir` exige además `ARCA_EMITIR=on`.
  Acciones: `status` (GET) · `ta` (login WSAA real — **la prueba del certificado**) ·
  `ultimo` (`{tipo_cbte}` → correlativo) · `emitir` (`{tipo_cbte, neto, iva,
  doc_tipo?, doc_nro?, cond_iva_receptor?, alic_id?, np?, tanda?}` → CAE).
  ✅ **PROBADA en homologación (2026-07-30)**: cargados los secrets, se corrió `ta` → `ultimo`
  → `emitir` (con `ARCA_EMITIR=on`) → **CAE autorizado** (ver el Avance del encabezado). URL:
  `https://hrxfctzncixxqmpfhskv.supabase.co/functions/v1/arca-wsfe` (se invoca **desde el
  navegador** — el sandbox de Claude no llega, proxy 403; `ta`/`ultimo`/`emitir` van por
  POST `{"action":...}`, GET = status). Antes de producción: `verify_jwt=on`.
- **Módulo frontend** dentro de **Facturación** (un botón "Facturar electrónicamente" /
  ticket aparte, NO el tilde actual): elige cliente + importe (o lo trae), llama a la
  función, muestra el CAE y permite imprimir. Se hace **al final**, después de que
  homologación funcione.

## 7. Estado actual (lo avanzado sin certificado)

- ✅ **Healthcheck deployado**: Edge Function **`arca-wsfe-healthcheck`** (verify_jwt=off,
  temporal) que llama `FEDummy` (sin auth ni certificado). Prueba que **Supabase llega a
  ARCA**. Se invoca:
  `https://hrxfctzncixxqmpfhskv.supabase.co/functions/v1/arca-wsfe-healthcheck?env=homo`
  (o `env=prod`). Devuelve `{ appserver, dbserver, authserver }` = OK si ARCA responde.
  ⚠ No se pudo verificar desde el sandbox de Claude (su proxy bloquea salidas) — **probar
  abriendo esa URL desde el navegador del celu/monitor**. Se reemplaza por `arca-wsfe`
  real más adelante.
- ✅ **Homologación completa (2026-07-30)**: certificado + **PDV 11** + autorización `wsfe`
  (representado = empresa) + secrets cargados + **CAE de prueba** obtenido. Ver el Avance del encabezado.
- ⏳ **Falta para PRODUCCIÓN**: (1) la fuente del **importe** (§5, bloqueo #1); (2) **OK del
  contador** (tipo A/B, alícuotas); (3) **certificado de producción** + `ARCA_ENV=prod`; (4) el
  **módulo frontend** en Facturación; (5) confirmar que **Isis importa de ARCA**.

## 8. Resumen del camino

App emite factura desde un **PDV nuevo** por Web Service (Edge Function con el
certificado) → ARCA da el **CAE** → Isis **levanta la factura de ARCA** (a confirmar).
Para arrancar a codear la emisión hacen falta: **certificado + PDV** de ARCA, definir **de
dónde sale el importe**, y el **OK del contador**. Mientras tanto, la conectividad
Supabase→ARCA quedó lista para probar (§7).
