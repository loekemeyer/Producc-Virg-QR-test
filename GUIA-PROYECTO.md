# Guía del Proyecto — Producción Virgilio

> Guía viva de referencia. Documenta **cómo funciona el programa** y **de dónde
> salen los datos**, para poder responder preguntas con precisión y sin inventar.
> **Mantener actualizada en cada cambio del proyecto** (ver § "Mantenimiento").
>
> Última actualización: 2026-07-20 · Versión app al documentar: **v5.53**
>
> Nota: **v5.53 — Gate de fichada QR: el operario debe fichar el ingreso antes de entrar**. Al tocar **Continuar** en la pantalla de legajo (`goToOptions`), si el operario **todavía no fichó hoy** se le abre un **lector de QR con la cámara** y ficha su ingreso **ahí mismo**, sin salir de la app. Flujo: `goToOptions` → `fichadaGate(cont)` toma la identidad (`_operarioIdent`: correo de Google si entró con Google + **legajo** tipeado) → consulta la **RPC `public.fichadaqr_ficho_hoy(email, legajo)`** (solo-lectura, `SECURITY DEFINER`, grant a `anon`). La RPC acepta **correo y/o legajo**: si viene legajo, lo resuelve contra **`planify.employees`** (la misma lista que valida la fichada) → obtiene el correo real habilitado; devuelve `{ficho, hora, correo}` leyendo `FichadaQR.fichadas` del día BsAs. Ese `correo` es el que la app usa para fichar (garantizado habilitado). Así el gate funciona **aunque el operario haya entrado sólo con el legajo** (sin Google) y aunque su correo no esté en `Empleados`. (Hay overload de 1 arg `(email)` por compat.) Si ya fichó (o lo recuerda el `localStorage` `vir_ficho_qr = {day,email}`) entra directo; si **no**, abre el modal `#fichadaScan` (`openFichadaScanner`). El lector usa **`BarcodeDetector`** si el navegador lo trae y si no cae a **`jsQR`** (vendorizado en `jsqr.min.js`, ~130 KB, carga perezosa; iOS Safari no tiene BarcodeDetector). Decodifica el QR rotativo de la pantalla del trabajo (`.../fichar.html?t=<token>`), saca el token con `_extractToken` y lo manda **con el correo del operario** a la Edge Function **`fichada-qr-fichar`** (schema aislado `FichadaQR`, repo FichadaQRUbic — valida firma HMAC + vencimiento + habilitado en `planify.employees` + 1/día y registra). Respuestas: `ok`/`ya_ficho` → marca fichado local + **Continuar**; `token_vencido/usado/invalido` → sigue escaneando ("apuntá al QR actual"); `no_habilitado` → aviso + salida. **Fail-open a propósito**: sin correo resoluble, sin red, o cámara denegada → se entra igual (un problema de datos/red no traba el turno); botón secundario **"No puedo escanear — entrar igual"**. Solo aplica al **operario** (supervisores/conteo no pasan por `goToOptions`). ⚠ **Dato pendiente**: para que el gate resuelva el correo por legajo, el **legajo** del operario tiene que estar en `planify.employees` **con correo** (hoy sólo 2 de 44 filas tienen correo). Si el legajo no resuelve ahí, se cae al correo de Google / `Empleados`; si ese correo tampoco está habilitado en `planify.employees`, la fichada in-app da `no_habilitado`. En resumen: hay que **cargar los correos en `planify.employees`** (es la lista maestra de la fichada). Backend: migración `fichadaqr_ficho_hoy_anon` (advisors sin hallazgos nuevos; `anon` puede la RPC de lectura pero NO `fichar`/`emitir_token` ni leer la tabla). Bump `APP_VERSION`/`SW_VERSION` a v5.53; funciones nuevas en smoke; checkhtml + suite verdes. El SW **no cachea** nada (borra cachés en `activate`), así que `jsqr.min.js` se baja de la red al abrir el lector — sin problema, fichar necesita red igual.
>
> Nota: **v5.52 — EA · Entrega Artículos para envasar (operario)**. Botón nuevo **EA** en la botonera del operario (`row3`, secundario, violeta `.box[data-code="EA"]`) que abre un modal directo (`showEAModal`, sin Enviar) para **dar de baja el stock del depósito `para_envasar`**. Resuelve el limbo detectado: el "Conteo Definitivo 2026-07" (8/7) movió 4 códigos de `racks` → `para_envasar` (**035E**=44, **439E**=84, **440E**=147, **584E**=424) y **ningún módulo de la app leía ese depósito** → quedaban invisibles (no aparecían en "bajar de racks" ni en ningún lado). El módulo es calcado del de "bajar de racks" pero: (1) lee el saldo de `para_envasar` **directo de `Movimientos_Stock`** (`deposito=eq.para_envasar`, agregado por código con `_cpNorm`) — ese depósito está **fuera de los 7 hardcodeados** de `stockComputeSaldos`/labels/OC, así que sigue **sin contaminar** los totales de Loeke; (2) baja en **cajas (inner)**, sin master ni ubicaciones; (3) es **baja DIRECTA** (no cola de aprobación como racks): al confirmar hace `stockMove` **`para_envasar −qty`** (`tipo='entrega_envasar'`, `ref='operario'`) y emite el evento **`EA`** por código (`texto = COD|qty`). Funciones `eaFetchStock`/`showEAModal`/`eaRender`/`eaChg`/`eaSet`/`eaConfirmar`/`eaEmitEvent` (~9767). Verificado headless 412px (los 4 códigos ordenados por código, stepper centrado; confirmar de 30 del 440E genera `para_envasar −30` + evento `EA 440E|30` + cierra) + checkhtml/suite verdes. Funciones nuevas en smoke. ⚠ Es baja **hacia afuera** (los artículos salen a envasar); si en tu operación tuvieran que ir a **góndola** tras envasar, hay que agregar un `+terminado` (follow-up ofrecido).
>
> Nota: **v5.51 — Estación de impresión: auto-print de remitos al TAP**. Pantalla nueva **🖨️ Cola de impresión** (`openPrintStation`, panel admin, al lado de "Consultar NP/Líos") pensada para correr en la **PC fija de la operadora** (al lado de la impresora). Un **toggle "Auto-imprimir remitos al terminar armado"** (`psToggle`, estado en `localStorage.ps_auto_virgilio` — **por dispositivo**, así solo esa PC imprime y los celulares nunca) prende un loop que cada **12 s** (`psPoll`) busca **eventos TAL nuevos** (NPs recién terminadas), trae la cabecera del PPP (`psPrintBatch`) y las **imprime solas** vía `remitoPrintDoc`. **Dedup por NP/día** en `localStorage` (`ps_printed_virgilio_<día>`) para no repetir ni al recargar; al prender por 1ª vez en el día **siembra** lo ya terminado (`psSeedTodayIfNeeded`, lo marca impreso SIN imprimir) para no volcar el día entero; cola **serializada** (1 hoja cada ~2.6 s, `psDrain`). Al recargar la página, si `ps_auto=1` **retoma solo** (setTimeout diferido en el boot). Log en pantalla con **Re-imprimir** por NP + botón **"Imprimir hoja de prueba"** (`psTestPrint`). **Cómo sale sin diálogo**: Chrome con **`--kiosk-printing`** + impresora **predeterminada de Windows** (decisión del dueño: impresora A4 láser/chorro + PC fija de la operadora → kiosk-printing, no hace falta QZ Tray). El navegador **no puede** elegir impresora ni saltear el diálogo por JS: se resuelve por cómo se corre Chrome, no por código. Verificado headless (pantalla OFF/ON, toggle, log con totales correctos 97950=58/13, cola serializada, `print()` no re-dispara). Funciones nuevas en smoke.
>
> Nota: **v5.50 — Remito de armado imprimible por NP (operadora)**. Botón **🖨️ Imprimir** en cada fila de **Consultar NP / Líos** (`openNpConsulta`, panel de la operadora) → abre un **preview** del remito y un botón "Imprimir" que manda a la impresora **solo esa hoja** (iframe aislado `remitoPrintDoc`, sin popup ni páginas en blanco del resto de la página). Layout (confirmado por el dueño, **opción a** = sin nombre de artículo, orden por código): **cabecera** (NP grande · Cod Cliente · Razón Social · Fecha Entrega · Tanda·cajas·líos) + tabla **Artículos** (`Cod` / `Cajas` / `Va en lío(s)` + fila TOTAL) + tabla **Líos** (`Lío` / `Composición`). Los datos salen de la fila de `_npcRows` que ya trae `resumen` (TAL), `cod`/`rs`/`fecha_entrega` (PPP) — **no** re-consulta nada. `armadoRemitoData(row)` parsea el resumen con `cpParseResumen`+`liosLabels` (rótulos agrupados A1/A2…), agrega por artículo (Σ cajas + en qué líos aparece, dedup) y arma la composición por lío; `armadoRemitoInnerHtml(d)` renderiza; `remitoPrintDoc(inner)` imprime. **Por ahora es MANUAL** (lo pidió así el dueño); el auto-print al **TAP** se hará después reusando estas mismas funciones. Verificado con NP real 97950 (58 cajas, 13 líos, 505→A1/A2, 520→F/G, orden por código) headless + `print()` dispara 1 vez + suite verde. Funciones nuevas en smoke.
>
> Nota: **v5.49 — RC · Pasar cajas a un pedido urgente (operarios)**. Botón nuevo **RC** en la botonera del operario (`row3`, secundario, borde naranja `.box[data-code="RC"]`) y dispatch directo (`if (code === "RC") { showRCModal(legajoStr); return; }`, sin pasar por Enviar; el evento `RC` lo emite el modal al confirmar). Resuelve: cuando un pedido **urgente** (sale antes) tiene faltante de un artículo, sacarle cajas a **otro pedido que sale después** (armado **o** pickeado). **Flujo** (`showRCModal`): (1) elegir el **urgente** — lista de `cpLoadFaltantes()` (Entregas con `cajas_falto>0`, no facturadas) **ordenada por `fecha_salida` ASC** (los que salen antes, primero); (2) la app **sugiere donantes** con ese mismo `cod_art` que salen después, pero **el operario elige cualquiera** (no impone) — donantes **armados** (`Entregas_Virgilio.cajas_entregadas>0`, otra NP) y **pickeados** (`Movimientos_Stock deposito=separar_pedidos`, neto>0 por `ref`/tanda + `fecha_entrega` del PPP), ordenados por fecha desc y disponible desc; (3) cuántas cajas (tope = `min(faltante, disponible del donante)`). **Al confirmar** (`rcConfirm`): RPC atómica **`reasignar_cajas(p_target_id, p_qty, p_donor_id)`** (urgente `cajas_falto−`/`entregadas+`; donante armado `entregadas−`/`falto+` → **queda con faltante + aviso**; `p_donor_id=null` si el donante es pickeado) · `stockMove` `a_facturar +qty` ref=NP-urgente y donante `a_facturar −qty` (armado) o `separar_pedidos −qty` (pickeado), tipo `rc` · **líos**: suma al urgente (`rcAddToLio`→`cpUpdateLio` lío nuevo) y descuenta del donante armado (`rcRemoveFromLio`, re-emite el TAL) · evento **`RC`** (`texto = NP|NPdonor o Ttanda|cod|qty`). Funciones `showRCModal`/`rcRender`/`rcRenderStep2`/`rcLoadDonors`/`rcPickUrgent`/`rcPickDonor`/`rcConfirm`/`rcAddToLio`/`rcRemoveFromLio`/`rcEmitEvent` (~10018). Verificado headless 412px (paso 1 lista ordenada, paso 2 donantes armado+pickeado + stepper centrado) + checkhtml/suite verdes.
>
> Nota: **v5.48 — Columna "Cajas Pedidas" (demanda) en la solapa Stocks**. En Stock y Compras → Stocks, por artículo se ve la **sumatoria de cajas pedidas** (la demanda del PPP), más un chip total **"Pedidas"**. Sale de `ocgDemanda()` (Σ cajas por artículo en los pedidos del PPP según la base de picking) — el mismo cálculo que la columna "Pedidos" del generador de OCs. Se carga en el `Promise.all` de `openStockAdmin` → `_stk.dem`, y se usa en `stkBodyStocks` (columna + total + se **incluyen artículos que tienen pedidas aunque no tengan stock** cargado, matcheando por `_ocgNorm`). Rendereado OK: 999 con 50 pedidas y 0 stock aparece; total = suma de todos.
>
> Nota: **v5.47 — Tabla de Facturación: scroll horizontal en vez de cortarse**. `.fac-table-wrap` tenía `overflow:hidden` → en pantallas más angostas que la tabla (`table-layout:fixed`, columnas suman ~1180px) las columnas de la derecha (Razón Social, Dirección…) se **cortaban**. Fix: `overflow-x:auto` + `-webkit-overflow-scrolling:touch` (mismo patrón que las otras tablas: ppp-tablewrap, cr-tablewrap, etc.). Verificado: a 400px `scrollWidth=1181 > clientWidth=374` → scrollea; en el monitor (1240px) entra sin scroll. Facturación se usa en monitor, así que el corte era sólo a ancho celular, pero ahora es prolijo en cualquier ancho.
>
> Nota: **v5.46 — Mismo fix del stepper a MG, Completar Pedido e Insumos**. Los steppers `− [n] +` de MG (`.mg-sb/.mg-inp`, góndola + excedente), Completar Pedido (`.cp-sb/.cp-inp`) e Insumos (`.ins-sb/.ins-inp`) tenían el MISMO problema que racks: los botones ± heredaban `margin-top:14px` de la regla global `button{}` y los inputs no tenían `box-sizing:border-box` (2px de borde → 4px más altos). Fix: `margin:0` en los `-sb` + `box-sizing:border-box;margin:0` en los `-inp` (ya tenían flex-center). Verificado por medición: el stepper de CP quedó con −/input/+ al mismo `top` (235,235,235). checkhtml + suite verde. Queda pendiente (ofrecido): un barrido general de otras botoneras afectadas por `button{margin-top:14px}`, y la tabla de Facturación cortada en celular.
>
> Nota: **v5.45 — Stepper de racks: el fix de v5.44 quedó a medias (la causa REAL)**. Los botones − / + seguían **14px más abajo** que el "0". Medido: contenedor `.rkb-stp` = 60px (no 46), botones con `margin-top:14px`. Causa: la regla **GLOBAL `button { … margin-top:14px; width:100%; padding:16px }`** (index.html:25-31) — mi CSS de `.rkb-sb` sobrescribía width/padding/font pero NO el margin. Fix: **`margin:0` en `.rkb-sb`**. Verificado: −, input y + ahora al mismo `top` (contenedor 46px). ⚠ **Esa regla global pisa a TODOS los `<button>`** — cualquier stepper o botonera nueva tiene que overridear `margin` (varios ya lo hacen con `.xxx button{margin-top:0}`, ver líneas 279/2007/2157). Al emparejar los steppers de MG / Completar Pedido, agregarles `margin:0` a sus botones ± también.
>
> Nota: **v5.44 — Estética: stepper de racks (bajar del rack) parejo**. El `.rkb-inp` tenía `border:2px` **sin** `box-sizing:border-box` → medía 50px de alto mientras los botones `.rkb-sb` medían 46px, quedando 4px más bajos (se veían "no centrados con el número"). Fix: `box-sizing:border-box` en el input (misma altura) + `.rkb-sb` a flex-center con `line-height:1` (signo − / + centrado en el cuadrado). Además el label de unidad (`master`/`cajas`) pasó de estar **a la derecha** del stepper a estar **arriba** (nuevo `.rkb-stpcol` columna), como pidió el dueño. Sólo CSS/HTML del render de `showRacksBajarModal` (test `racks-propuesta` sigue verde). ⚠ El "NaN m" que se vio en la captura del auditor de render era **dato de prueba del stub** (código 237 inexistente), NO un bug: con datos reales el chip del sector siempre muestra un número (`Number(innercajas)||0`, master exige `cxm>0`). Pendiente ofrecido: aplicar el mismo arreglo a los steppers de MG / Completar Pedido.
>
> Nota: **server-side (sin bump) — Alerta Telegram cuando en MG → "De los racks" una posición/artículo queda en 0**. Pedido del dueño. Se enganchó **dentro de la RPC `racks_plani_descontar`** (migración `racks_plani_descontar_alerta_rack_vacio`), que es la que descuenta la posición elegida al **PROPONER** la baja (`rkbConfirmar`, único call-site; NO se llama al aprobar → sin doble aviso). Dos avisos vía `tg_enqueue`: **(1) 📦 RACK LIBRE** cuando esa celda queda vacía (`innercajas ≤ 0`); **(2) 🚨 SIN STOCK EN RACKS** cuando el artículo llega a 0 en TODAS sus posiciones ocupadas (`sum(innercajas)=0`). Dedup con **bucket por minuto** (`rackpos0|sector|cod|YYYYMMDD_HH24MI` y `rackzero|cod|…`) para que un doble-tap no repita pero se re-avise si la celda se vuelve a vaciar. El nombre del artículo sale de `vista_nombres_articulos` (best-effort). ⚠ Dispara al **proponer** la baja (ahí decrementa la planimetría), no al aprobar — coherente con "cuando están poniendo MG". La lógica de descuento quedó **idéntica** (solo se agregó el aviso). Probado con rollback (DO block + `raise exception`) sin mandar nada real: 971E única posición → los 2 avisos; 598E vaciar 1 de 6 → solo (1); baja parcial → ninguno.
>
> Nota: **v5.43 — Auditoría de cálculo (3 auditores) + más truncados + cutoff robusto**. Tres auditores confirmaron que el NÚCLEO está sano (stock event-sourced conservado y front==server, ruteo/haversine, faltantes con signo correcto, timezone AR, divisiones m³/h todas con guarda). El problema era la misma clase de truncado que v5.41/42. Arreglados con `supaFetchAll`: (1) **Monitor Query C** (`~L14927`, traía TODAS las opciones de 10 días = >1800 filas → PostgREST cortaba en 1000 y **se caía HOY**: "empleados hoy", en jornada/cerrados y "últimos 5 días" daban mal) — ERA ACTIVO, confirmado por 2 auditores independientes; (2) **Monitor Query B** y (3) **`fetchProductivityData`** (EP/TP/AP/TAP — blindaje proactivo); (4) **Consulta NP/Líos** (`npcLoad`, Entregas por `np=in` podía pasar 1000 → faltantes por NP incompletos); (5) **`stockFetchSaldos`** (`vista_saldos_stock`, la usan MG/racks/insumos/CP/Cervantes — blindaje). (6) **`stockGetCutoff` normaliza el cutoff a ISO** (`_stkNormTs`): el valor cargado a mano `"2026-06-26 00:01:00-03"` (espacio en vez de `T`, offset sin `:00`) daba **Invalid Date en iOS Safari** → el corte se ignoraba y el front divergía de la vista. Test `tests/fac-npc.cjs`: el stub `J()` ahora manda `content-range` para `supaFetchAll`. ⚠ **PENDIENTES DE DECISIÓN del dueño (NO tocados)**: tope de `<24h` en `fetchMonitorDayStats` (`L11490`) descarta cierres cross-day (subestima m³); el Monitor NO descuenta faltantes pero el panel Rendimiento SÍ (dan distinto); aprobación de racks sin idempotencia (`racksAprobar` L9141 + `recepcion.js` L1082 — riesgo doble-movimiento, hay un −48 histórico en 583E de refs manuales); `stockBajaPicking` PKC sin acotar por tanda (`L10005`, latente); `FERIADOS_AR` sólo 2026; `facTodayKey` usa TZ del dispositivo; insumos mezcla unidades (Uni/Paq/Kg).
>
> Nota: **v5.42 — Más truncados de 1000 filas (misma clase que v5.41), auditados en toda la app**. Barrido de todos los `fetch` con `limit>1000` sin paginar: los que pegan a tablas que superan 1000 filas traían datos incompletos → cálculos mal. Arreglados con `supaFetchAll` (pagina con Range): (1) **`fetchVolumenArticulos`** (`Volumen_Articulos` ~2500 códigos → traía 1000) → **m³ por artículo incompleto** = m³ mal en TODOS los módulos (productividad, armado guiado, etc.); (2) **`prodLoad`** (Productividad): traía los eventos del período con `limit=100000` pero un rango de varios días supera 1000 eventos → productividad de cualquier período largo salía a medias; (3) **`fetchEntregadosMeta`** (`PPP_Entregados_Meta` ~2100 → 1000) = NP→cliente/razón social faltaba para ~1100 NPs en Recepción Remitos; (4) **`_pvFetchM3`** (`vista_tanda_m3`, 910 hoy) blindado antes de que pase 1000. Verificado que el resto de los fetches con limit alto están acotados por filtro de día/tanda/np-in (<1000): faltantesDeTanda, stockBajaPicking, fetchInconsEvents, fetchMonitorDayStats, npcLoad, CCN/TAL/CRN (esas tablas tienen <220 filas). ⚠ **Regla para adelante**: nunca confiar en `limit=N` para traer "todo" — PostgREST corta en **1000** (db-max-rows). Si la tabla puede superar 1000, usar `supaFetchAll(endpoint, query)`. Tablas hoy >1000: Registros_Produccion_Virgilio (13561), PKC (2656), Volumen_Articulos (2542), PPP_Entregados_Meta (2143); vista_tanda_m3 (910) al borde.
>
> Nota: **v5.41 — BUG GRAVE de stock: `stockFetchMovs` sólo veía los 1000 movimientos más recientes**. `stockFetchMovs` pedía `?select=*&order=ts.desc&limit=20000`, pero **PostgREST corta las respuestas en 1000 filas** (`db-max-rows`) sin importar el `limit`. Con **8880** movimientos en `Movimientos_Stock`, la app calculaba el stock event-sourced desde **sólo los ~1000 más recientes** (≈ últimos 2 días): perdía el `inicial` y el picking viejo pero conservaba el armado/facturado nuevo → **NEGATIVOS FANTASMA** en góndola/Pickeados/A facturar, que **empeoraban con el tiempo** (cada día la ventana de 1000 cubría menos). Confirmado: la ventana de 1000 daba EXACTO lo de la pantalla (510 → góndola −37, pickeados −196; totales −328/−1801/−444). **Fix**: `stockFetchMovs` ahora usa `supaFetchAll` (pagina con `Range` de a 1000 y trae TODO). Afecta a TODO lo que arma el stock: solapa Stocks, Conteo, Ajustes y el **generador de OCs** (`ocgEnter` también llama `stockFetchMovs`). Test `tests/fac-npc.cjs` (F5): con 1500 filas simuladas, `stockFetchMovs` devuelve 1500 (no 1000) y paginó. ⚠ **Corrige el diagnóstico de v5.40**: el Pickeados negativo NO era el corte "Marcá inicio" partiendo el par picking/armado (eso puede pasar pero no era el caso: el corte estaba en 26/06) — era **este tope de 1000 filas**. El "snapshot al Marcá inicio" que se había sugerido **ya no hace falta** para este síntoma. ⚠ **Patrón a revisar**: cualquier otro fetch que use `limit=20000` esperando traer todo y cuya tabla supere 1000 filas tiene el mismo bug latente (hoy TAL/Precios/OC_Maximos están por debajo de 1000, pero Entregas_Virgilio y otros pueden crecer). Usar `supaFetchAll` donde el volumen pueda superar 1000.
>
> Nota: **v5.40 — Stock "En vivo" vs "a una fecha y hora determinada"** (solapa Stocks de Stock y Compras). Como el stock es event-sourced, se agregó un selector: por defecto **🔴 En vivo** (saldo actual), y un `datetime-local` + botón **📅 A esa fecha/hora** que reconstruye el saldo **al momento elegido** contando sólo los movimientos con `ts ≤` esa fecha/hora (hora Argentina UTC-3). `stockComputeSaldos(movs, cutoff, asOf)` suma un tope superior `asOf` (el `inicial` sigue siendo baseline y siempre cuenta; el corte sigue como piso). Estado en `_stk.asOf`/`_stk.asOfInput`, funciones `stkAsOfControl/stkAsOfApply/stkAsOfLive`; el detalle por artículo también respeta el tope. Sólo aplica a la solapa Stocks (las otras siguen en vivo). Sirve para auditar la evolución del stock (p. ej. ver las cajas "en tránsito" en Pickeados en un instante dado). Test `tests/fac-npc.cjs` (F4): a la fecha entre picking y armado, Pickeados = lo pickeado; el `inicial` cuenta siempre. ⚠ CORREGIDO EN v5.41: los saldos NEGATIVOS fantasma NO eran el corte (ver v5.41) sino el tope de 1000 filas de PostgREST en `stockFetchMovs`.
>
> Nota: **v5.39 — Rótulos de líos agrupados A1, A2, A3… (no se gastan letras)**. Cuando un mismo artículo llena varios líos idénticos (mismo **cod Y cantidad**), en vez de ocupar letras seguidas (A, B, C, D) comparten **una letra base con sub-índice**: A1, A2, A3, A4. Los líos únicos quedan con la letra sola. Nuevo helper compartido **`liosLabels(lios)`** (usa la misma firma `_compLioSig` que el `_compLioGroups` del armado). Aplica en **ambos** lados: (1) **armado** → serialización `_compLiosResumen` y `cpBuildResumen` ahora emiten los rótulos agrupados; la vista "Editar líos" muestra el rango (ej. `A1–A4 · ×4`). (2) **Consulta NP/Líos** → re-rotula al vuelo (funciona también sobre TAL viejos guardados posicional A/B/C/D). ⚠ Al cambiar el rótulo, **Completar Pedido** ya no puede seleccionar el lío por letra: se pasó a **selección por índice** (`_cp.lioSel` = índice; `cpUpdateLio` toma `lios[idx]`). Test `tests/fac-npc.cjs` (F3): `liosLabels` da `["A1","A2","A3","A4","B"]` y `["A1","B","A2"]` (repetido no consecutivo), y `_compLiosResumen` da `A1=026x5;A2=…`.
>
> Nota: **v5.38 — Consulta NP/Líos: día de salida (PPP), día de armado, quién pickeó y quién armó**. Cada tarjeta suma una línea meta: **📅 Sale** (fecha_entrega de `PPP_Programacion_Diaria`), **🛠 Armado** (fecha del evento TAL), **📦 Pickeó** (legajo de los eventos **EP/TP** de la tanda — TP=terminó pisa a EP=empezó) y **🧰 Armó** (legajo del TAL). `npcLoad` ahora también trae los EP/TP de las tandas del corpus (`pickerByTanda`) y llama `getEmpleadosNombres()` (legajo→nombre, cacheado 1h); el buscador único también matchea por **nombre de operario**. Aclaración: los NP armados **antes** de v5.12 tienen TAL sin resumen (`NP|líos|tanda`) → se muestran "sin detalle de líos" (sólo se guardó la cantidad, no la composición; no es recuperable). Test `tests/fac-npc.cjs` extendido (salePpp/armadorLeg/pickerLeg + render de la línea meta + búsqueda por nombre).
>
> Nota: **v5.37 — Consulta NP/Líos: un solo buscador en vez de 5**. Los 5 inputs por-campo (NP · Tanda · Cod · Razón Social · Fecha) se reemplazaron por **un único buscador** que matchea contra **todos** los campos a la vez (incluye fecha ISO y dd/mm/aaaa, y la clase lío/etiqueta/retira). Multi-término separado por espacios = **AND** (ej. «osa 15/07» filtra por razón social Y fecha). `npcApply` ahora arma un `npcHaystack(r)` por fila y testea que cada término esté contenido; `npcClear` limpia el único input `#npcQ`. Regresión `tests/fac-npc.cjs` actualizada (busca por NP/RS/fecha/tanda y multi-término contra el mismo input).
>
> Nota: **v5.36 — Aviso de faltantes en Facturación + módulo "Consultar NP / Líos"**. Dos features. **(1) Faltantes en Facturación**: cuando una NP salió **incompleta** (`Entregas_Virgilio.cajas_falto > 0`), la operadora lo ve **antes** de facturarla. `facFetchFaltantes()` (nuevo, cache 30 s, va en el `Promise.all` de `facTick`) trae `Entregas_Virgilio?cajas_falto=gt.0` → `Map<np,{cajas,items:[{cod,falto,ped}]}>`. En `facRender`: la fila con faltante lleva clase `fac-has-falta` (fondo rosa + barra roja a la izquierda) y un badge `⚠ FALTA N cj: cód×falto…` en la celda Razón Social (`facFaltBadge`/`facFaltInfo`). Además, al tildar (`facTickNP`) una NP con faltante, **`confirm()` obligatorio** ("Faltaron N cajas… ¿facturar igual? Facturá por lo ENTREGADO, no lo pedido") — cancelar aborta el tilde. **(2) Consulta NP/Líos** (botón "🔎 Consultar NP / Líos" en el panel supervisor, `openNpConsulta`): modal `#npConsultaModal` para ver **cómo se compuso una NP a líos** y buscar en vivo por **NP · Tanda · Cod Cliente · Razón Social · Fecha**. `npcLoad()` trae **todo el corpus TAL** (opcion=TAL, un registro por NP, el más reciente — es chico, ~200 filas) y lo enriquece con `Entregas_Virgilio` (cod_cliente, fecha_salida, tanda, faltantes por `np=in.()`), `PPP_Programacion_Diaria` (razón social, fecha_entrega) y `PPP_Entregados_Meta` (cod/rs histórico). Filtra en el cliente (`npcApply`, `oninput`). El detalle de cada lío sale de parsear el `resumen` del TAL con **`cpParseResumen`** (reusado) → cada lío `A=cód×cant,…`, y los artículos **faltantes se marcan en rojo** dentro de la composición. Recordatorio del formato TAL: `texto = NP|líos|tanda|resumen|clase`, y `liosSend` hace `toUpperCase()` (por eso el separador queda `X` mayúscula, `(S)` para suelta). Regresión `tests/fac-npc.cjs` (badge + confirm-guard + carga/filtro/marcado de faltantes). Ninguna tabla nueva; todo read-only con anon key.
>
> Nota: **v5.35 — Switch en el admin para apagar el aviso "picking sin stock en góndola" (SSG)**. El dueño **no está cargando el stock inicial** todavía → cada picking da "había 0" para todos los códigos y dispara el aviso 📦🚨 **PICKEADOS SIN STOCK CARGADO EN GÓNDOLA** (trigger `notificar_picking_sin_stock_telegram`), puro ruido. (⚠ Se confirmó que **MG SÍ suma a góndola** — 2.927 cajas por `guardado` en 10 días; los ceros son por falta de stock inicial, no por un MG roto.) Fix: flag **`Stock_Config.alerta_sin_stock_gondola`** (`'1'` on / `'0'` off, **default OFF** mientras no hay stock); el trigger lo lee antes de notificar (migración `switch_alerta_picking_sin_stock_gondola`). En el cliente, **switch en el panel de supervisor** ("Reportes y configuración"): `loadSsgSwitch()` (lee el flag al abrir el panel, hook tras `show("supervisorPanel")`), `toggleSsgAlert()` (escribe con anon key, upsert `on_conflict=clave`, igual que el cutoff), `ssgSetSwitchUI()`. Cuando carguen el stock inicial, lo prenden. Regresión `tests/ssg-switch.cjs` (carga refleja el flag, toggle POSTea flipeado). ⚠ **Solo apaga el SSG** — los avisos de **faltantes** (`notificar_faltante_telegram`) y **sin planimetría** (`notificar_sin_planimetria_telegram`) siguen ON (pendiente si se quieren gatear con el mismo switch). (SW_VERSION venía desfasada en v5.30-vir por otra sesión; realineada a v5.35-vir.)
>
> Nota: **server-side (sin bump) — Telegram duplicado por TIMEOUT de pg_net (fix `tg_outbox_flush`)**. El dueño recibió **el mismo aviso ~20 veces** ("🗺 SIN PLANIMETRÍA — Tanda C82A"). Causa: **1 solo** evento PSP y **1 sola** fila en `telegram_outbox` (dedup OK), pero el envío por **pg_net timeaba** (`net._http_response`: `status_code=null`, `timed_out=true`) **aunque Telegram SÍ entregaba** el mensaje. El flush trataba el timeout como fallo → `req_id=null` → **re-enviaba** cada corrida (attempts 0→60), duplicando. Fix en `tg_outbox_flush` (migración `tg_outbox_flush_no_reenviar_en_timeout`): (1) si la respuesta viene **`timed_out`** → se marca **`sent`** (no se reintenta: Telegram ya lo recibió); solo se reintenta ante **error HTTP real** (4xx/5xx). (2) si la respuesta **no está** en el rolling window de `net._http_response` (se purga rápido) y pasaron **>2 min** → también se da por **`sent`** (antes re-enviaba). (3) `timeout_milliseconds` 20000→**30000**. Se cortó el spam marcando la fila stuck (id 583) como `sent`. ⚠ Trade-off: un timeout REAL sin entrega quedaría sin reenviar (raro; un aviso perdido es mejor que 20 duplicados).
>
> Nota: **v5.34 — Corte TOTAL de Google Sheets: fichadas-monitor migrado + NP→cliente a Supabase + código muerto PPP eliminado**. (1) **`fichadas-monitor.html`** ahora lee 100% de Supabase: tiempos de `Fichadas_Historico`, roster/secciones de la tabla nueva **`Fichadas_Estructura`**. Las dos hojas de Google (respuestas del Google Form + pivot) se sincronizan **server-side** con `pg_cron` + extensión `http`: `sync_fichadas_respuestas()` (**job 25**, cada 2 min, respuestas→`Fichadas_Historico`, upsert idempotente por el UNIQUE `(ts_evento,email,evento)`) y `sync_fichadas_estructura()` (**job 26**, cada 10 min, pivot→`Fichadas_Estructura`, full replace). Fechas Hoy/Día Anterior se calculan en el cliente (hora AR); "Búsqueda Manual" es un `<input type=date>`. (2) **NP→cliente**: `fetchEntregadosMeta()` (Recepción Remitos) leía el histórico por gviz para el NP/COD/Razón — que **no** estaban en Supabase (`PPP_Pedidos_Entregados` solo tiene tanda+mt3). Nueva tabla **`PPP_Entregados_Meta`** (`np`/`cod`/`rs`, RLS SELECT anon) sincronizada por `sync_ppp_entregados_meta()` (**job 27**, cada 30 min); la función ahora lee de ahí. (3) **Código muerto PPP eliminado en `index.html`**: se sacaron los dos *backfills* que todavía caían al Sheet (en `enrichPickBase` y `faltEnsureBase` → ahora no-op), los tres dispatchers (`fetchMonitorSheet`/`fetchHistoricSheet`/`fetchPickingBase`) pasaron a **solo-Supabase**, y se borraron `fetchMonitorFromSheets`/`fetchHistoricFromSheets`/`fetchPickingBaseFromSheets`, las URLs gviz (`MONITOR_CSV_URL`, `MONITOR_HISTORIC_CSV_URL`, `PICKING_BASE_*`) y los helpers `parseCSV`/`monitorParseM3`/`dedupeHeaderCell`/`findMonitorHeader`. **`index.html` ya no contacta Google** (0 URLs vivas; smoke OK). ⚠ Al no haber caída al Sheet, si un NP no está aún en `PPP_Base_Pedidos` queda sin filas hasta que la macro lo sincronice (antes se rellenaba del Sheet). Crons de sync Sheet→Supabase activos: **25, 26, 27** (`select jobid,jobname,schedule from cron.job`).
>
> Nota: **v5.33 — `VolumenArticulos` migrado a Supabase + se cortó la conexión con Google Sheets**. (1) Nueva tabla **`Volumen_Articulos`** (`codigo` PK, `m3` numeric, RLS SELECT para `anon`) cargada desde la hoja `VolumenArticulos` con la **extensión `http` de Postgres** (`http_get` server-side, que sí alcanza Google — el sandbox de Claude NO). Se levantaron **los DOS bloques** código/m³ de la hoja → **2.542 códigos** (el parser gviz viejo leía solo el bloque izquierdo → perdía ~190 códigos "L" y otros; además descartaba los que no empezaban con dígito). En **13 códigos los dos bloques discrepan**; se guardó el valor del **bloque izquierdo** (el que la app venía usando): `035E`, `437E`, `438E`, `439E`, `440E`, `724`, `823`, `809E`, `7026803`, `7055800`, `7439900`, `7658800`, `7659800` — **revisar en la hoja cuál es el correcto**. (2) `fetchVolumenArticulos()` ahora lee de `Volumen_Articulos` por REST; se borró la constante `VOLUMEN_ART_CSV_URL`. (3) **`PPP_SOURCE` pasó de `"auto"` a `"supabase"`**: la app **ya no lee ninguna hoja de Google** — programación, histórico, base de pedidos y volumen salen 100% de Supabase. El código `…FromSheets` y las URLs gviz de PPP quedan **dormidos** (no se invocan) por si hay que revertir; se pueden borrar más adelante. ⚠ Sin caída al Sheet, la app **depende de que la macro Apps Script (Sheet→Supabase) mantenga PPP al día**; y `Volumen_Articulos` ahora se actualiza en Supabase (re-corriendo la carga `http_get`, o editando la tabla). **Pendiente aparte:** `fichadas-monitor.html` usa OTRO Sheet (pivot de fichadas), no tocado.
>
> Nota: **v5.32 — descarga diaria: una fila por cada picking/armado** (formato largo). Reemplaza el formato ancho de v5.31 (una fila por operario/día con columnas picking+armado). Ver punto (2) de la nota siguiente. El resto de v5.31 (m³ neto de faltantes) sigue igual.
>
> Nota: **v5.31 — m³ real descontando faltantes + descarga diaria en 📊 Rendimiento de operarios**. (1) **m³ neto de faltantes**: desde que se registran faltantes (evento `PKC` = `TANDA|CÓDIGO|ESPERADAS|REALES`; primer uso real **12-jun-2026**, prueba el 11-jun con legajo 1), el m³ acreditado por picking y por armado se **descuenta** por lo que faltó. Nueva `_pvFaltanteFactores(events, VolumenArticulos)` arma un **factor por tanda** = `1 − (volumen faltante ÷ volumen pedido)`, ponderando cada caja por su m³ de la hoja `VolumenArticulos` (código sin volumen → pesa 1 = proporción por cajas). `prodCompute(…, factorMap)` lo aplica en `m3of()` → afecta **todo el dashboard 📊 y las dos descargas**. Tandas **sin `PKC`** (antes del 12-jun, o pickeadas fuera del flujo guiado) quedan con **factor 1 = m³ completo**, así el descuento arranca solo desde que hay faltantes cargados. (2) Botón **"⬇ Excel × día"** (`prodExportCsvDiario`): **una fila por cada picking y cada armado** individual (por tanda) — ej. 5 pickings + 3 armados en un día = **8 filas**. Columnas: `Fecha; legajo; tarea; hora inicio; hora fin; mins otra tarea; minutos netos; mt3 reales; ritmo`. `minutos netos` = tiempo real dentro del envase (span − comida/otras tareas que cayeron adentro); `mins otra tarea` = span − netos; `mt3 reales` ya viene descontado por faltantes (el m³ se acredita 1 sola vez por tanda/día); `ritmo` = m³ ÷ (netos ÷ 60). El motor `_pvOperator` ahora devuelve `rows` (lista por envase con `ini/cli/net/m3`); `_prod` guarda `events`/`m3map`/`factorMap`. (3) Sin bump: cambió el **título del aviso de Telegram** de picking sin stock → ahora **"📦🚨 PICKEADOS SIN STOCK CARGADO EN GÓNDOLA"** (antes "PICKING SIN STOCK EN GÓNDOLA"), porque el stock de góndola todavía no se carga y el aviso no refleja una falta real; se editó la función `notificar_picking_sin_stock_telegram()` (trigger `trg_picking_sin_stock_telegram`).
>
> Nota: **v5.30 — MG "De los racks" ahora PROPONE (requiere aprobación de Marianela)**. El dueño reportó: la bajada de racks→góndola por **MG → "De los racks"** no aparecía en Recepción → **"Bajadas Racks → góndola"** para aprobar. Causa: había **dos** módulos operario: (a) el de las **OCs** (`showBajarRacks`/`brConfirmar`) crea una **propuesta** en `Racks_Bajadas` → va a la cola de Marianela → el stock se mueve al **aprobar** (`racksAprobarBaja` en recepcion.js: `racks−/terminado+`); (b) el de **MG "De los racks"** (`rkbConfirmar`, v5.15) movía el stock **directo** (sin aprobación) → nunca entraba a la cola. Fix (decisión del dueño): `rkbConfirmar` ahora **también propone** — arma filas `Racks_Bajadas` (`orden_id=null`, `cajas`=INNER [master×CxM], `estado='propuesta'`, `creada_por`=legajo), con fallback a `localStorage vir_racks_pend` si no hay red (igual que `brConfirmar`); **NO** mueve stock. El stock recién se mueve cuando Marianela aprueba en Recepción (la aprobación ya soporta bajadas sin `orden_id`). Se mantienen la baja en master, la planimetría viva (descuento de la celda) y el aviso RKX de "fuera de lista"; textos actualizados ("Registrar bajada", "Lo aprueba Marianela"). Regresión `tests/racks-propuesta.cjs` (verifica: NO llama `stockMove`, POSTea `Racks_Bajadas` con `estado='propuesta'` y cajas inner) en `run.sh`. ⚠ Revierte el "camino directo" de v5.15.
>
> Nota: **v5.29 — Los días intermedios cross-day tampoco cuentan FERIADOS nacionales**. Extiende v5.28: además de sábado/domingo, el conteo de días intermedios (`fetchMonitorDayStats`) saltea los **feriados nacionales** de Argentina, tomados de una lista **`FERIADOS_AR`** (Set de `"YYYY-MM-DD"`, definida cerca de `WORKDAY_END_HOUR_AR`). ⚠ **SOLO feriados** — los **"días no laborables" con fines turísticos** (puentes) NO van en la lista porque **en el depósito SÍ se trabaja** (decisión del dueño); en 2026 esos días son 23/03, 10/07 y 07/12 → cuentan como jornada. Los **trasladables** ya van con su fecha OBSERVADA (movida al lunes): Güemes 17→**15/06**, Soberanía 20→**23/11**. La fecha AR se saca con `new Date(dm).toISOString().slice(0,10)` (00:00 AR = 03:00 UTC → misma fecha). Fuente: `argentina.gob.ar/jefatura`. ⚠ **`FERIADOS_AR` HAY QUE ACTUALIZARLA CADA AÑO** (hoy solo tiene 2026); si no, en 2027 los feriados vuelven a contar (pero el finde se sigue salteando siempre). Verificado el algoritmo (feriado salteado / día no laborable contado / Güemes trasladado) + suite. ES2017-safe.
>
> Nota: **v5.28 — Los días intermedios de cierres cross-day NO cuentan sábado ni domingo**. En el reporte **"Mts3 × Hora"** (cross-day, `fetchMonitorDayStats`), un cierre que cruza días (ej. armado con AP el viernes y TAP el lunes) partía el tiempo en apertura + **días intermedios** + cierre, y cada día intermedio contaba como **una jornada completa** (`workH` = hora_salida − hora_entrada, default 9h). Como contaba TODOS los días, un armado de viernes a lunes sumaba **+1080 min** (sábado + domingo × 9h) que no se trabajaron. Fix: el conteo de días intermedios ahora recorre **día por día en hora AR** (`00:00 AR = 03:00 UTC` → `new Date(dm).getUTCDay()`) y **saltea `wd===0` (domingo) y `wd===6` (sábado)** — solo cuentan los hábiles. Es un cálculo (no dato), así que **corrige retroactivamente** C73A y todos los cierres pasados sobre fin de semana, y aplica a futuro. ⚠ **Feriados**: por ahora NO se contemplan (no hay lista de feriados) — un feriado en el medio seguiría contando como jornada; si molesta, se agrega una lista. Verificado el algoritmo (Vie→Lun=0, Jue→Lun=1, Lun→Jue=2, Vie→Mié=2) + checkhtml + suite. ES2017-safe (`let`/`for`, sin `??`/`?.`).
>
> Nota: **v5.27 — Aviso al pickear (EP) una tanda que NO está en el PPP del día**. Frena el error de agarrar la tanda equivocada en el segundo 0 (antes se detectaba recién en el monitor, "Tandas trabajadas que NO están en PPP", tras perder ~1h). Guard en `send()` (después del de AP v5.26, antes de encolar): si `opcion==='EP'` y hay texto, `await fetchMonitorSheet()` y si el mapa tiene tandas pero **no** contiene la tanda tipeada → `confirm("⚠ La tanda X NO está en la programación (PPP) de hoy… ¿seguro?")`; si cancela, **return** (no registra el EP). **Falla ABIERTO**: si no se puede verificar (sin red → `fetchMonitorSheet` tira/`size===0`) NO bloquea. **Solo EP** — el armado (AP) puede ir un día después, fuera del PPP del día, así que ahí NO avisamos. Regresión `tests/ep-ppp-warn.cjs` (no-en-PPP cancela→0 EP; acepta→EP; en-PPP→sin confirm; PPP vacío→sin confirm) en `run.sh`. Origen: caso real — Jhonny (104) re-pickeó **C69C** (tanda ya terminada el 3/7) creyendo que era **C72F**; se limpiaron los 18 eventos del re-picking (EP+PSP+16 PKC, sin TP → sin stock).
>
> Nota: **datos (sin bump) — Conteo Definitivo de racks cargado + 2 depósitos nuevos (#5)**. El dueño pasó `Conteo_de_Racks.xlsx` (hoja "Definitivo", conteo físico). **`Inner caja` = total inner** (= M.C.×CxM, sin sueltos) → se usa esa columna directo como saldo. Se cargó en `Movimientos_Stock` (`tipo='conteo_racks'`, `ref='Conteo Definitivo 2026-07'`, `unidad='inner'`), **reconciliando a exacto** (delta = conteo − saldo actual, con 0 negativos), en **3 depósitos**: **`racks`** (Loeke, 58 cód / **13.399** inner) · **`racks_ch`** (Chef, 3 cód / 840 — 712E/809E/437E) · **`para_envasar`** (4 cód / 699 — 035E/439E/440E/584E, el N°4 "Virgilio Art para Envasar" del Excel). ⚠ **Migración `movimientos_stock_add_racks_ch_para_envasar`**: el CHECK de `deposito` ahora admite `racks_ch` y `para_envasar` (antes 7 valores). **`Racks_Planimetria` refrescada** (full replace) con las celdas N°2: **134 filas** (101 con artículo, 23 `libre`, 10 `Pedidos`/`Cajas`), `emp` LK/CH. **Notas**: (1) `racks_ch`/`para_envasar` **quedan registrados en Supabase pero NO se ven en la app** — `stockComputeSaldos`, las labels (~8515) y el dropdown de ajustes (~8856) tienen los **7 depósitos hardcodeados**; por lo mismo **NO contaminan** los totales de Loeke ni el cálculo de OC (que solo leen terminado/racks/excedente/…). Si se quiere verlos, hay que sumarlos a esas listas. (2) **CxM**: 54 de 62 códigos **no están** en `Articulos Virgilio X Tallerista` → la app no tiene su `Cajas_x_Master` para mostrar master (se ven en inner); el conteo da el CxM real (Inner/M.C.) si se quiere poblar. **035E**: la tabla dice CxM=12 pero el conteo dice **4**. (3) Correcciones del conteo: `206E`→`260E` (transposición), `035E`/`439E`/`440E` mudados de `racks` a `para_envasar`, `712E` movido de `racks` a `racks_ch` (era Chef mal cargado), `363E`/`366E` (huérfanos viejos) a 0. Reemplaza el seed anterior (nota "Racks sembrado desde la planimetría", 53 cód/14.236 inner).
>
> Nota: **v5.26 — AP repetido sobre la misma tanda ya no duplica el evento**. Complemento de v5.25: si el operario aprieta **AP por costumbre** sobre una tanda que YA tiene armado abierto (`st.armado.active` y mismo código, comparación normalizada trim+upper), el `send()` **no encola un 2º evento AP** (evita el doble arranque que ensuciaba los tiempos) — solo **reabre el asistente** donde quedó y avisa "ese armado ya estaba abierto…". Si el código es **otra tanda**, sigue el flujo normal (armado nuevo). Guard al principio de `send()`, antes de armar/encolar el payload. Regresión en `tests/ap-resume.cjs` (misma tanda → 0 encolados + reabre; otra tanda → encola AP).
>
> Nota: **v5.25 — "Seguir armado": retomar el armado después de una pausa (sin re-mandar AP)**. El dueño reportó: el operario hace **AP** (empecé armado) de una tanda, después hace otra cosa (**PC comida**, etc.) y al volver "no lo deja continuar" — tenía que apretar **AP de nuevo**. Problema real: el asistente de armado (`showCompletarWizard`, Paso 1 Faltantes → Paso 2 Líos) **ya persistía** su avance (`_compPersist`/`_compRestore`, TTL 36h) y **ya se retomaba en el paso guardado**, PERO el único modo de reabrirlo era volver a tocar AP → mandaba **un 2º evento AP** (doble arranque) y, durante la pausa, el botón AP quedaba **deshabilitado** (regla: con cualquier toggle activo, EP/TP/AP/TAP se bloquean) y toda pista del armado desaparecía (la sugerencia "Armado pendiente" está DEBAJO del `getAnyToggleActive` que corta). El picking ya tenía su **"▶ Seguir picking"** ARRIBA de ese corte; el armado no. Fix: nuevo botón **"▶ Seguir armado tanda X · Paso N"** en `renderPendingSuggestion` (ámbar `#b45309`), puesto **arriba del corte de toggles** (se ve incluso durante la comida), que llama `showCompletarWizard(legajo, st.armado.value)` — reabre el wizard **en el paso guardado, SIN encolar/mandar AP**. Se muestra mientras `st.armado.active`; desaparece al TAP (que limpia el persist). Regresión nueva `tests/ap-resume.cjs` (visible con toggle activo, texto con "Paso 2", click llama al wizard, no aparece sin armado) chained en `run.sh`. NOTA: el armado guiado por m³/líos (`showArmadoGuide`, `ARMADO_GUIADO_ACTIVO`) sigue **apagado**; esto toca el wizard "Completar" que sí está vivo.
>
> Nota: **v5.24 — La ubicación del excedente (MG y picking) acepta letras Y números**. El campo de ubicación del excedente (dónde se guardó lo que sobró) no dejaba escribir números: el regex `[^A-Z]` los borraba y la validación exigía exactamente 3 letras. Ahora acepta alfanumérico (ej. **A12**, **AB12**): `mgRender`/`mgSetUbic`/validación con `[^A-Za-z0-9]`, `maxlength` 6, placeholder "A12", exige ≥1 carácter; mismo arreglo en el prompt del picking (`pkMarkExcedente`).
>
> Nota: **v5.23 — CP avisa "tandas pickeadas sin armar todavía"**. El dueño buscó la NP 97898 en Completar Pedido y no la encontró. Causa (NO era bug): el CP lee `Entregas_Virgilio`, que se llena **al terminar el ARMADO** (separar por NP → `_compSaveEntregas`), no en el picking. La 97898 (tanda C78A) estaba **pickeada** (TP 07:41, faltantes 550/573/870E) pero **sin armar** (0 TAL/TAP) → sin faltante atribuido a la NP → no aparece. Fix de VISIBILIDAD (el dueño confirmó que estos pedidos SIEMPRE se arman): nueva `cpLoadPickSinArmar()` — cruza los **PKC con faltante** de los últimos 3 días (`Registros_Produccion_Virgilio`) contra las tandas que YA tienen filas en `Entregas_Virgilio` (fetch acotado con `tanda=in.(...)`), y las que quedan (pickeadas con faltante pero no armadas) se muestran en un **cartel ámbar** arriba del CP: *"⏳ N tanda(s) pickeadas SIN armar todavía — sus faltantes aparecen al terminar el armado: C78A…"*. Así se entiende por qué una NP todavía no está, sin preguntar. Liviano (PKC ~cientos de filas/3d; 1 fetch de Entregas scoped). `_cp.pickPend` (4º del `Promise.all` de `showCPModal`), render en `cpRender` paso 1, CSS `.cp-pend`. Verificado headless (cartel con C78A/C69D) + smoke (suma `cpLoadPickSinArmar`).
>
> Nota: **Telegram menos disperso (2026-07-03, decisión del dueño)** — dos ajustes server-side sobre lo anterior: **(A) Faltantes AGRUPADOS por tanda**: `notificar_faltante_telegram` (trigger AFTER INSERT PKC) antes mandaba **1 Telegram por artículo** faltante (dedup `pkc_<client_id>`); ahora usa dedup **por tanda+día** (`pkc_<tanda>_<día AR>`), arma **UN mensaje con todos los faltantes** de la tanda (`⚠ FALTANTES — Tanda X · Legajo N` + lista `• Art…: puso R de E (faltan Z)`) vía UPSERT `on conflict do update … where status='pending'` (la lista crece mientras esté sin enviar), y **NO** hace flush inmediato. El envío lo hace el flush con un **DEBOUNCE de 3 min**: los mensajes `pkc_` salen recién 3 min después del último faltante (así junta toda la tanda). Blindada con `exception when others then null` → un fallo de Telegram **nunca** bloquea el registro del picking (trigger AFTER = rollback). Verificado: C69D pasó de **12 mensajes → 1**. (Los otros avisos de picking, `psp` sin-planimetría y `ssg` sin-stock, YA eran 1 por tanda — no se tocaron.) **(B) Agentes 3×/día**: el cron jobid 14 pasó de cada-2h-diurno a **`0 11,15,19 * * *`** = **08/12/16 AR** (mañana/mediodía/tarde). Migración `faltantes_agrupados_por_tanda` (incluye el debounce en `tg_outbox_flush`, que sigue con el horario silencioso 07–21).
>
> Nota: **cron (2026-07-03) — Agentes en horario DIURNO (basta de Telegram de madrugada)**. El dueño reportó avisos "muy dispersos y a cualquier hora". Diagnóstico (outbox real): salían mensajes a la **01:02 AR** — el cron **jobid 14 `generar-reporte-agentes`** corría **cada 2h las 24hs** (`0 */2 * * *` UTC → 21/23/**01/03/05**/07…/19 AR) y, como el `dedup_key` de las categorías es **por día**, al cambiar la fecha a medianoche la **primera corrida post-medianoche (01:00 AR)** re-mandaba las alertas persistentes sin resolver (`equiv_facturar` NP 97874, `falta_llego`, `ppp_error`). Fix: `cron.alter_job(14, '0 10-22/2 * * *')` → ahora corre **solo 07:00–19:00 AR** (10-22 UTC, 7 corridas). Las alertas que sigan abiertas re-pingan a las **07:00 AR** (arranque de jornada) en vez de la madrugada. Los demás jobs Telegram ya eran diurnos (08:00 falta-fact-hoy/anomalías, 10:00 outbox-salud, 18:00 falta-fact-mañana/rendimiento/reporte-diario, 19:00 resumen-agentes, Lun 08:00 semanal, Mié 08:00 OC-pendientes). **PERO el cron no alcanzaba**: hay alertas **event-driven** (no cron) que también mandan Telegram directo — `ppe` (trigger al cargar la PPP, ej. 04:36 AR) y los faltantes/`psp`/`ssg` en **tiempo real** cuando el operario pickea (ej. 07:30 AR). Fix definitivo: **HORARIO SILENCIOSO en el envío mismo** — `tg_outbox_flush` (jobid 10, cada minuto) ahora **solo MANDA entre 07:00 y 21:00 AR** (`v_hora_ar between 7 and 20`); fuera de esa franja los mensajes quedan `pending` y salen a las 07:00. Cubre TODAS las fuentes (cron, triggers, tiempo real), no solo el cron. La 1ª parte del flush (revisar respuestas en vuelo) sigue corriendo siempre. Migración `tg_outbox_flush_quiet_hours`; para mover la ventana, ajustar el `between`. **Nota**: los faltantes de las 07:30 son avisos REALES de un operario pickeando (correctos); si el dueño los quiere menos dispersos, opciones a futuro: agrupar faltantes por tanda (1 msg en vez de 1×artículo) o subir el inicio de la ventana. **Opcional pendiente**: frecuencia diurna de Agentes (cada 2h → 3×/día) o 1 digest.
>
> Nota: **server-side APLICADO (2026-07-03, al volver el conector Supabase)** — se ejecutó todo el backlog que había quedado en cola con el conector caído: **(1) Capacidad de góndola** (`sql/capacidad_gondola_final.sql`): `Capacidad_Gondola` 730 filas (LK+CH, +col `emp`) y **`Capacidad_Sector` 512 filas / 38.728 cajas** — el tope del generador de OCs ya usa los máximos reales del Excel (verificado md5 vs archivo). **(2) RPC planimetría viva** (`sql/racks_plani_viva.sql`): `racks_plani_descontar` aplicada + probada (descuenta inner de la celda y ajusta master proporcional; deshecho el test). **(3) Auditoría SE**: marcados **resuelto** los hallazgos de `Auditoria_Codigo` id 8/9/10/11/12 (los fixes de v5.17+v5.18); **8 funciones** con `search_path` pinneado (migración `pin_search_path_funciones`). **Quedan abiertos para decidir**: id 3 (9 vistas SECURITY DEFINER — lista en la nota), id 4 (bucket `remitos` con policy SELECT que permite listar), id 5 (backup horas sin RLS), id 7 (anon escribe ~100 tablas, tradeoff no-auth), id 13 (endpoint ART duplicado ≠ id 10). **(4) Fix alerta `error_envio`** (migración `fix_error_envio_antijoin_y_recuperados`, función `generar_reporte_agentes`): ahora **excluye por anti-join** los envíos cuyo `client_id` ya está en `Registros_Produccion_Virgilio` + dedup → **error_envio pasó de 5 filas (16 "veces") a 0** (eran 100% falsos positivos: los 12 client_id de 7 días estaban TODOS en Registros); nueva categoría **`envio_recuperado`** (info, 10 filas) para los que fallaron por red pero entraron. Backup del original en `sql/generar_reporte_agentes_original.sql`, versión nueva en `_v2.sql`. ⚠ Al correr `generar_reporte_agentes()` a mano, las categorías de OTRAS funciones (`equivalencia_facturar`/`falta_llego`/`faltante_articulo`/`evento_imposible`) quedan vacías hasta el próximo cron (jobid 14, cada 2h) — se reponen solas. **Verificación de los 5 "envíos fallidos" del tablero (legajos 237/104): los 11 client_id ENTRARON, 0 perdidos.**
>
> Nota: **v5.22 — Planimetría de racks VIVA en "Bajar de racks" + categoría "envíos recuperados"**. (1) **Planimetría viva**: el módulo operario racks→góndola ahora muestra por código **chips con sus UBICACIONES** (de `Racks_Planimetria`, orden por stock desc: "Z05 · 40 m" en master o "Y07 · 200 cj" en cajas) — sirven para **encontrar** la mercadería y marcan **de qué celda se baja** (preselecciona la de más stock; el operario toca otra si corresponde). Al confirmar, además del ledger, se llama **best-effort** la RPC **`racks_plani_descontar(p_sector, p_cod, p_inner)`** que descuenta inner de esa celda y ajusta master proporcional (clamp 0, solo filas `ocupado`, match por código normalizado). Sin esto la planimetría cargada el 30/06 moría con la primera bajada. `rkbFetchCxM` ahora devuelve `{cxm, locs}`; nuevos `it.locs`/`it.sec`, `rkbSetSec`, CSS `.rkb-locs`/`.rkb-loc`. **⚠ La RPC está en `sql/racks_plani_viva.sql` PENDIENTE de aplicar** (conector caído; la aplica el vigía) — mientras tanto el fetch de la RPC falla silencioso y solo corre el ledger (sin romper nada). Verificado headless (chips, preselección, cambio de celda, RPC con conversión master×CxM y cajas 1:1). (2) **`envio_recuperado`** agregado a `CATS` del tablero Agentes (📶 "Envíos con reintento (llegaron igual)", informativo): la llena el server cuando el vigía modifique `generar_reporte_agentes` — muestra los envíos que fallaron por señal pero entraron al reintentar, para leer el "mapa de wifi flojo" sin alarma falsa.
>
> Nota: **v5.21 — Sesión estable + ventana de 20hs (diagnóstico con workflow de 9 agentes)**. El dueño reportaba "me saca de la sesión al refrescar o a veces ya logueado" y pidió sesión de ~20hs. Causas encontradas y fixes: (1) **🔴 `recepcion.js` PISABA la sesión Google**: creaba un 2º cliente Supabase **sobre la misma `storageKey`** default y, si al cargar no veía sesión (token vencido + wifi), hacía `signInAnonymously()` **encima** → sesión del supervisor destruida de verdad. Fix: el cliente de recepción pasa a **`storageKey: 'sb-hrxfctzncixxqmpfhskv-recepcion'`** propia + `detectSessionInUrl:false` (tampoco canjea el `?code` del callback OAuth ajeno). ⚠ NO tocar la storageKey del cliente PRINCIPAL: Cervantes hereda la sesión justamente por la key default compartida. (2) **Ventana de 20hs**: se reemplazó el corte por día calendario BsAs (`vir_auth_day`, deslogueaba a medianoche) por **`vir_auth_since` + `AUTH_MAX_MS` = 20h corridas** desde el primer login; se limpia en `signOutGoogle`/`endDaySignOut`. La sesión de operario por legajo sigue durando el día (a propósito). (3) **"Reconectando…" en vez de login**: `applyAuthState` distingue "no hay sesión" de "hay tokens en `AUTH_TOKEN_LS_KEY` pero el refresh falló (red)" → muestra estado Reconectando con botón DESHABILITADO y reintenta (offline: cada 5s sin límite; online: 3 intentos con backoff) — antes un refresh fallido mostraba login clickeable y un tap pisaba la sesión. (4) **Rol sin signOut por red**: `loadSupervisoresRemotos` ya NO cachea un Set vacío ante error (flag `_rolCheckFailed`, también en `resolveEmpleadoByEmail`); `showLoggedIn` con rol no-verificable por red muestra "Sin conexión para verificar tu cuenta — reintentando…" SIN `signOut` (antes borraba el refresh token de verdad para emails no hardcodeados). (5) **"Conectando…" por defecto**: `#googleSignInBtn` arranca `disabled` hasta resolver el estado; **failsafe 8s** que solo habilita el login si el cliente auth NUNCA arrancó (`__authClientReady`) — si está vivo con tokens guardados, cambia a "Reconectando…" sin habilitar. (6) **Mensajes honestos**: helper `authNoSesionMsg(base)` en los 19 avisos de escritura ("Iniciá sesión con Google…") → si `sbAuth.lastFailNetwork` dice red, muestra "Sin conexión — seguís logueado; reintentá"; `getAccessToken` reintenta 1 vez (1,5s) antes de rendirse. (7) El handler `onAuthStateChange` pasa a **por evento**: `TOKEN_REFRESHED` solo chequea la ventana de 20h (antes re-ruteaba TODA la UI cada ~1h), `SIGNED_OUT` → login. Verificado headless: sin sesión → login normal habilitado; con tokens+sin red (pasando el failsafe de 8s) → Reconectando, botón deshabilitado, tokens intactos; mensajes según causa. ⚠ **Config del dashboard Supabase (acción del dueño)**: JWT expiry 3600→**14400s**, Refresh token reuse interval 10→**60s**, "Enforce single session" **OFF**, Inactivity timeout **never** — sin esto la rotación del token con wifi inestable y varias pestañas puede seguir tirando sesiones cada tanto.
>
> Nota: **v5.20 — Envíos que fallaban por wifi: 6 fixes del pipeline de la cola (diagnóstico con workflow de 11 agentes)**. Origen: el tablero Agentes mostraba "Envíos que fallaron (operarios)" (CT/MG/PC/TAP/PKC, motivo network). Diagnóstico: **la mayoría eran FALSOS POSITIVOS** — la alerta cuenta filas de `Auditoria_Produccion_Virgilio` (log de intentos que se escribe al 1er fallo y cada 5) **sin cruzar** contra `Registros_Produccion_Virgilio`; con el reintento cada 3s los ítems casi siempre entran al toque (409=éxito). El único escenario de pérdida real: **Terminar Día** hacía un solo `flushQueue()` sin esperar y cerraba — sin señal, el operario se iba con la cola llena y sin aviso. Fixes cliente: (1) **`terminarDiaDrenarCola()`**: drena ~9s con espera (salta si `onLine===false`, sleep 400ms entre vueltas) y si quedan pendientes avisa con confirm "esperar / salir igual"; (2) **timeout de fondo 12→30s**: `trySendOneReport` gana 2º arg `timeoutMs` (los ~16 sends interactivos siguen en 12s; el flush de página y `SEND_TIMEOUT_MS` del SW pasan a 30s) — con wifi LENTO 12s clasificaba "network" y auditaba envíos que entraban con paciencia; (3) **`#pendingIndicator` global**: banner `position:fixed` abajo (arriba del versionBadge), visible en TODAS las pantallas (antes vivía dentro de `#legajoScreen`), tap = `flushQueue()`; (4) **re-registrar Background Sync** en la rama networkFail del flush (Chrome lo descarta tras ~3 backoffs y moría hasta el próximo encolado) + el listener `online` ahora también manda **`FLUSH_NOW`** al SW (handler que existía muerto en sw.js); (5) **espejar `attempts` a IDB** (`idbPut(cur[i])`) — página y SW llevaban contadores separados y duplicaban filas de auditoría ("9 veces" inflado); (6) **`reconcileQueueFromIDB()`** (+helper `idbGetAll` en la página): rescata ítems que quedaron SOLO en IDB (QuotaExceeded silencioso de LS), corre tras `migrateQueueToIDB` en el init. Verificado headless (banner fixed visible→drena→cola 0→banner oculto, sin confirm con red OK) + suite. **PENDIENTE server-side (en cola del vigía del conector)**: anti-join de la categoría `error_envio` contra Registros por `client_id` + dedup (el fix de mayor impacto: saca los falsos positivos del tablero).
>
> Nota: **v5.19 — Panel Administración: los 6 botones grandes en UNA fila**. Al sumar "Completar Pedido" (v5.05) los primarios pasaron a ser 6 pero la grilla seguía en `repeat(5, 1fr)` → "Recepción Remitos (RR)" caía solo a una 2ª fila (lo marcó el dueño con captura). Fix: `.sup-actions.sup-primary` pasa a **`repeat(6, 1fr)`**. En celular (≤680px) sigue 2 por fila (2×3). Verificado headless a 1720px: 6 botones mismo top, 202px c/u, sin overflow.
>
> Nota: **datos (sin bump) — llegó el Excel DEFINITIVO de capacidad de góndola (`Maximo_por_Estanteria.xlsx`) → `sql/capacidad_gondola_final.sql` (PENDIENTE de aplicar, conector caído)**. El Excel del dueño (730 filas: `Empresa|Sector|COD|Máximo`) **reemplaza** la transcripción provisional de fotos y cubre MUCHO más: **LK** A–J + **Ñ** (rotulado "LOKE"; se normaliza a LK) = 524 celdas con código, cap **38.728 cajas**, y **Chef (CH)** L/M/P = 152 celdas, **6.850 cajas**; 54 Libres; 13 con máximo en blanco. **Cotejo vs fotos: 324/338 exactas.** Correcciones que trae: **E10=225→50** (yo leí 40), **E15 NO es 225 → 337 (12) + 312 (40)**, **E18 sigue 550 (105)** (el tachado era al revés), **C10: el 6 era del 547** (071 queda sin máx), **G13/G14 = 823 sin máx** (no Libres), y **F09–F12 = 437E (30 c/u) / F13–F16 = 438E (16 c/u)** — las celdas de góndola llevan el **código real** (no el de cliente 029/030), consistente con el stock físico (v5.09). **Destino doble** (clave): la tabla **funcional** que lee la app es **`Capacidad_Sector`** (`sector,cod,cajas_max` — tope del generador de OCs vía `ocgFetchCapacidad` + solapa 📐) → va **SOLO LK con máximo** (512 filas; meter CH inflaría la suma por código); `Capacidad_Gondola` queda como **snapshot completo** (gana columna `emp`; incluye CH, Libres y sin-máximo). ⚠ El conector Supabase sigue caído → el SQL quedó **generado y commiteado**, correr entero al volver el acceso.
>
> Nota: **v5.18 — Limpieza de CSS muerto (auditoría SE, [baja]) + tests de regresión**. (1) **CSS muerto**: se re-derivó la lista con el agente `auditor-consistencia` (la original quedó inaccesible en `Auditoria_Codigo` por la caída del conector) y se borraron **102 reglas ≈ 10 KB / 65 clases** verificadas (0 usos estáticos/JS/dinámicos, cruzado index.html + recepcion.js + fichadas): grupos `cmpl-*` viejo (stepper de Cerrar lío, reemplazado por `cmpl-eg*/s*`), panel viejo de totales del monitor (`monitor-totales-side`/`totales-*`/`monitor-tot-*`, hoy `monitor-total-*`), leyenda del monitor (`monitor-legend`/`legend-*` + se quitó el vestigio `legendHtml=""`), `monitor-tab` (el monitor ya no tiene pestañas), `status-pend`, `incons-badge` (⚠ su elemento `#inconsBadge` no existe en el DOM — el JS que lo busca quedó no-op; si se quiere el badge de inconsistencias de vuelta hay que re-agregar el span), facturación vieja (`fac-group`/`fac-tanda-meta`/`fac-progress`), `row-4`/`row-5` (botonera usa `row-6`), `lios-row`, y muertas de los CSS inyectados (stk/oc/prod/ins/mg). **Vivas confirmadas** (dinámicas, NO tocar): `inc-row-alta/media` (`"inc-row-"+sev`), `prod-rol-arm/pick` (`"prod-rol-"+role`), `oc-pill`+estado, `ins-cod-sec`. La cirugía fue con parser CSS (reglas enteras + 1 selector parcial `.fac-group` sacado de una lista de comas), dry-run verificado contra el informe. (2) **Tests**: `tests/ocg-norm.cjs` NUEVO (regresión permanente del fix ALTA v5.17, encadenado en `run.sh`) y el smoke suma las **11 funciones** de los módulos recientes (MG chooser, bajar racks, CP, instructivo, equivalencias, zonas). (3) `sql/auditoria_se_pendientes.sql` NUEVO: queries preparadas para cuando vuelva el conector (marcar resueltos, vistas SECURITY DEFINER, search_path, bucket `remitos`, backups sin RLS, re-digest).
>
> Nota: **v5.17 — Fixes de la auditoría SE (los hallazgos de CÓDIGO)**. Se corrigieron los hallazgos de `Auditoria_Codigo` que viven en el cliente: (1) **[ALTA] Generador de OCs — normalización unificada**: `ocgEnter` cruzaba stock/demanda por `upper+trim` pero proyección/capacidad por `_ocgNorm` (upper + **sin ceros a la izquierda**), y las claves de `stockComputeSaldos` son el `cod_art` **crudo** → si el máximo decía `007` y el stock estaba como `7`, el stock daba **0 silencioso y se sobre-pedía**. Ahora **TODOS** los cruces usan `_ocgNorm`: el stock se re-indexa (`stockN`, sumando por clave normalizada), y demanda (`ocgDemanda`), proyección y capacidad se buscan por `codN`. Verificado headless con fixtures (007↔7: stock 60→pide 40; 066↔66 con tope de góndola: capped 30→pide 10). (2) **[media] Fechas sin tz**: `formatDateTime` (~3498) y el `todayStr` del monitor (~15326) ahora fuerzan `America/Argentina/Buenos_Aires` (en un dispositivo fuera de AR mostraban hora/fecha local). Los otros 2 lugares reportados ya tenían tz (corrimiento de líneas). (3) **[media] URL/KEY duplicada dentro de index.html**: el bloque de auth (~17118) usaba literales `SB_URL`/`SB_KEY` → ahora referencia las globales (`SUPABASE_URL`/`SUPABASE_KEY`, únicas en la página). `sw.js` y `recepcion.js` **siguen con copia propia a propósito** (worker / módulo aparte — al rotar la key hay que tocar los 3, ya avisado en el comentario de sw.js). (4) **[baja] Función muerta `_compLioReset`** eliminada. **Pendientes del backlog SE** (bloqueados: el acceso MCP a Supabase se cayó en la sesión): las ~33 clases CSS muertas (la lista exacta está en `Auditoria_Codigo`), los server-side (9 vistas SECURITY DEFINER, bucket `remitos`, search_path mutable, backup horas sin RLS, tradeoff no-auth) y **marcar `estado='resuelto'`** en `Auditoria_Codigo` de los 4 corregidos acá.
>
> Nota: **v5.16 — "Bajar de racks" baja en MASTER cajas**. El módulo operario racks→góndola (v5.15) ahora baja en **master cajas** (regla del dueño *"bajan en master siempre"*). Por cada código con **CxM limpio** (ratio inner/master entero y consistente, leído de la planimetría vía **`rkbFetchCxM()`**) el stepper va en **master** (tope `floor(inner/CxM)`, muestra "N master (X cj · ×CxM)"); al confirmar **convierte master→inner** (`racks −baja·CxM` / `terminado +baja·CxM` — el ledger sigue en inner). Los **9 no-limpios** (583E/598E/812E/404E/522E/582E/809E/817E/819E) y los **fuera de lista** caen a **cajas** (1:1, exacto) con la nota "master pendiente", hasta definir su master real. Verificado headless 430px (437E→122 master, 960E→48 master, botón suma el inner correcto: 5×6+2=32). `rkbFetchCxM` nuevo; `showRacksBajarModal`/`rkbRender`/`rkbChg`/`rkbSet`/`rkbConfirmar`/`rkbAddManual` ganan `it.cxm`.
>
> Nota: **stock (sin bump) — Racks sembrado desde la planimetría · guardado = INNER CAJAS (#5)**. Regla del dueño: *"cuando bajan, bajan en master cajas siempre"* → pero el **guardado** en el depósito **`racks`** de `Movimientos_Stock` va en **inner cajas** (igual que la góndola), porque el cálculo de OC (`stock = góndola+racks+excedente`, index ~7855) y la pantalla de Racks (~9005, `master = racks ÷ Cajas_x_Master`) ya **suman/convierten en cajas** → guardar master rompía el "a pedir". La regla se respeta a nivel **operación/vista** (opción B elegida por el dueño): el operario **baja en master** (el módulo debe convertir master→inner) y la pantalla **muestra master** (÷CxM). Seed: 1 ajuste por código (`tipo='ajuste'`, `ref='seed_planimetria_racks_inner_2026-06-30'`, **reversible**) para que `saldo racks = inner de la planimetría` (`Racks_Planimetria`, `ocupado`, LK+CH). **53 códigos**, total **14.236 inner** (583E=**526**, 584E=400, 598E=1992, 503E=88; reconcilió los negativos de las `baja_racks`). **4 huérfanos sin tocar** (saldo viejo, NO en la planimetría → revisar/zerar): 363E=6, 366E=4, 536E=15.67, 585E=60. **Estado de `Cajas_x_Master`**: seteado para los **limpios que ya tenían fila** en `Articulos Virgilio X Tallerista` (7: 035E/437E/438E/439E/440E/566E/584E — corrige los que estaban MAL, ej. 437E figuraba 7.17 → 3). **37 limpios más NO tienen fila** en el maestro → el módulo igual los resuelve con `rkbFetchCxM()` (planimetría). **9 no-limpios** (583E 8.09, 598E 11.65, 812E 7.92, 404E, 522E, 582E, 809E, 817E, 819E 1.41) → CxM real **a definir** (por ahora bajan en cajas). El módulo "Bajar de racks en master" ya está (✅ **v5.16**, ver arriba). ⚠ Pendiente menor: los **4 huérfanos** (revisar/zerar).
>
> Nota: **datos (sin bump) — Capacidad de GÓNDOLA + Planimetría de RACKS (#5, PROVISIONAL)**. Dos cosas distintas que al principio se confundieron:
> **(1) `Capacidad_Gondola(id, sector, cod_art, maximo, nota)`** = **capacidad (máximo de cajas) por celda de GÓNDOLA** (terminado), NO de racks. Fuente: las hojas fotografiadas (sectores A01…H09), columna **MANUSCRITA "Total de Cj por estantería"** = el máximo (NO la impresa "Cjas Total", que es un conteo y se descarta — aclarado por el dueño: *"el máximo son de góndola"*, *"manuscrito = máximo"*). **338 filas / 325 celdas**, capacidad total **28.067 cajas**. PK surrogada `id` (celdas con 2–3 códigos: A64/A67/A73/A78/C09/C14/C19/C20/G03/G19). **5 sin máximo**: A62 (rótulo en blanco) + los 4 **"T" discontinuados** (C15 581T/510T, C20 587T/502T = "DISCO"). Libres omitidas (A60/A65/A80/A83/C01/D35/G09/G13/G14). A revisar (anotaciones confusas en la foto): **E10** (era 337/312 → 225), **E15** (figuraba Libre → 225), **E18** (550 tachado → 224). ⚠ **PROVISIONAL** — el dueño pasará el Excel final. Sirve para topear "a pedir"/reposición de góndola. *(Reemplazó la tabla vieja `Racks_Capacidad`, que por error había cargado la columna IMPRESA.)*
> **(2) `Racks_Planimetria(id, emp, sector, cod_art, master_cajas, innercajas, estado)`** = **planimetría/stock real de RACKS**, de `PLANIMETRIA_racks.xlsx` (hoja DETALLE). **128 ubicaciones** (pasillos AA–AE, X, Y, Z, W, R), 103 ocupadas, 8 "PEDIDOS" (reservadas), 1 "EXCEDENTE", 23 vacías. **1642 master cajas / 14236 inner**. `emp` LK (121) / CH (4: 601E/809E/106E/439E). Códigos importados (E). Referencia: **NO** es `Movimientos_Stock`. Sirve para **sembrar/reconciliar el stock de racks** (los saldos `racks` de `Movimientos_Stock` están fraccionados/desparejos y con negativos 583E/584E/598E de las `baja_racks`). Ambas tablas: RLS ON + solo anon-SELECT.
>
> Nota: **v5.15 — MG pregunta QUÉ bajar + "Bajar de racks" (operario, directo) + alerta**. Al tocar **MG** ahora aparece un chooser (`showMGChooser`): **"📦 Lo que llegó (a guardar)"** (el MG de siempre) o **"🏗 De los racks"**. La opción racks (`showRacksBajarModal`/`_rkb`): lista lo que hay en racks **ordenado por código**; buscador; si algo físico **no figura**, **➕** para agregarlo → al confirmar avisa por **Telegram** (evento **RKX**, texto `COD|R<cajas>` → trigger `trg_racks_fuera_lista` → `notificar_racks_fuera_lista_telegram`, igual patrón que MGX). Si tipean un código que **no existe** pero sí su versión con **E** (583 vs **583E**), lo **sugiere** ("¿No será 583E?") — usa los saldos normalizados (`_cpNorm`). Al confirmar: `racks −` / `terminado +` (`tipo='baja_racks'`, `ref='operario'`). NO toca el stock de racks de fondo (se reconcilia con la carga inicial de racks, #5). Antes el racks→góndola era **solo admin-iniciado** (orden "OCs generadas" + aprobación de Marianela en la solapa 🏗 Racks); esto da el **camino directo para el operario**. Verificado headless (chooser, lista ordenada, sugerencia 583→583E). **Origen**: la alerta "guardado fuera de lista — Art 583" (era racks→góndola con typo **583** en vez de **583E**; el código 583 no existe). De paso se corrigió ese stock (las 48 cajas pasaron de "583" a 583E en góndola).
>
> Nota: **v5.14 — Instructivo de onboarding (#29)**. Botón **"❓ ¿Cómo se usa?"** en la pantalla inicial (`legajoScreen`, visible logueado o no) → modal con ayuda **breve por rubro**: 🛒 Picking (EP/TP), 🔨 Armado (AP/TAP + los 4 pasos del asistente: faltantes/clasificar/separar/líos), 📦➕ Completar Pedido (CP), 🏭 Recepción (RT/RR), 🚚 Carga y control (CC/CR), 📥 Guardar a góndola (MG), 🧰 Insumos y Cervantes (RI/EI/SC), ⏱ Pausas (AT/PB/Limp/Perm/PC/CT). Solo lectura, contenido **estático** (`showInstructivo`/`closeInstructivo`). Verificado headless. Cierra #29.
>
> Nota: **v5.13 — `Zonas_Barrios` (Supabase) → cliente (#37)**. `pppZonaDeBarrio` ahora **mergea la tabla `Zonas_Barrios`** (la misma que llena autozona) en su lookup: prioridad **override local > Supabase (`_pppZonaSupa`) > `PPP_BARRIO_ZONA` hardcodeado**. Así el **RUTEO** y el **SUGERIDOR** conocen los barrios nuevos (Suárez, Chilavert…) sin re-hardcodear — **completa el fix v5.04** (que solo arreglaba la detección de "sin zona" en el monitor, no el ruteo). `loadZonasBarriosRemote()` se llama al cargar (fetch `Zonas_Barrios?select=barrio_norm,zona`); la clave `barrio_norm` == `pppNormBarrio(barrio)` (NFKD + sin tildes + minúsculas, verificado). `_pppZonaSupa` declarado **antes** de `pppZonaDeBarrio` (evita TDZ, el patrón que cazó el agente SE). Verificado headless (Suárez/Chilavert resuelven, barrio desconocido → ""). Cierra la tarea #37.
>
> Nota: **v5.12 — Clasificar cada NP Lío/Etiqueta/Nada (wizard Completar)**. Después de **Faltantes** y antes de **Separar**, un **GATE**: por cada NP marcar **🎁 Lío** (clientes) · **🏷 Etiqueta** (súper) · **🚶 Nada** (retira). **Solo se marca** (sin cantidades, pedido del dueño). No se puede separar/armar hasta clasificar todos (botón "✓ Listo — separar" deshabilitado). **Etiqueta/Nada NO arman líos** (`liosDone=true` → en el paso Líos muestran "sin líos, ya marcado"); solo **Lío** arma líos normal. La **clase se guarda en el evento TAL** (campo 5: `NP|líos|tanda|resumen|clase`) para confirmar más adelante el patrón (lío=cliente / etiqueta=súper / nada=retira) y eventualmente auto-derivarlo. Botón "✎ reclasificar" arriba de Separar. Funciones `_compRenderClasif`/`_compSetClase`/`_compClasifDone`/`_compReclasif` + gate en `_compRenderSep` + rama en `_compRenderLios`; `liosSend` gana 6º arg `clase`; `compTerminar` valida `clasifDone`. Se hizo como **sub-estado del Paso 2 (Separar)** para no renumerar el wizard (3 pasos). Verificado headless (gate, etiqueta sin líos, clases registradas: 97874:lio / 97875:etiqueta). (Tarea #33.)
>
> Nota: **v5.11 — Cartel de equivalencia DENTRO del módulo de Facturación**. Además del Telegram (v5.10), el módulo de **Facturación** (`facRender`) ahora muestra, por NP que tenga un código de equivalencia, un **cartel naranja** debajo de la Razón Social: "🧾 Facturá **437E** (no 029)". Así Marianela lo ve **justo cuando va a facturar** (la factura se hace afuera de la app y va con el código real). Fuente: **vista nueva `vista_pedidos_equivalencia`** (`security_invoker`, une `PPP_Base_Pedidos` × `Equivalencias_Codigos` normalizando ceros), leída por **`facFetchEquiv`** (cache 60s, sumada al `Promise.all` de `facTick`) → `_facEquiv` (NP → `[{cod,real,nota}]`). Si un NP tiene varias (029 y 030), las lista todas. Verificado headless (cartel en el NP con equivalencia, nada en el resto).
>
> Nota: **v5.10 — Alerta "facturar con el código real" (equivalencias)**. Cierra el circuito de equivalencias: como la **facturación se hace AFUERA de la app** (ISIS) y debe ir con el código **real** (437E), no con el del pedido (029), hay que avisarle a Marianela al facturar. Función server-side **`reporte_agentes_equivalencia_facturar()`**: cruza `PPP_Base_Pedidos` (`pedido`,`articulo`) con `Equivalencias_Codigos` para los NP de la **programación actual** (`PPP_Programacion_Diaria`) que **NO** están facturados (no en `Facturacion_NP`), y avisa por **Telegram** ("🧾 FACTURACIÓN — cambiá el código: NP X facturá 437E (no 029)") + **tablero Agentes** (categoría `equivalencia_facturar`, severidad media). Encadenada al **cron de agentes** (jobid 14, cada 2h), dedup por el set de (np|cod) del día; SECURITY DEFINER + revoke anon. Cliente: categoría agregada al array `CATS` de `agtRender` (icono 🧾). El picking ya resuelve planimetría/stock (v5.08/5.09); esto cubre la **facturación manual externa**. ⚠ `PPP_Base_Pedidos` = `pedido`(NP) · `articulo`(código) · `cajas` (las líneas del pedido). Detectó/avisó NP 97874 y 97898 (029→437E).
>
> Nota: **v5.09 — Equivalencias: el stock que baja es el REAL (437E/438E)**. Completa la v5.08: cuando se pickea un código de pedido (029), `stockBajaPicking` ahora resuelve `029→437E` al agregar las cajas pickeadas (`byArt[equivResolve(art)]`), así la baja de góndola (y el "a separar") es del **código real 437E** — físicamente eso sale. El resto del pipeline (a separar → a facturar → facturado) es **code-agnostic** (mueve lo que hay en cada depósito **por tanda**, vía `_stockNetoDepTanda`), así que el 437E fluye solo sin tocar TAP/facturación. `equivResolve` es **idempotente** (un código ya real se devuelve igual), así que no rompe los picks normales. **Faltantes y facturación siguen con el código del pedido (029)** — son otra dimensión (lo que pidió el cliente), separada del stock físico. La alerta SSG "sin stock en góndola" ahora referencia el 437E si se queda corto. Verificado checkhtml/smoke. (Tarea #38.)
>
> Nota: **v5.08 — Equivalencias de código cliente→interno (029→437E, 030→438E)**. El cliente pide un código que **no es de depósito** (029) pero físicamente se levanta/manda otro (437E = colador 16cm importado). Por eso saltaba **"SIN PLANIMETRÍA"** (029 no está en `planimetria.js`; 437E sí, sector F09). Solución: tabla Supabase **`Equivalencias_Codigos`** (`cod_pedido → cod_real + nota`, anon select; seed 029→437E, 030→438E), cargada al cliente (`_codeEquiv`, claves normalizadas **sin ceros a la izquierda**). El picking **RESUELVE** `cod_pedido→cod_real` para: (a) **planimetría/ubicación** (`gOf` cae a `equivResolve` → 029 ubica en F09 del 437E), (b) **alerta "sin planimetría"** (`pkNotifySinPlanim` no marca si resuelve; los genuinamente ausentes sí), (c) **cartel naranja** en el paso de picking: "👉 Levantá el **437E** — Colador 16cm importado (el cliente lo pidió como 029)". El código **trackeado** sigue siendo el del pedido (029) para faltantes/facturación — solo se resuelve para ubicar y no dar falsa alerta. Helpers `_equivNorm`/`equivLookup`/`equivResolve`/`loadEquivalencias`. **PENDIENTE (a confirmar con el dueño)**: que el picking **descuente el stock del código REAL (437E)** en vez del pedido (029) — sustitución de stock en `stockBajaPicking`/PKC. Verificado headless (resolución + alerta). ⚠ La alerta vieja de Telegram no se borra sola (ya se mandó); deja de re-saltar.
>
> Nota: **v5.07 — Fix CP: el faltante completado NO desaparecía (RLS) + refresh en vivo**. `Entregas_Virgilio` solo tiene RLS **INSERT/SELECT** para anon (no UPDATE) → el PATCH de `cpReduceFaltante` que bajaba `cajas_falto` se **rechazaba en silencio** y el faltante seguía en la lista de CP (reportado: "lo completaron pero no desapareció"). Fix: **RPC SECURITY DEFINER acotada** `cp_completar_faltante(p_id bigint, p_qty numeric)` (resta `cajas_falto` / suma `cajas_entregadas` por id, clamp 0; `grant anon`) en vez de abrir un UPDATE general a la anon key. `cpReduceFaltante` ahora la llama (`POST /rpc/...`). Además **`cpConfirm` pasa a async**: espera la baja y **REFRESCA la lista** (ya no cierra el modal) → el completado **desaparece a la vista** + banner verde "✓ N caja(s) …" (`.cp-done`) y se pueden completar **varios seguidos**. Verificado headless (RPC llamada, re-fetch, item fuera de la lista, banner). Las columnas `cajas_*` son `numeric` (el JSON las muestra como string). Apaga la alerta #28 al llegar `cajas_falto` a 0.
>
> Nota: **v5.06 — Botonera jerarquizada (primarios grandes / secundarios chicos)**. El dueño separó la botonera del operario: **primarios** (quedan grandes, como siempre, = ~90% del uso) y **secundarios** (más chicos, uso puntual). **Primarios**: `row1` EP·TP·AP·TAP·CR·CC + `row2` RT·RR·MG (picking/armado + carga/control + recepción/guardado). Debajo, separador **"acciones secundarias"** y **secundarios** (clase `.box-sm`): `row3` RI·EI·SC·**CP** + `row4` AT·PB·Limp·Perm·PC·CT. **CP** (Completar Pedido, v5.05) pasó a secundario con un **borde verde sutil** (`.box[data-code="CP"]`) para encontrarlo. Render: `BOTONERA_SECUNDARIAS={row3,row4}` marca qué filas van chicas; el loop agrega `.box-sm` + `data-code`. Verificado headless 430px. (Tarea #32.)
>
> Nota: **v5.05 — CP · Completar Pedido (agregar cajas que llegaron tarde a una NP armada sin facturar)**. Botón nuevo **CP** en la botonera del operario (**4ª fila**, verde, full-width) y en el panel de **Marianela** (sup-action "📦➕ Completar Pedido", abre con legajo `0`). Resuelve el caso de la alerta #28 (`falta_llego`): cuando un faltante llegó por recepción (quedó en *a guardar*) y el pedido sigue sin facturar, se lo suma al pedido. **Flujo** (modal `showCPModal`, abre directo sin pasar por Enviar): (1) elegir el **faltante** (lista de `Entregas_Virgilio.cajas_falto>0`, NP no facturada, fecha ≤21 d), (2) **cuántas cajas** llegaron (tope = lo que faltaba), (3) **de dónde salen** (Tránsito=`a_guardar` / Góndola=`terminado`, muestra el saldo de cada uno), (4) **a qué lío** va — chips con los líos actuales del pedido (leídos del TAL: `A=535X3;B=542X4…`) **o** 🆕 lío nuevo. **Al confirmar**: `stockMove` origen `−qty` / `a_facturar` `+qty` (tipo `cp`, ref=NP) · evento **`CP`** (texto `NP|cod|qty|GONDOLA|AGUARDAR|lío`) · **re-emite el TAL** del pedido con el lío actualizado (gana el más reciente) · **baja `cajas_falto`** (y sube `cajas_entregadas`) en `Entregas_Virgilio` por id → cuando llega a 0 **apaga la alerta #28**. Funciones `showCPModal`/`cpRender`/`cpRenderStep2`/`cpConfirm`/`cpUpdateLio`/`cpReduceFaltante`/`cpParseResumen`/`cpBuildResumen` (~9293). Parser de líos robusto (multi-item + sueltas `(s)`, separador `X`, letras A–Z luego `L27…`). Verificado headless 430px (paso 1, paso 2 con líos, paso 2 sin líos) + checkhtml/smoke verdes. **Pendiente**: cap de cantidad = lo que faltó (no permite agregar un código que no era faltante — caso raro, follow-up si hace falta).
>
> Nota: **v5.04 — Fix "la PPP no toma la zona nueva" (falsos SIN ZONA)**. El monitor PPP marcaba pedidos **SIN ZONA** (y los mandaba por Telegram vía PPE → `notificar_ppp_error_telegram`) usando **solo** el mapa de barrios del **cliente** (`pppZonaDeBarrio` → `PPP_BARRIO_ZONA` + overrides locales), **ignorando la columna `zona` que Supabase ya completó** por autozona (trigger `trg_ppp_autozona` + tabla `Zonas_Barrios`). Como veníamos agregando barrios a **Supabase** (ej. **José León Suárez**, Chilavert, Villa Sarmiento…) pero **no** al mapa hardcodeado del cliente, salían **falsos "9 SIN ZONA"** aunque en la PPP real (Supabase) **todos** tenían zona. Fix en `_pppComputeErrors` (index.html): "sin zona" **solo** si NI el barrio (cliente) NI la columna `zona` de Supabase la resuelven (`if (!zb && !zCol)`); y "zona distinta" solo si ambas existen y difieren (`zb && zCol && …`). Verificado contra los 113 pedidos: 0 sin zona reales; la **única** tanda mezclada legítima es **C67A** (Retira + Super, fechas 01/07 y 13/07). **Pendiente (follow-up)**: el mapa del cliente sigue usándose para **rutear/sugerir** tandas → sincronizar `Zonas_Barrios` (Supabase) hacia el cliente para que el ruteo también conozca esos barrios.
>
> Nota: **server-side (sin bump) — Agente de Ingeniería de Software (#35), 1ª auditoría**. Se montó el sustrato del agente que "revisa el programa y Supabase para encontrar defectos/mejoras" (`sql/auditoria_codigo.sql`). (1) Tabla **`Auditoria_Codigo`** = backlog PERSISTENTE de hallazgos (`area` codigo/supabase/seguridad · `severidad` · `estado` abierto/resuelto/descartado · `ubicacion` · `huella` única para upsert al re-correr). Vive aparte de `reporte_agentes` porque `generar_reporte_agentes()` hace delete+rebuild cada 2 h y borraría los del SE. RLS ON sin policy anon (notas internas; el digest las lee como owner). (2) Función **`auditoria_codigo_resumen_telegram(p_enqueue)`** = digest de los ABIERTOS por severidad (🔴/🟡/🟢, ícono por área 🔒/💻/🗄) → Telegram (dedup diario); SECURITY DEFINER + revoke anon. La llama el agente recurrente (web scheduled trigger, opción A) al terminar su pasada. (3) **Arreglado en el acto** (holes claros, patrón ya autorizado): **14 funciones cron/trigger-only de Telegram/agentes** (`notificar_*_telegram` ×10, `notificar_outbox_salud`, `generar_reporte_agentes`, `reporte_agentes_faltante_articulo/recepcion_absurda`) eran ejecutables por la **anon key** → revoke public/anon/authenticated + grant service_role + search_path fijo (migración `lockdown_cron_telegram_agentes_functions`; verificado que ninguna se llama desde el cliente y que los triggers se disparan igual); y **`vista_productividad_diaria`** había quedado **SECURITY DEFINER** tras el rebuild con dedup (regresión) → vuelta a `security_invoker` (sus 2 base-tables son anon-SELECTables). (4) **Reportado** (sembrado en `Auditoria_Codigo`, sin tocar, 11 abiertos): 1 alta de código = **`ocgRecompute` normaliza códigos de 3 formas distintas y las cruza** (index.html:7728, `007`≠`7` falla silencioso); media = fechas sin `timeZone` UTC-3 (3481/14803), URL/KEY Supabase triplicada (16578 vs 3379 + sw.js), 9 vistas SECURITY DEFINER por revisar, bucket público `remitos` lista archivos; baja = ~33 clases CSS muertas, 1 función muerta `_compLioReset`, search_path mutable en ~9 funciones, backup de horas sin RLS, y el tradeoff no-auth (la anon key escribe ~100 tablas). **Nada de TDZ nuevo** ni reglas CSS duplicadas (verificado). Confirmaciones limpias no se siembran.
>
> Nota: **v4.99 + server-side** — (1) **Columna "Total Stock"** en Stock y Compras → solapa Stocks: suma por código de todos los depósitos (Góndola+Excedente+Pickeados+A facturar+A guardar+Racks), destacada después de Descripción (`stkBodyStocks`). (2) **Zona automática en la PPP** (`sql/autozona.sql`, server-side, NO toca la app): el Excel ya **no carga la zona** — Supabase la deriva del **barrio** vía trigger `trg_ppp_autozona` en `PPP_Programacion_Diaria` (completa `zona` cuando llega vacía, no pisa una cargada). Mapeo en tabla **`Zonas_Barrios`** (barrio_norm→zona, 33 barrios del histórico, 0 ambiguos). Normalización `_norm_barrio()` = minúsculas + **sin tildes** (translate áéíóúü→aeiouu) + espacios. Barrio nuevo no mapeado → sin zona → salta la alerta `ppp_sin_zona` → se agrega 1 vez a `Zonas_Barrios`. (3) **Carga manual de stock**: se cargó "a guardar" (16 códigos, 2661 cajas, ref `carga manual a guardar 29/06`) y se descontó góndola por esas cantidades (ref `descuento gondola…`); los que sobraban de antes (121/550) se pusieron en 0 con ajuste (sin borrar historial).
>
> Nota: **v4.97–v4.98** — v4.97: el cartel "diferente a la mesa" pasa a **acción secundaria** (más finito/clarito, no compite con el botón verde). v4.98: **alerta "llegó un faltante, completá antes de facturar"** (`sql/falta_llego.sql`, `reporte_agentes_falta_llego()`): cruza lo que llegó y quedó en **'a guardar'** (`Movimientos_Stock`, respeta el cutoff) con los **faltantes por pedido** (`Entregas_Virgilio.cajas_falto>0`) de NPs **armadas y SIN facturar** (no en `Facturacion_NP`), match por código normalizado (upper + sin ceros a la izquierda). Avisa por **Telegram + tablero Agentes** (categoría `falta_llego`, severidad alta), encadenada al cron jobid 14 (cada 2 h), dedup por el set de (np|cod) del día; SECURITY DEFINER con revoke de anon. ⚠ `Entregas_Virgilio.fecha_salida` es **TEXT** → comparar con `left(...,10) >= 'YYYY-MM-DD'`, NO castear a date (si no, el `exception when others` lo tapa y nunca alerta).
>
> Nota: **v4.93–v4.96** — **Pulidos de Separar por NP (estética + UX)**. v4.93: el diálogo "diferente a la mesa" pide **"Levantadas según picking" (fijo) vs "Levantadas real" (input)** y la app calcula la diferencia. v4.94–v4.95: tarjetas de código más altas (casillero limpio) y **sin tic** — tocar cualquier parte de la tarjeta la marca **toda en verde**. v4.96 (pasada a fondo): **fix del `button` global** (`margin-top:14px` + `padding:16px`) que se filtraba a los botones del módulo y descentraba el switch (7px abajo) y las flechas del header; ahora las **flechas del header** son redondas y centradas, el **toggle** Modo picking/Por pedido queda alineado, "Sin faltantes" es un **estado vacío centrado**, y las **celdas separadas de la matriz** son pastillas redondeadas. Solo CSS/HTML.
>
> Nota: **v4.92** — **"Diferente a la mesa" en el paso Separar (completa el módulo Separar por NP, en main)**. En la vista "Por pedido" hay un cartel naranja **"⚠ Hay un artículo diferente a la mesa"**: el AP/TAP reporta (de a 1 artículo) que algo NO coincide con lo que marcó el picking (EP/TP) — NO es su error, sólo avisa y sigue (no lo frena). Flujo: cartel → elegir el artículo (grilla de la NP) → diálogo **de más / de menos** + **¿cuántas cajas?** + si es de menos **¿hay en góndola?** (sí/no) + **← Volver**. Persiste evento **opcode NPD** (`texto="NP|cod|tipo|gond|qty|sale|tanda"`). **Stock**: sólo "de menos + sin góndola" devuelve `qty` a góndola (`terminado`, `tipo='ajuste'`, ref `picking_difiere`) para no quedar negativo; "de menos + sí" NO descuenta (ya lo hizo el picking); "de más" no toca stock (se vuelve a guardar a mano). **Alerta** server-side `reporte_agentes_picking_difiere()` (`sql/picking_difiere.sql`): Telegram (digest del día, dedup por set de eventos) + tablero Agentes (categoría `picking_difiere`), encadenada al cron jobid 14 (cada 2 h); SECURITY DEFINER con revoke de anon. Funciones cliente `_compDif*`. Verificado headless (pick → diálogo → góndola → resolve sin errores) + parseo del digest en SQL.
>
> Nota: **v4.91** — **Paso "Separar por NP" en el wizard Completar (AP/TAP)** [CORE]. Nuevo **Paso 2** entre Faltantes y Líos (Líos pasa a **Paso 3**): antes de armar líos, el AP/TAP separa la mesa (mezcla de varias NPs) por pedido. **Dos vistas con estado compartido** (`c.sep` por código×NP) + toggle estilo iOS: **"Por pedido"** (grilla de una NP, 3 por fila, chips para elegir NP con sus cajas pendientes) y **"Modo picking"** (matriz códigos × NPs, columnas Cod+Tot fijas, scroll horizontal). Contador **"📦 N en mesa"** = cajas sin separar (global). Botón verde **"🔨 Armar líos con lo separado"** → Paso 3 con la NP actual. **Sólo lo separado pasa a Líos**: el grid y las sueltas de Líos filtran por `c.sep`; si quedan códigos sin separar aparece **"↩ Volver a separar · faltan N cajas"**. `liosDone` exige separar + lío de TODO (Terminar no se habilita si falta separar). Funciones `_compSep*` (`_compRenderSep`/`_compSepPedido`/`_compSepMatrix`/`_compSepTap`/`_compSepArmar`/`_compSepMesa`), nav `_compGo` ahora 1/2/3 + `_compNav(±1)`, CSS `.csep-*`. Verificado headless con `_comp` sembrado (las 2 vistas sincronizadas + filtro de Líos + nav). **PENDIENTE (próximo commit en la rama)**: flujo **"diferente a la mesa"** (reportar error del picking de a 1 artículo → de más/de menos → ¿hay en góndola? → Volver) + alertas Telegram/Agentes + reglas de stock (no descontar si el EP/TP ya descontó; devolver a góndola si no hay; sobra = volver a guardar).
>
> Nota: **v4.90** — **Fix wizard Completar (AP/TAP): el botón "Terminar" ya no obliga a entrar al paso Líos**. `liosDone` (lo que habilita Terminar) se calculaba recién al entrar al **Paso 2 (Líos)** → al abrir el wizard quedaba sin calcular y Terminar arrancaba **deshabilitado**; si **agarró 0 / todo faltó**, Líos quedaba vacío pero igual había que tocar "→" para destrabar (reportado por Marianela, tanda C58B "no la dejaba terminar"). Ahora `_compBuildLiosData()` se llama **al abrir** el wizard (y en el restore si se guardó en Paso 1) → `liosDone` correcto desde el arranque (Terminar habilitado directo cuando no hay nada que separar en líos). Si se **cambia un faltante** en el Paso 1 se marca `_comp._liosDirty=true` y se rearma la data de líos al entrar a Líos / al Terminar (evita armar líos con cantidades viejas; `_compRecalc` deja Terminar deshabilitado mientras esté `_liosDirty`). Solo timing de cálculo, no cambia el flujo de armado.
>
> Nota: **v4.85–v4.89** — **Rediseño del paso Líos (tap-to-add)**: cuadrados que **suman al tocar** (sin botones +/−), botón "−" en la esquina para corregir, **líos compartidos sin mínimo** (ej. 4 cajas de un código + 1 de otro), "↶ Deshacer", el "+ suelta" pasa a una **solapa "📦 Sueltas"** (cada suelta = 1 lío de 1 caja), **agrupación por composición** (líos idénticos comparten letra y se muestran ×N), vista "Editar líos generados". Fila de controles contextual (Armando/Editar/Sueltas) en lugar del botón "Armar líos". *(Detalle fino pendiente de volcar al cuerpo de la guía.)*
>
> Nota: **v4.84** — **Ruteo de reparto (orden óptimo de paradas + Google Maps) + alerta de PPP sin zona**. (1) **Ruteo** (módulo nuevo): para los pedidos que entregamos NOSOTROS, arma el **orden óptimo de paradas por camión** y abre la ruta en **Google Maps** (la navegación la hace Maps → sin API de ruteo paga). Vive en **Facturación** (botón "🗺️ Armar ruta de reparto de mañana", al lado de "Terminé — Generar PDF", donde Marianela cierra el día). Reusa la lógica de camiones existente (`pppResumenHtml`): rutas fijas **Sur/Oeste=Z1+Z3+Z4 · Norte=Z5+Z6+Z7 · Centro=Z2**, tope `CAP=pppGetCfg().dayCap` (6) m³/camión. **Excluye Retira/Súper/Expo** (se entregan aparte; Expo=exportación, p.ej. Bolivia). Lee `PPP_Programacion_Diaria` (`direccion/barrio/zona/m3/razon_social`) con `fecha_entrega`=mañana. **Geocoding en el NAVEGADOR** (Nominatim/OSM, sin API key — el sandbox no sale a internet, por eso va en cliente), cacheado en **tabla nueva `PPP_Geo`** (`dir_key,lat,lng`; RLS anon select+insert, CHECK de lat/lng). **Optimizador**: nearest-neighbor + 2-opt con haversine desde el depósito **Virgilio 2788, CABA**; parte cada ruta en camiones ≤CAP m³ contiguos. Salida: paradas numeradas con m³ + km estimados + botón "Abrir en Google Maps" (waypoints en orden, ida y vuelta al depósito). Las direcciones que no geocodifican se listan aparte para corregir en la PPP. Funciones prefijo `_rt`/`ruteo` (`openRuteo`/`ruteoLoad`/`ruteoRender`/`_rtOptimize`/`_rtGeocode`/`_rtMapsUrl`). ⚠ El geocoding NO se pudo testear desde el sandbox (Nominatim bloqueado) — **verificar en el navegador real** la 1ª vez (geocodifica ~54 direcciones, ~1/seg, después cacheado). (2) **Alerta "PPP sin zona"** (`reporte_agentes_ppp_sin_zona()`, `sql/ppp_sin_zona.sql`): cuando llega un pedido a `PPP_Programacion_Diaria` **SIN zona** cargada (no se puede rutear ni asignar camión), avisa por **Telegram** (digest deduped por el set de NPs del día) + tablero **Agentes** (categoría `ppp_sin_zona`). Server-side, encadenada al **cron de agentes** (jobid 14, cada 2h) → salta aunque nadie abra el monitor PPP. SECURITY DEFINER con `revoke` de anon (mismo patrón de seguridad que el resto de las funciones Telegram).
>
> Nota: **v4.83** — **Pasada de estética celular + PC (rol diseñador, 3 auditorías headless)**. Se renderizaron todas las pantallas a 390/460/1280/1920px con Playwright (3 subagentes `revisor-render`: operario / monitor / admin) y se arreglaron TODOS los hallazgos ALTA + varios MEDIA. **Operario (celular)**: la **botonera EP/TP** ya no clipa la última columna a 390px (`.row-6/5/4` con `minmax(0,1fr)` + `.box-desc` con wrap; cajas con radio 10px); **Control Remitos** trunca la Razón Social para que el checkbox CONTROLADO no quede fuera de pantalla; **Picking** dejó de escalonar el header de 2 columnas (`.pk-big-row` a `flex-start`); los **CTA deshabilitados** (MG/Insumos/Cervantes/Bajar Racks) pasan de texto blanco ilegible (1.48:1) a gris AA (`:disabled{color:#64748b}`); headers de `.tanda-modal` no montan el título sobre "Cerrar"; el botón "Salir" (`.auth-logout-btn`) deja de verse default del browser. **Supervisor/Monitor**: **Inconsistencias** — las pastillas de día dejan de heredar `button{width:100%}` (eran 7 botones full-width apilados) → chips, contraste TV subido; **PPP** — el pill "¡VENCIDA!" no se monta sobre la meta (`.ppp-tanda-h` track de fecha a `minmax(120px,max-content)`), las solapas envuelven en celular; **Análisis** — el botón "Cerrar" gigante (heredaba width:100%) → `width:auto`. **Admin/Datos** (era 5/10 en celular): las tablas densas de **OC** (6) y **Conteo** (2) van en wrappers con scroll horizontal (`.oc-tblwrap`/`.stk-tblwrap`) → ya no se ocultan columnas decisivas (%, Falta, A pedir, Sueltas, ✕); las **solapas de Stock** scrollean; números a la derecha (tabular) en `stk-tbl-fit`/`oc-tbl`; header de Agentes con ellipsis + Cerrar fijo. **Causa raíz** detectada: el `button{width:100%}` global (línea 25) se filtra a pantallas de supervisor que no lo sobreescriben — se parchó por componente (no se tocó la regla global, es deuda conocida). Verificado headless (0 overflow, divs balanceados) + `checkhtml`/`smoke` verdes.
>
> Nota: **v4.82** — **Premios por área (solo pantalla admin 📊) + lockdown de seguridad Telegram + estética móvil**. (1) **Premios**: cada área tiene una **meta m³/h** donde el premio es 0%; el premio % de cada operario = **(su ritmo ÷ meta − 1) × 100**, con signo (negativo si está por debajo). Ej. meta Picking 1.6: 1.6→0%, 1.76→+10%, 1.44→−10%. Metas **editables** arriba del tablero (default Picking **1.6** · Armado **0.7**), persisten en `localStorage 'prod_metas'`. Badges verde/rojo en tarjeta resumida, expandida y tabla. **NO se manda por Telegram** (solo la ve el supervisor). Helpers `_pvMetas`/`_pvPremio`/`prodSetMeta`/`premioBadge`. (2) **Seguridad** (migración `lock_down_telegram_report_functions`): se revocó `execute` de **public/anon/authenticated** en las 5 funciones `SECURITY DEFINER` que mandan Telegram o fuerzan reportes (`tg_enqueue`, `reporte_diario_telegram`, `reporte_semanal_telegram`, `reporte_agentes_rendimiento_anomalo`, `reporte_agentes_zona_lista`) — quedan solo `postgres` + `service_role`; los crons siguen andando. La anon key (pública en index.html/sw.js) ya **no** puede inyectar mensajes al grupo. `_es`/`_h` con `search_path` pinneado. (3) **Motor confirmado**: las interrupciones en el medio de un envase (carga/movimiento/comida/recepción/etc.) **se restan** del tiempo de la tanda. El app las guarda como **par** (fila "open" sin `ts_inicio` + fila "close" con `ts_inicio→ts_cliente` = la duración real); el motor usa el `close` y lo descuenta del envase. Ej. `8:10 EP, carga 8:40→8:50, 9:10 TP` → **picking = 50 min** (no 60). Generaliza a N interrupciones (resta la unión). Único caso que quedaría en 60: una tarea tapeada sin "close" (sin duración registrada) — raro.
>
> Nota: **v4.81** — **Fixes de render en productividad (auditoría) + smoke ampliado**. `revisor-render` encontró 2 bugs de CSS en la pantalla 📊 y se corrigieron: (1) [HIGH] la columna **"Operario"** de la tabla quedaba alineada a la derecha porque `.prod-tbl td{text-align:right}` le ganaba en especificidad a `.prod-tdn` → se agregó `.prod-tbl td.prod-tdn{text-align:left}`; (2) [MEDIUM] el **sparkline** se estiraba feo con pocas semanas (2–4 barras desparramadas en los bordes) → `.prod-sp` pasa de `flex:1` a `width` fijo (30px) y `.prod-spark` usa `justify-content:flex-start`. Smoke verde: se sumaron `prodCompute`/`prodLoad`/`prodExportCsv` al array `need` (`tests/smoke.cjs`) para proteger el motor nuevo de productividad. Solo CSS/tests, sin cambio funcional.
>
> Nota: **v4.80** — **Alerta "zona lista" (≥1 m³) + reporte SEMANAL por Telegram**. (1) **Zona lista** (`sql/zona_lista.sql`, `reporte_agentes_zona_lista()`): cuando una **zona** junta **≥1 m³** de pedidos pendientes **SIN fecha** de entrega, avisa que conviene programar el reparto. Va al tablero **Agentes** (nueva categoría `zona_lista`, una fila por zona, en `CATS` de `agtRender`) + **Telegram** (un mensaje con todas las zonas, 1 vez/semana, dedup). **Excluye "Retira"** (el cliente retira, no hay reparto). Umbral 1 m³ (constante en el `HAVING`). Enganchada al cron de Agentes (cada 2h) después de los demás `reporte_agentes_*`. (2) **Reporte semanal** (`sql/reporte_semanal.sql`, `reporte_semanal_telegram(p_lunes, p_enqueue)`): **lunes 8:00 AR** (cron `reporte-semanal-telegram`, `0 11 * * 1` UTC), resumen de la semana que terminó: total del equipo (m³, armadas, pickeadas), mejor pickeando/armando (piso 5 tandas) y una **tabla monoespaciada** por operario con m³ pick/arm, ritmo m³/h pick/arm y **tendencia vs semana previa** (↑/↓/=). Reusa `vista_productividad_semanal`; tabla vía `parse_mode=HTML` (`<pre>`).
>
> Nota: **v4.79** — **Nudge de cerrar armados al Terminar Día + export Excel/CSV en productividad**. (1) En **"Terminar Día"**, cuando un **Armado/Picking** queda para arrastrarse al otro día, se muestra un aviso al operario (banner ámbar) para que lo **finalice hoy** si ya lo terminó: dejarlo abierto cruza la noche y rompe la medición del ritmo (el caso C57A cross-day). (2) Botón **"⬇ Excel"** (verde) en la pantalla 📊 que baja la tabla del período a **CSV** abrible en Excel: columnas Operario, Legajo, Picking m³, Armado m³, Picking m³/h, Armado m³/h, Tandas; separador `;`, **coma decimal** (es-AR) y **BOM utf-8** (acentos). Helper `prodExportCsv()`; nombre de archivo `productividad_<d1>_a_<d2>.csv`.
>
> Nota: **v4.78** — **Reporte DIARIO por Telegram (server-side)**. Cron `reporte-diario-telegram` (**18:00 AR** = `0 21 * * *` UTC) que manda al grupo un resumen del día (`sql/reporte_diario.sql`, `reporte_diario_telegram(p_dia, p_enqueue)`): producción del día (m³ picking+armado), **PPP pendiente** (m³ + pedidos) y hasta qué fecha llega (días hábiles) + lo sin fecha, **ritmo necesario** (pendiente ÷ días) y si la producción lo cubrió/sobrepasó/quedó corto, **días para terminar la PPP al ritmo real** (m³ armado/día), pedidos con fecha lejana (outliers > hoy+21d), y **rendimiento por operario del día** (m³ pick/arm + m³/h, solo quienes trabajaron). Decisiones del dueño: "cubrir lo proyectado" = contra el ritmo necesario; "días según PPP" = hasta la última fecha programada + lo sin fecha. **m³ volumen** = todo lo cerrado en el día (incl. cierres cross-day como C57A=10,3 m³); el **m³/h** usa solo cierres mismo-día válidos. Vista nueva `vista_productividad_diaria` + helper `_es` (formato es-AR). **Follow-up (mismo bump)**: el rendimiento por operario pasa a **tabla monoespaciada** (bloque `<pre>`, columnas Pick/Arm = m³ y Pk/h/Ar/h = m³/h) vía soporte **opcional** de `parse_mode` en el pipeline Telegram: columna `telegram_outbox.parse_mode` + 4º arg `p_parse_mode` (default null) en `tg_enqueue`; `tg_outbox_flush` lo agrega al body solo si está seteado (las demás alertas siguen en texto plano). Helper `_h()` escapa SIEMPRE el texto dinámico cuando se manda con `parse_mode=HTML`.
>
> Nota: **v4.77** — **Productividad: sacar la columna "% prod" de la tabla**. El dueño no le encontraba sentido al % productivo como número suelto (lo preguntó dos veces), así que se quita de la **tabla** (vista 📊 Tabla). El desglose visual "en qué se va la jornada" (en la tarjeta expandida) sigue mostrando la parte productiva con contexto. El orden por defecto de la tabla pasa de `pct` a **Tandas** (`_prodSort` arranca en `{col:"tandas", dir:-1}`).
>
> Nota: **v4.76** — **Alerta de rendimiento anómalo (Agentes + Telegram)**. Detector server-side `reporte_agentes_rendimiento_anomalo()` (`sql/rendimiento_anomalo.sql`), enganchado al cron de Agentes (cada 2h) después de `generar_reporte_agentes`. Marca operarios con **m³/h por rol** muy bajo o muy alto, por dos criterios: **relativo** (fuera de **0.45× .. 2.2×** la mediana del rol, solo si el rol tiene ≥3 operarios y el operario ≥8 tandas con m³) o **absoluto** (valores imposibles = dato roto: armado <0.12 o >2.0; picking <0.18 o >3.5 m³/h). Avisa en el tablero **Agentes** (nueva categoría `rendimiento_anomalo` en `CATS`) y por **Telegram** (1 vez/semana por operario, vía dedup). Se calcula sobre `vista_productividad_semanal` (últimas 4 semanas). Con datos limpios **no marca a nadie** (la banda es pareja); salta cuando algo se va de rango o se rompe el dato.
>
> Nota: **v4.75** — **Productividad: orden Picking primero, después Armado**. Solo orden de display: se reordenaron todos los pares (los rates de cada tarjeta, las columnas de la tabla, las secciones Pickers/Armadores, el resumen del equipo, "mejor pickeando/armando" y la nota) para que **Picking** vaya primero y **Armado** después, como pidió el dueño. Sin cambio de cálculo.
>
> Nota: **v4.74** — **Productividad: textos en vez de logos**. Se cambiaron los íconos 🔧/🛒 por las palabras **Armado** / **Picking** (en color: armado violeta, picking azul) en toda la vista — la gente no entendía los logos. Y la tabla aclara que **% prod** = parte de la jornada que estuvo armando/pickeando.\n>\n> Nota: **v4.73** — **Productividad: vista TABLA (ranking)**. Toggle 📇 Tarjetas ↔ 📊 Tabla. La tabla lista a todos en filas, ordenable por columna (nombre, 🔧 armado m³/h, 🛒 picking m³/h, tandas, % prod color-coded). Tocás un encabezado = ordena; tocás una fila = abre la tarjeta del operario. `_prodTab`/`_prodSort`, `prodSetTab`/`prodTabSort`. Sirve para comparar a todos de un vistazo.\n>\n> Nota: **v4.72** — **Productividad: resumen ultra-compacto**. La tarjeta colapsada es ahora UNA línea: nombre + solo el/los **m³/h** (armado y/o picking), sin tandas/m³/horas. Se abre al tocar. Pocos-datos van atenuados.\n>\n> Nota: **v4.71** — **Productividad: tarjetas resumidas al entrar**. Cada operario entra **colapsado**: solo el nombre + los dos ritmos (🔧 armado / 🛒 picking). Al **tocar** la tarjeta (o "Ver detalle ▾") se expande con el sparkline + el desglose tocable. Estado `_prodExpand` (vacío = todas resumidas; se resetea al recargar período); `prodToggleOp(leg)`. Hace el módulo mucho más rápido de escanear.
>
> Nota: **v4.70** — **Productividad: desglose tocable + nombres más grandes**. (1) Los títulos **🔧 Armado**
> y **🛒 Picking** ahora son un header grande (15px, en color) arriba del número. (2) Cada color del
> desglose "en qué se va la jornada" (Productivo, Carga, Recepción, Comida, Ocio, etc.) es **tocable**:
> abre un panel con **de qué se compone** ese tiempo. Productivo → lista de tandas (m³ + tiempo asignado);
> tareas → cada evento con hora, código/NP y duración; Ocio → los huecos (hora + duración). El motor ahora
> devuelve `detail` por bucket (`prodDetail`/`detailPanel`, estado `_prodOpen`). Sirve para auditar (ej.
> ver que una tanda "armada" estuvo 4h abierta, o en qué se fue la recepción).
>
> Nota: **v4.69** — **Productividad: los DOS ritmos por separado**. Cada operario muestra **🔧 armado** y
> **🛒 picking** como **valores distintos** (m³/h cada uno, con su propia flecha de tendencia) — antes
> mostraba solo el del rol primario. Si un operario no hace una de las dos, esa línea no aparece. El resumen
> del equipo suma un **"Ritmo del equipo · 🔧 Armado X · 🛒 Picking Y"** (suma/suma), y "mejor armando /
> mejor pickeando" se eligen por el ritmo real de cada actividad (no por el rol). El motor ya calculaba
> ambos por separado (`armM3/armTimeM3` vs `pickM3/pickTimeM3`); fue solo cambio de `prodRender`.
>
> Nota: **v4.68** — **Productividad: MOTOR evento-por-evento + selector de período** (reescritura del
> cálculo). El módulo 📊 deja de leer la vista semanal y ahora trae los **eventos crudos** del período que
> elijas (desde/hasta, o presets 7d/4sem/8sem) y los procesa en el navegador con las reglas que definió el
> dueño: (1) el **"envase" AP→TAP / EP→TP ES la actividad** — los **huecos dentro del envase** (en horario
> de jornada, menos otras tareas) cuentan como **armado/picking, NO ocio** (un armador, si no hace otra
> cosa, está armando; por eso es habitual dejar un armado abierto al otro día); (2) **ocio** real = jornada
> con nada abierto; (3) **borde IZQ**: tanda que cierra adentro pero empezó antes del período → se descarta
> de inicio-de-jornada hasta el cierre (no se mide); (4) **borde DER**: tanda que abrió y no cerró → se
> descartan sus huecos. Tareas secundarias con **tope** (un MG de 5h = botón olvidado); TAP/TP **sin tope**
> (cruzan noches; las noches se sacan al intersectar con la jornada real, primer evento→FJ por día). m³ por
> tanda desde **`vista_tanda_m3`** = `PPP_Pedidos_Entregados` (entregado) **+ `PPP_Programacion_Diaria`** de
> respaldo (sube cobertura 93%→96%; arregla tandas armadas-no-entregadas tipo C57A=10,3 m³). Motor en
> `prodCompute`/`_pvOperator`/`prodLoad` (matemática de intervalos, prefijo `_pv`). Validado contra el día
> real de Farias Juan (leg 8): armado 0,66 m³/h con los huecos contados; borde izq excluye la mañana hasta
> cerrar la tanda. ⚠ Los nombres salen SIEMPRE de `Empleados` (`getEmpleadosNombres`); no hay nombres
> hardcodeados. La vista `vista_productividad_semanal` (v4.67) queda de referencia, ya no la usa la app.
>
> Nota: **v4.67** — **📊 "Rendimiento de operarios" reescrito (dashboard de ingeniería industrial, 100%
> Supabase)**. El servicio `openProductividad` (botón 📊) deja de mostrar conteo de tandas y pasa a un
> tablero serio para evaluar el rinde. **KPI rector = m³/h por ROL** (armador vs picker, nunca cruzados;
> toggle a **min/m³**, estado propio `_prodToggle`, no el `_mtsHoraFmt` del monitor). Por operario:
> headline m³/h + **flecha de tendencia** (última semana vs promedio previo = "¿bajó el ritmo?"),
> throughput (tandas, m³, min/tanda, jornadas), **sparkline semanal**, y **desglose "en qué se va la
> jornada"** (productivo + carga/control/movimiento/comida/recepción/limpieza/otros repartidos + **esperas /
> sin registrar**) = los **motivos de la ociosidad** que pidió el usuario. Resumen de equipo (m³, tandas,
> mejor armador/picker). Nombres de `Empleados` (`getEmpleadosNombres`). La vista
> **`vista_productividad_semanal`** se reescribió (ver `sql/productividad_operario.sql`): m³ desde
> `PPP_Pedidos_Entregados` (NO el Sheet); **tiempo EFECTIVO por unión de intervalos** (descuenta solapes +
> topes por actividad para botones abiertos); **bucket por `ts_cliente`** (no `created_at` — el backfill
> metía 415 eventos de 14 semanas en una sola); **m³ solo sobre tandas con duración válida** (consistencia
> numerador/denominador). Invariante garantizado: `prod_eff ≤ all_eff ≤ jornada`. Datos reales:
> armado 0.46–0.49 m³/h, picking 0.61–1.24; % productivo 18–57% (los bajos = mucha carga/control, lo
> explica el desglose). Verificado headless a 430 y 900 px, ambos toggles, sin overflow. El **otro** módulo
> (📈 Análisis, que usa el Sheet) NO se tocó: conviven los dos.
>
> Nota: **v4.66** — **Toggle m³/hora ↔ min/m³ en "Mts3 x Hora"** (monitor). En el panel de productividad
> del monitor (tabla "Mts3 x Hora" por operario + las "Parcial" del equipo, en `renderMonitor`) hay un
> **switch verde** en la cabecera que cambia la vista entre **m³ por hora** (default) y **minutos por m³**
> (= 60 / m³h). Reusa los m³/h que ya se calculan con **horas REALES de cada actividad**
> (`computeClosureDur` descuenta los tiempos muertos / interrupciones) — NO recalcula nada, solo invierte
> el número. Estado global `_mtsHoraFmt`, `toggleMtsHora()` (refresca el monitor), helper `prodVal()`.
> ⚠ Nota de arquitectura: la lógica buena de productividad (descontar interrupciones + m³ por tanda vía
> `tandaM3` del sheet) vive en el **módulo que ya existía** (`openAnalisis` / monitor), NO en el servicio
> `openProductividad` que se agregó antes (ese usa `vista_productividad_semanal`, con duración cruda
> `ts_inicio→ts_cliente` — sirve para tendencia semanal de tandas, pero NO para min/m³ fino). Por pedido
> del usuario se dejan **los dos** módulos por ahora.
>
> Nota: **Token de Telegram** (2026-06-28) — el usuario **rotó** el bot token (BotFather `/revoke`). El
> nuevo quedó en **Vault** (`telegram_bot_token`). Se validó con `getMe` (200). Alertas online.
>
> Nota: **v4.65** — **Agentes: `faltante_articulo`** (señal de reposición). Categoría nueva (la 19):
> agrupa los faltantes de picking (PKC) **por artículo** en 30 días → "art X faltó N cajas en M pickings".
> Distinto de `faltante` (que es por tanda, 7 días): este dice **qué códigos reforzar / revisar en la
> compra**. Función auxiliar `reporte_agentes_faltante_articulo()` encadenada en el cron 14 (junto a
> `reporte_agentes_recepcion_absurda`). Datos reales: 15 artículos (945E, etc.).
>
> Nota: **v4.64** — **Briefing "qué hacer hoy"** arriba del tablero Agentes (servicio: asistente diario).
> En `agtRender`, antes del termómetro, un bloque **📅 Hoy** con: (1) **nudge del día** — miércoles
> "generá las OCs", martes/jueves "día de conteo" (`new Date().getDay()`); (2) **to-do accionable** armado
> del mismo reporte: facturar (falta_facturacion), controlar remitos (carga_sin_control), guardar a góndola
> (mg_pendiente), cerrar armados (armado_sin_terminar). Convierte el tablero pasivo en "esto es lo que
> tenés que hacer hoy". Sin datos nuevos (reusa el reporte). Verificado con render.
>
> Nota: **v4.63** — **Servicio nuevo: Productividad por operario** (primer "servicio" más allá de alertas;
> de la idea del agente predictivo). Botón **📊 Productividad** en la botonera del supervisor →
> `openProductividad` (overlay azul, mismo patrón que Agentes). Lee la vista nueva
> **`vista_productividad_semanal`** (`security_invoker`): por legajo y semana ISO (últimas 8, excluye
> legajos 0/1) cuenta **TAP=armadas** y **TP=pickeadas**, y la **mediana de min/armado** (de `ts_inicio`→
> `ts_cliente` de los TAP, filtrando duraciones 1 min–12 h para sacar los "se olvidaron de cerrar").
> `prodRender` muestra una tarjeta por operario con rol (Armador/Picking según qué hace más), la última
> semana y un mini-gráfico de barras por semana (violeta=armadas, azul=pickeadas, escala por-operario).
> Sirve para "ver quién rinde sin pararse al lado". Datos REALES: 5 meses de log; se ve la especialización
> (237 armador, 104/270 picking) y la velocidad (104 ≈14 min/armado, 8 ≈104). ⚠ **SUPERADO por v4.67**:
> ahora los m³ SÍ entran (desde `PPP_Pedidos_Entregados`, no el Sheet) y el KPI es m³/h por rol; el
> `prodRender` de tandas/barras se reemplazó por el dashboard.
>
> Nota: **v4.62** — **Agentes: pendientes que se traban + recepción rara** (de la investigación con agentes).
> `generar_reporte_agentes` sumó 5 categorías (ahora 18): **`mg_pendiente`** (mercadería en `a_guardar` sin
> subir a góndola >8 h — bloquea stock disponible), **`armado_sin_terminar`** (AP sin su TAP >24 h),
> **`pipeline_atascado`** (separar_pedidos/a_facturar sin avanzar >2 días — *future-ready*: esos depósitos
> todavía no se usan), **`excedente_estancado`** (excedente sin moverse >5 días — *future-ready*), y
> **`recepcion_absurda`** (recepción con cantidad ≤0 o muchísimo mayor a lo normal). Esta última además
> tiene **alerta Telegram inmediata**: trigger `trg_recepcion_absurda_telegram` en `Movimientos_Stock`
> (AFTER INSERT, tipo='recepcion'), umbral = `max(10× mediana del artículo, 1000)` o `delta≤0`. ⚠ El trigger
> está **blindado** (`exception when others then return new`) para NO bloquear jamás una recepción. La
> categoría `recepcion_absurda` se encadena en el cron (jobid 14) vía función auxiliar
> `reporte_agentes_recepcion_absurda()` (para no re-tipear la función gigante). El termómetro NO cuenta
> estas categorías (son "pendientes/rarezas", no errores de operario). `mg_pendiente`/`armado_sin_terminar`
> dan 0 en el sandbox (datos de prueba con legajo 0, excluidos) pero disparan con datos reales.
>
> Nota: **v4.61** — **Alerta "recibido sin planimetría" (RSP)**. Completa lo que en v4.60 quedó pendiente:
> ahora la **recepción** (`recepcion.js opEnviar`, tras grabar a `a_guardar`) chequea cada código recibido
> contra `window.GONDOLA` (la planimetría = planimetria.js + merge Supabase) y, si alguno NO tiene lugar,
> emite un evento `RSP` (`texto = remito|cod1,cod2`). Nuevo trigger `trg_recepcion_sin_planim_telegram`
> (función `notificar_recepcion_sin_planim_telegram`, opcion='RSP') → Telegram "📦🗺 RECIBIDO SIN
> PLANIMETRÍA". Ya aparece también en el tablero **Agentes** (categoría `sin_planimetria`, que une PSP de
> picking + RSP de recepción). Diferencia con PSP: PSP detecta en el **picking** (la tanda trae códigos sin
> sector); RSP detecta en la **recepción** (llegan códigos sin sector) — más temprano. (`recepcion.js?v=3.66`.)
>
> Nota: **v4.60** — **Agentes = espejo de TODO Telegram** (regla del usuario: "todo lo que va por Telegram
> también lo toman los agentes"). El reporte `generar_reporte_agentes` (cron c/2h) pasó de 6 a **13
> categorías**: se sumaron las que solo iban a Telegram → `excedente` (Movimientos_Stock, góndola llena),
> `carga_sin_control` (★ medido por **estado**: CCN cargado al camión sin su CRN de control >30 h, no por
> el evento CRA que casi no se emite), `mg_fuera_lista` (MGX), `picking_sin_stock` (SSG), `ppp_error`
> (PPE, último chequeo), `sin_planimetria` (PSP picking **+ RSP recepción**), `falta_facturacion`
> (entrega hoy/mañana con armado TAP sin `Facturacion_NP`). Además se **corrigió `faltante`**: ahora
> filtra `rea<esp` (antes mostraba PKC que NO eran faltante, ej. "puso 1 de 1"). El overlay `agtRender`
> lista las 13 con su color/ícono/hint, y el **termómetro de estabilidad** ahora cuenta los errores de
> operario reales (`error_envio` + `picking_sin_stock` + `carga_sin_control` + `mg_fuera_lista` +
> `error_app`), no solo crashes/envíos. Mapa completo de alertas Telegram ↔ categoría Agentes en
> `generar_reporte_agentes`. Pendiente: detección de "recibido sin planimetría" en `recepcion.js` (emite
> `RSP`, la categoría ya lo contempla). ⚠ Hallazgo de seguridad (de paso): el **token del bot de
> Telegram estaba hardcodeado** en `tg_outbox_flush()` — **✓ RESUELTO el 2026-06-28**: se movió a
> **Supabase Vault** (secreto `telegram_bot_token`); `tg_outbox_flush` lo lee con
> `select decrypted_secret from vault.decrypted_secrets where name='telegram_bot_token'` y, si no lo
> puede leer, **no envía** (los mensajes quedan `pending` y los levanta la categoría `outbox` de Agentes).
> Verificado end-to-end: envío de prueba a Telegram OK (HTTP 200). El `chat_id` default sigue en
> `tg_enqueue` (menos sensible). **Token de seguridad de Telegram = NO está más en el código.**
>
> Nota: **v4.59** — **Optimización: más código y CSS muerto** (sin cambio de comportamiento; sigue de
> v4.58). (1) Funciones: se removió `idbGetAll` (helper de IndexedDB sin caller en la página — el flush
> por `getAll` lo hace el SW) y el **modal standalone `showLiosModal`** (+ `_liosId`/`liosRender`/
> `liosClose`/`liosSave`), inalcanzable desde v4.03 cuando los líos se metieron en el wizard Completar.
> ⚠ Se **conservaron** `liosSend` (lo llama el wizard Completar) y `let _lios` (lo lee un guard de
> salida). (2) **CSS**: se borraron **73 reglas muertas** (~7,5 KB) de los 2 bloques `<style>` reales —
> restos de layouts viejos ya reemplazados: `fac-group*`/`fac-tanda-*`/`fac-progress` (Facturación),
> `monitor-totales`/`monitor-tot-*`/`totales-*`/`monitor-charts-col`/`day-box-clickable` (totales),
> `monitor-legend`/`legend-*`/`status-pend`, `monitor-tab*`/`incons-badge` (inconsistencias),
> `pk-fq`/`pk-fq-input`/`pk-prog`/`pk-sector-exc` (picking viejo), `ppp-res*`/`ppp-map*`/`ppp-prev*`/
> `ppp-subir-btn`/`ppp-over`/`ppp-diag-h`/`ppp-imp-row`, `recp-admin-frame`/`recp-choice*`/`recp-chooser`,
> `auth-user-*`, `comp-l*`, `lios-inp`/`lios-row`. Método: detector whole-word + guard anti
> concatenación-dinámica (ej. `inc-row-${sev}` se preservó) + chequeo de llaves balanceadas + smoke +
> render. Pendiente menor: ~15 clases muertas que viven en CSS inyectado por JS (`mg-*`, `ins-*`,
> `stk-ini*`). (`SW_VERSION` v4.59-vir.)
>
> Nota: **v4.58** — **Limpieza de código muerto** (auditoría de consistencia, sin cambio de comportamiento).
> Se removieron ~135 líneas sin uso de `index.html`: `readLastLegajo`, `closeCompletar` (duplicado exacto
> del cierre inline del wizard Completar), `toggleMonitorTV` (+ su botón `btnMonitorTV` que ya no existía;
> el modo TV se entra por otro lado), `pppMapProg`, y todo el **island de scaffolding de mapeo de la PPP**
> (`pppShowMapping`/`pppApplyMapping`/`pppRenderBase` + helpers `_pppGuessMap`/`_pppColSamples`/
> `_pppColLetter` + `PPP_FIELDS`/`PPP_MAP_KEY`/`_pppRawProg`) — restos del módulo PPP v2.95 "NO activado",
> reemplazado por `pppMapBase`+`pppBuildProg`. ⚠ El cluster `showLiosModal` (que la auditoría marcó muerto)
> **NO se tocó**: `liosSend` lo llama el wizard Completar y `_lios` se lee en un guard de salida — borrarlo
> rompía código vivo. **Pendiente detectado (no es limpieza)**: `pppSubir` (subir la PPP a Supabase con
> verificación, v4.55) **no tiene botón que lo llame** — la importación in-app hoy queda "solo local". Hay
> que cablearlo o decidir descartarlo. (`SW_VERSION` v4.58-vir.)
>
> Nota: **v4.57** — **Agentes = tablero de estabilidad** (hacia "soltar lo manual"). El objetivo del
> usuario es dejar de controlar a mano, pero para eso necesita ~2 semanas sin que los operarios marquen
> errores que hoy **no se ven**. Por eso el reporte de Agentes (`generar_reporte_agentes`, cron c/2 h)
> ahora suma 3 categorías y un termómetro: **`error_envio`** (📡 envíos de operarios que fallaron y
> quedaron en `Auditoria_Produccion_Virgilio`, últimos 7 días, excluye legajos 0/1 — "lo que hoy no
> ves"); **`faltante`** (🚚 faltantes de picking `PKC`, 7 días); **`oc_baja`** (📉 OCs con <50% recibido).
> El overlay (`agtRender`) muestra arriba un **termómetro de estabilidad**: cuenta tipos de error de
> operarios (`error_app` + `error_envio`) en 7 días → verde "✓ 0 errores … buena señal para ir soltando
> lo manual" / ámbar "⚠ N tipo(s) … revisalos antes de soltar lo manual". Se le aplica `artNombre` a
> `stock_negativo` y `oc_baja` (muestran descripción del artículo). **Además** se corrigieron los 3
> saldos negativos que había (222, 503E, 702E) con movimientos de ajuste en `Movimientos_Stock`
> (`tipo='ajuste'`, ref `fix-neg`) → 0 negativos. (`SW_VERSION` v4.57-vir.)
>
> Nota: **v4.56** — **Control de la PPP contra el espejo**. En el menú de importación de la PPP,
> `pppShowBaseInfo` ahora además **cuenta en vivo** lo que hay en las 3 tablas de Supabase
> (`pppRenderSupaCounts` → "🛰 En la PPP ahora: Base X · Programación Y · Entregados Z filas"), o sea **lo
> que cargó el espejo** (sync automático del Excel) o el último import. Así el supervisor ve si la PPP
> tiene datos y los puede cotejar contra el Excel antes/después de importar (complementa la verificación
> post-import de v4.55). Decisión del usuario: por ahora **sigue cargando en el Excel** (el espejo
> sincroniza); la carga manual sin Excel queda para más adelante.
>
> Nota: **v4.55** — **Validación de carga a la PPP** (hacia "eliminar el Excel"). La **doble vía** ya
> existía: picking y programación leen de Supabase (`PPP_Base_Pedidos`, `PPP_Programacion_Diaria`,
> `PPP_Pedidos_Entregados`) con fallback a Sheets, y el importador in-app (`pppSubir`) sube el Excel a
> esas tablas (DELETE+INSERT con el JWT del supervisor) — ⚠ pero `pppSubir` **hoy quedó sin botón que lo
> dispare** (ver la nota v4.58 más arriba); la carga real a la PPP la hace el espejo del Excel, no este
> importador in-app. **Lo nuevo** en v4.55: `pppSubir` ahora **verifica** que
> la carga realmente entró — después del INSERT re-cuenta en Supabase (`pppCountTable`, Content-Range
> con `Prefer: count=exact`) y compara contra lo que mandó: si coincide dice **"✓ VERIFICADO: N filas"**,
> si no, avisa **fuerte** ("⚠ subiste N pero quedaron M — algo falló"). Antes decía "✓ Listo" usando el
> conteo local (podía mentir si el INSERT fallaba en silencio). Pendiente (más grande, a confirmar):
> **carga manual** de picking/programación sin Excel (data-entry directo en el programa).
>
> Nota: **v4.54** — **Override de barrios mal escritos + tidy en errores** (sigue de v4.53). (1) Si un
> barrio viene con **typo** que no matchea ninguno conocido, ahora se puede **corregir**: en la celda de
> Zona de los pedidos sin reconocer hay un botón **✎** → `pppCorregirBarrioNp(np)` pide el barrio
> correcto (de la lista conocida) y guarda un **alias** (localStorage `vir_ppp_barrio_alias`, typo →
> barrio canónico). De ahí en más ese barrio toma **nombre canónico + zona** solo (`pppAliasResolve`
> lo consulta desde `pppZonaDeBarrio` y `pppLocDisp`). (2) El **display prolijo** (`pppLocDisp`) se
> aplicó también en los **mensajes de error** de la PPP (antes mostraban el barrio crudo). Nota: "barrios
> sin mapear en Agentes" NO se hizo: el reporte de Agentes corre en el server (cron) y el diccionario de
> barrios vive en el front — se surfacean y corrigen en la PPP misma (el ✎ + el desplegable de zona).
>
> Nota: **v4.53** — **Barrio/Localidad prolijo en la PPP**. Aunque en el Excel venga en MAYÚSCULAS, con
> acentos raros, paréntesis o variantes, ahora se muestra lindo: `pppLocDisp(s)` → si el barrio es
> **conocido** (está en `PPP_BARRIO_ZONA`, ~85) devuelve el **nombre canónico Title Case** (con acento
> donde corresponde, ej. `MORÓN`/`moron` → *Morón*, `JOSE C PAZ` → *José C. Paz*, `NUÑEZ` → *Núñez*);
> si **no** lo conoce, lo pasa a **Title Case** respetando conectores (`de`/`del`/`la`…) y preservando
> acrónimos cortos en mayúscula (`(CABA)`, `GBA`). Se aplica solo al **display** de las filas
> (`escapeHtml(pppLocDisp(p.localidad))`); el **matcheo de zona NO cambia** (sigue con `pppNormBarrio`
> sobre el crudo). Typos que no normalizan a un barrio conocido se ven en Title Case pero no se
> autocorrigen (para eso sirve el override de zona ya existente).
>
> Nota: **v4.52** — **“🤖 Agentes” pasó a botón propio** (no más solapa de Stocks). Botón en el panel de
> supervisor (sección *Reportes y configuración*) → `openAgentesAdmin()` abre un overlay propio
> (`agentesAdminOverlay`, header teal) con el mismo reporte. Funciones: `openAgentesAdmin` /
> `closeAgentesAdmin` / `agtFetchReporte` / `agtRender`. El backend (tabla `reporte_agentes` + cron)
> no cambió.
>
> Nota: **v4.51** — *(movido a botón en v4.52)* **Solapa “🤖 Agentes”** en *Stock y Compras* (2da, después de Stocks): **reporte de
> cosas para mirar**. Lee el snapshot `reporte_agentes` (tabla curada, SELECT anon — NO expone las
> tablas crudas) que genera la función `generar_reporte_agentes()` (SECURITY DEFINER, lee
> `vista_saldos_stock` / `errores_cliente` / `telegram_outbox` como owner y escribe un resumen) por
> **cron cada 2 h** (`generar-reporte-agentes`). 3 secciones color-codeadas: **⚠ Stock negativo**
> (saldo imposible), **🐛 Errores de la app** (últimos 7 días, agrupados por mensaje), **📨 Telegram sin
> enviar** (outbox trabado >15 min). Front: `stkBodyAgentes()` + `stkLoadReporte()`. Si no hay nada,
> muestra "Nada para mirar 👍". `generar_reporte_agentes` no es ejecutable por RPC (revocado de PUBLIC).
>
> Nota: **v4.50** — **Robustez/infra (4 cosas).** (1) **Vista de saldos** `vista_saldos_stock`
> (`security_invoker`, SELECT anon): suma `delta` por depósito en el SERVER respetando el cutoff de
> `Stock_Config` (misma lógica que `stockComputeSaldos`). El front tiene `stockFetchSaldos()` y los
> módulos que solo necesitan saldos (MG, bajar racks, insumos, salida Cervantes) ahora bajan **~1 fila
> por artículo** en vez de las ~20k de `Movimientos_Stock`. El admin de Stocks sigue con los
> movimientos (muestra el detalle). (2) **Baliza de errores**: tabla `errores_cliente` (INSERT anon) +
> `logClientError` enganchado a `window.onerror`/`unhandledrejection` → manda los crashes de JS
> (pantallas en blanco) a Supabase, best-effort, tope 25/sesión. Se leen del dashboard/MCP. (3)
> **Anomalías de stock**: función `check_stock_anomalias()` + cron `check-stock-anomalias` (diario
> 11:00 UTC / 08:00 AR) → si hay **saldos negativos** (imposibles) avisa por Telegram (outbox, dedup
> por día). (4) **6 sub-agentes** de revisión en `.claude/agents/`: `revisor-render`, `guardian-stock`,
> `auditor-supabase`, `guardian-tests`, `auditor-consistencia`, `keeper-guia`. **Hardening de seguridad**
> (de la auditoría del `auditor-supabase`): las funciones internas de Telegram/anomalías (`tg_enqueue`,
> `tg_outbox_flush`, `check_stock_anomalias`, `notificar_excedente_telegram`) ya **NO son ejecutables
> vía RPC** (se revocó `EXECUTE` de `PUBLIC`; corren solo desde sus triggers/cron como owner) y tienen
> `search_path` fijado; y `telegram_outbox` pasó a tener **RLS prendida** (la app no la toca directo;
> solo la usan esas funciones `SECURITY DEFINER` y el cron). La vista `vista_saldos_stock` fue
> **validada por el `guardian-stock`**: coincide 100% con `stockComputeSaldos` (288 art, 0 diferencias).
>
> Nota: **v4.49** — **Rediseño del paso de picking** (`pkRender`). (1) Cabecera: **SECTOR (sin guion) a la
> izquierda + CÓDIGO a la derecha**, ambos grandes (`bigRow`, reusado en el paso normal y en la pantalla
> de Faltan). (2) **3 botones** en fila: **Sin Stock** (rojo, `pkSinStock` → registra 0 y avanza =
> faltante completo) · **Faltan** (ámbar) · **✓ Puse N** (verde, `pkOk`). Tanto Puse como Confirmar de
> Faltan llaman a `pkAdvance()` → **saltan solos** al siguiente. (3) **Faltan** (`fInput`): dos cuadros —
> **PUSE** (input) + **FALTAN** (automático = pedido − puse, `pkFaltanCalc` en vivo). (4) **Próximas
> ubicaciones** abajo (`pkNextHtml`, hasta 4: sector + código + cajas). (5) **Excedente**: si está
> **registrado** (de stock), el paso de góndola dice "(hay N en excedente <ubic>)" y, si cubre todo, el
> paso pasa a **"Salteá la góndola — hay excedente en <ubic>"**; el botón manual **"Tiene Excedente"**
> (`pkMarkExcedente`, pop-up de ubicación → paso al final) aparece **solo si NO hay excedente
> registrado**. (6) De los 4 botones se puede **volver** (← Atrás / Volver / Cancelar el pop-up /
> destildar el excedente con `pkUnmarkExcedente`). Sin cambios de datos.
>
> Nota: **v4.48** — **Picking: botón “Tiene Excedente” + ajuste de alineación del MG**. (1) En cada
> paso del picking (no en los de excedente) hay un botón **“📦 Tiene Excedente — anotar ubicación”**:
> como todavía no está cargado qué artículos tienen excedente, el operario lo marca a mano → **pop-up**
> (`prompt`) que pide la ubicación (1 letra + 2 letras) → agrega un **paso de excedente al final** del
> picking para ir a buscarlo ahí (`pkMarkExcedente`, reusa el render `isExc`; `manualExc=true`,
> `key=art·EXC`, `esp` = el pedido como referencia). ⚠ Pendiente a confirmar: la cantidad objetivo del
> paso manual usa el pedido (no resta lo de góndola). (2) MG: el recuadro **“¿Hay Excedente?”** estaba
> levemente más abajo que el de Góndola → se alineó (label arriba como “GÓNDOLA”, tilde en una caja de
> 50px igual que el stepper) y se centraron los textos.
>
> Nota: **v4.47** — **MG botonera en 2 estados** (pedido del usuario sobre la v4.46). Por defecto cada
> código muestra el stepper de **Góndola grande y centrado** (caja verde) y a la derecha un recuadro
> **“¿Hay Excedente?”** con un tilde. Al tildarlo (`mgToggleExc`/`excOn`) la fila pasa a **2 columnas**
> Góndola | ☑ Excedente + la **ubicación** abajo (el layout que el usuario eligió). Destildar (tocar
> “☑ Excedente”) vuelve al estado por defecto y resetea. La alerta Telegram de excedente (v4.46) no
> cambia: salta al guardar con excedente > 0.
>
> Nota: **v4.46** — **MG rediseñado + alerta de excedente por Telegram**. (1) **Excedente opt-in**: la
> tarjeta de *Guardar a góndola* ahora muestra **solo el stepper de Góndola** por defecto; el de
> Excedente y la ubicación están ocultos detrás de un **tilde** "¿Va algo a EXCEDENTE? (góndola
> llena)". Tildarlo los revela; destildarlo resetea (`mgToggleExc`, campo `excOn`). Layout apilado
> (etiqueta izq + stepper der) → se fue el "zigzag" Góndola/Excedente que era horrible. (2) **Alerta
> Telegram de excedente**: trigger `trg_excedente_telegram` en `Movimientos_Stock` (AFTER INSERT WHEN
> `deposito='excedente' AND delta>0 AND tipo='guardado'`) → arma el mensaje con el nombre canónico
> (vista) + cajas + ubicación + legajo y lo encola en el outbox (`tg_enqueue`, dedup por `id`). Salta
> **al guardar** con excedente (góndola llena) — no en el tilde, así lleva la cantidad y la ubicación
> y nunca es falso positivo. El *fuera de lista* sigue con su propia alerta MGX (no se duplica).
>
> Nota: **v4.45** — **Barrido de estética (resto de pantallas)**, vía auditoría con sub-agentes en
> paralelo. Arreglos concretos: (1) **`fichadas-monitor.html`**: `colspan` de las filas de sección/
> espaciador/empty estaba en **17** cuando la tabla tiene **18 columnas** → cada banda de sección
> quedaba corta una celda a la derecha. Corregido a 18. (2) **Recepción (`recepcion.js`)**: el `⏱ X hs`
> de demora salía en **18px** dentro de una línea meta de 13px (desalineado) → bajado a 14px; los
> botones de código (`.opCodeBtn`) podían desbordar con códigos Log/Fabr largos → `overflow-wrap`; el
> footer de "Listo" (Cerrar/Anular/Cargar otra) no envolvía y tenía alturas distintas → `flex-wrap` +
> altura pareja (52px). **Quedó FLAG (no tocado)**: densidad de la botonera (row-6 Virgilio / row-5
> Cervantes — diseño establecido), recorte de "Mts3 x Hora" en el monitor con muchos operarios (layout
> afinado para la TV — verificar en la TV real), y los issues de **Cervantes** (es una copia: se
> arreglan upstream en `Registro-Produccion-2.0` y se re-sincroniza).
>
> Nota: **v4.44** — **Nombres consistentes también en operario**. El lookup `artNombre` (vista
> `vista_nombres_articulos`, ver v4.43) ahora también se usa en los módulos **operario** que muestran
> artículo terminado: **MG (Guardar a góndola)** y **Bajar racks → góndola**, más la fila de
> aprobación de bajadas en el admin de Racks. Antes mostraban la descripción del movimiento (Excel) y
> quedaban inconsistentes con el admin. *Picking* sigue sin nombre (es por **código + sector**, a
> propósito) e *Insumos* mantiene su propio nombre (no son artículo terminado, no van por la vista).
>
> Nota: **v4.43** — **Nombres de artículo: fuente corregida**. La v4.41 sacaba la descripción de
> `Articulos_Cajas`, que **tiene códigos duplicados** (ej. `026` aparece como *Colador N°8* y también
> como *Pinza de Fideos*) → el lookup agarraba el equivocado y mostraba **nombres mal**. Se reemplazó
> por una **vista en Supabase**, `vista_nombres_articulos` (`security_invoker=true`, SELECT para
> `anon`), que resuelve el nombre por **prioridad en el server**: **`E. Madre LK` > `Articulos
> Virgilio X Tallerista` > `OC_Maximos` (Excel)**, ya deduplicada y 1 fila por código normalizado
> (mismo normalizado que `_ocgNorm`: upper+trim+saca ceros a la izquierda). Cobertura: 279 nombres de
> E. Madre LK, 123 de Virgilio x Tallerista, 23 del Excel (425 códigos). `loadArtNombres()` ahora hace
> **un solo fetch** a la vista. Si se quiere cambiar la prioridad o sumar tablas, editar la vista (no
> el front). `artNombre(cod, fallback)` sigue igual.
>
> Nota: **v4.42** — **Pasada de estética en la solapa Stocks**. (1) La tabla de stock se salía del
> card y **clipeaba la columna Racks**: se bajó el padding de las columnas numéricas (16→9px), se
> acotó el ancho de Descripción (300→210px) y se envolvió en un contenedor con scroll horizontal
> (`.stk-tblwrap`) para que nunca se corte. (2) Los artículos **solo-insumos** (y cualquiera en 0 en
> todos los sectores) **ya no aparecen como filas todo-cero** en la tabla principal — solo se ven en
> su sección *Insumos*; siguen siendo encontrables con el buscador. (3) Se agregó padding base a
> `.stk-tbl td` (antes solo lo tenían las filas `.stk-row`), arreglando el choque "−20tanda" en
> *Salidas* y la falta de aire en *Racks*/*Insumos*. Sin cambios de datos ni de lógica.
>
> Nota: **v4.41** — *(⚠ fuente superada por v4.43 — `Articulos_Cajas` tenía duplicados)* **Nombres de artículo desde Supabase** (fuente única de descripciones). Lookup vivo
> `loadArtNombres()` / `artNombre(cod, fallback)`: arma un mapa `cod normalizado → descripción` desde
> **`Articulos_Cajas`** (`Cod_Art`/`Descripcion`, 361 artículos, la lista más completa) y, para los que falten,
> el **objetivo del Excel** (`OC_Maximos.descripcion`). Se carga junto al admin (`openStockAdmin` / `openOCAdmin`,
> dentro del `Promise.all`) y reemplaza al `desc` que venía en cada fila en **todos** los módulos: Stocks
> (góndola/insumos/racks), detalle por sector, generador de OCs, índices y % entregas. Si un código no está en
> ninguna tabla, cae al `desc` propio de la fila (movimiento/OC). No copia datos: es solo lectura. Normaliza el
> código con `_ocgNorm` (saca ceros a la izquierda) para que matchee igual que el resto del stock.
>
> Nota (repo, 2026-06-27) — **Suite de smoke-tests** en `tests/` (`bash tests/run.sh`): `node --check sw.js` +
> `checkhtml.cjs` (sintaxis de los `<script>` inline del index.html — lo que más rompe) + `smoke.cjs` (Playwright:
> funciones clave existen, sin errores de página, `stockComputeSaldos` ok). Correr antes de pushear. Ver
> `tests/README.md`.
>
> Nota: **v4.40** — **% de entregas de OCs** (vista **📊 % Entregas** en el módulo de OCs). Cruza lo **pedido**
> (`Ordenes_Compra.cantidad`) contra lo **entregado** (`cantidad_recibida`) por artículo y global → % de
> cumplimiento del proveedor. Ordenado por peor %. `ocEntregas`/`ocBodyEntregas` (`_oc.view==='entregas'`).
> `Ordenes_Compra` retiene el histórico de OCs (es el archivo). ⚠ Si en el futuro se borran OCs viejas, habría
> que agregar una tabla snapshot para no perder el histórico del %.
>
> Nota: **v4.39** — **Módulo de Conteo de stock** (solapa **📋 Conteo** en *Stock y Compras*; la empleada cuenta
> martes/jueves). Formato planilla (como el repo `Planilla-Conteo-Cajas`): filas **Sector · Código · Pilas ·
> Cjas×Pila · Sueltas** → **cajas = pilas×cjas/pila + sueltas**. Botón **"Comparar con el sistema"** → tabla
> **Contado vs Sistema (góndola+excedente)** con la **diferencia** y lo **"en proceso"** (Pickeados + A facturar,
> que no está en la góndola). **Guardar** → tabla `Conteo_Stock` (`sesion, legajo, cod, sector, pilas, cjas_x_pila,
> sueltas, cajas`; RLS read+insert anon). `stkBodyConteo`/`cntSet`/`cntAddRow`/`cntCompara`/`cntGuardar`.
> ⚠ A revisar el lunes con la empleada: el repo original tenía "Cargar" con 2 códigos y un resumen con
> "Pickings Armados / Pedidos FC / Mercadería en Tránsito" — acá se simplificó (legajo + comparación directa).
>
> Nota (Supabase, 2026-06-27) — **Aviso semanal "generá las OCs" por Telegram.** Función
> `notificar_oc_pendientes_telegram()` + `pg_cron` **`alerta-oc-pendientes`** (`'0 11 * * 3'` = miércoles 08:00 AR).
> Lista los artículos con **stock (góndola+racks+excedente) por debajo del máximo** (= proy×índice topado a
> capacidad; si no hay proy, objetivo del Excel), respetando el corte de `Stock_Config`. Va por el **outbox**
> confiable. Helper `_cod_norm(text)` (saca ceros a la izquierda) para matchear códigos entre tablas. ⚠ Con datos
> de prueba da ~165 (stock bajo + índice 1.5 sin capacidad); con datos reales será representativo.
> **Monitor del outbox**: `notificar_outbox_salud()` + cron **`outbox-salud`** (`'0 13 * * *'` = diario 10:00 AR)
> avisa si quedaron avisos `failed`/`pending` viejos. **Índice de OC recuperado del Excel**: `OC_Maximos.indice`
> se seteó por artículo = `max_cajas ÷ e_madre_cajas` (estadística madre del Excel, de PaginaLK
> `estadistica_madre.e_madre_cajas`). **No era todo 1.5**: 22 de 339 distintos (0,67–4,50; mayoría 1,0/2,0/2,5/3,0).
> Reproduce el máximo del Excel; afinable en ⚙ Índices.
>
> Nota: **v4.38** — **Números bien centrados en toda la app** (#8). Regla **global**: `input[type=number]` sin
> flechitas (`-moz-appearance:textfield` + `::-webkit-*-spin-button{appearance:none}`) → el número centra de
> verdad en todos los steppers (MG, Insumos, Cervantes, Racks, ajustes, etc.). Además se centraron `.oc-rinp`
> (recibido OC), `.stk-aj-inp` (cantidad de ajuste) y los números de la tabla de OC (`.oc-tbl .num`). (v4.24/v4.28
> ya habían centrado los símbolos `–/+` de los steppers.) Se sacó el cartel **BETA** del generador de OCs.
>
> Nota: **v4.36/v4.37** — **Insumos (RI/EI) rediseñado.** Alta con **un solo campo identificador**: **código de
> 7 dígitos** (`/^\d{7}$/`) **o sector** (el sector va *en el lugar del código*) + un campo **descripción**. Si el
> id son 7 dígitos → código (`cod_art = código`); si no → sector (`cod_art = SECTOR·DESCRIPCIÓN`, se muestra
> "📍 sector" en la posición del código). Descripción obligatoria para sectores. Cada ítem lleva **unidad de medida** (chips **Uni / Paquetes / Kg** + un **"+"** que agrega una
> unidad custom, guardada en `localStorage` `vir_ins_units`). Los movimientos (`deposito='insumos'`) ahora
> guardan **`unidad`** y **`ubicacion`** (= sector, para los sin código). Columnas nuevas en Supabase:
> `Movimientos_Stock.unidad`, `Insumos.sector`. Funciones `insLoadUnits`/`insSetUnidad`/`insAddUnidad`,
> `insCrear` (valida 7 díg o sector+desc), `insConfirmar` (manda unidad + ubicación).
>
> Nota: **v4.35** — Vista **Stocks**: (1) sectores **reordenados** → Góndola · Excedente · Pickeados · A facturar ·
> A guardar · Racks (· Insumos aparte). (2) Columnas numéricas **centradas** y títulos multi-palabra en **doble
> fila** ("A guardar"→"A / guardar"). (3) **Tocar el total de un sector** (chip de la tira) abre el **detalle**
> (`stkSectDetail`/`stkBodySectDetail`): lista **sector · código · descripción · cajas**, ordenable **por código
> o por sector**. Para **Excedente** el "sector" es la **ubicación** cargada en el MG (por movimiento); para el
> resto, el sector de planimetría (`window.GONDOLA`).
>
> Nota: **v4.33** — Vista **Stocks**: el sector `separar_pedidos` se muestra como **"Pickeados"** (antes "A
> separar"; solo el label de la vista de Stocks — la solapa y el pipeline siguen "A Separar"). Las columnas de la
> tabla pasan a ser **TODAS fijas** (Góndola · A guardar · Excedente · Racks · Pickeados · A facturar), no solo
> las que tienen stock.
>
> Nota: **v4.32** — Tabla de **Stocks** mide según el contenido (`.stk-tbl-fit` = `width:auto`), no estira a
> 100% (sin huecos al pedo). Columnas: Código · Descripción · una por sector con stock (Góndola y A guardar
> siempre; Excedente/Racks/A separar/A facturar si hay) · "✚". Arriba, la tira de totales por sector.
>
> Nota: **v4.31** — **OC máximo topado a la capacidad de góndola** (proy×índice ≤ capacidad; marca ⤓ en el
> generador cuando topa) + la vista **Capacidad** compara contra el máximo generado (proy×índice), no `max_cajas`.
>
> Nota: **v4.30** — **Stocks / Ingresos / Salidas unificados** en una sola solapa con un **segmento** arriba
> (default "📊 Stock"; `stkBodyStocksTab`/`stkSetView`, estado `_stk.stkView`). Las solapas del admin de Stock
> quedan: Stocks · A Separar · Racks · Capacidad · Ajustes · Compras (OCs).
>
> Nota: **v4.29** — **Módulo Capacidad por sector** (solapa **📐 Capacidad** en *Stock y Compras*). Tabla
> **`Capacidad_Sector`** (`sector, cod, cajas_max`, único `(sector,cod)`; RLS read anon + write authenticated).
> Se **pega** una tabla `Sector ; código ; cajas max` (una por línea; separadores `; , | tab`) → upsert. La vista
> compara, por código, la **capacidad** (suma de `cajas_max` de todos sus sectores) con el **máximo de OC**
> (`OC_Maximos.max_cajas`): **dif +** = sobra lugar (máximo podría estar bajo), **dif −** = no entra (máximo alto
> → iría a excedente). Resumen arriba (códigos, capacidad total, cuántos con máx bajo / no entran). Funciones
> `stkCapLoad`/`stkBodyCapacidad`/`stkCapImport`/`stkCapBorrar`. Sirve para tunear el índice/máximo de las OCs.
> ⚠ Muchos sectores son nuevos (la planimetría tiene 1 sector "representativo" por artículo; acá hay varios).
> (v4.28: centrado de los steppers `–/+` de Racks/Insumos/Cervantes, igual que el MG.)
>
> Nota: **v4.27** — **Picking con excedente PARCIAL** (refina v4.26). Si el excedente **no alcanza** lo pedido,
> la góndola pide **el resto** y el excedente lo que hay. Ej: piden 15, hay 10 en excedente → góndola pide **5**
> ("Levantá 5 (+ 10 en EXCEDENTE, al final)") y el paso de excedente pide **10**. Si el excedente cubre todo →
> góndola se saltea. Cada paso lleva **`key` propia** (`art` para góndola, `art·EXC` para excedente) así los dos
> picks del mismo código **cuentan por separado** (confirmar uno no marca el otro). `pkSendDetail` sigue
> emitiendo PKC con el código real; `stockBajaPicking` saca primero del excedente y el resto de góndola (coincide
> con el split). Validado con Playwright.
>
> Nota: **v4.26** — **Excedente con ubicación (no tiene lugar fijo) → el picking lo busca al final.**
> (1) Nueva columna **`Movimientos_Stock.ubicacion`** (text). (2) **MG**: al guardar al excedente (stepper exc > 0)
> aparece un campo **"📍 Ubicación"** — **formato 1 letra + 2 letras** (ej. `ABC`, mayúsculas), **obligatorio**
> (sin ubicación no deja confirmar). Se guarda en `ubicacion` de la fila `deposito='excedente'`. (3) **Picking**:
> `showPickingList` adjunta el excedente a cada artículo (`pkFetchExcedente`: saldo + ubicaciones). Los artículos
> con excedente se **SALTEAN** en el orden de góndola (`it.skip`, banner **"⏭ Salteá — hay N en EXCEDENTE, se
> busca al final"**) y se **agregan al final** como pasos de pick en su ubicación (`isExc`, "📦 EXCEDENTE — &lt;ubic&gt;").
> Los `skip` no cuentan para terminar (mismo `it.art` que el paso de excedente → un solo resultado). (4) **Contabilidad**
> (`stockBajaPicking`): la baja del picking sale **primero del `excedente`** (ahí se lo mandó a buscar) y el resto
> de `terminado`; si entre los dos no alcanza → alerta **SSG**.
>
> Nota (Supabase, 2026-06-27) — **Telegram confiable (outbox + reintento) y fix de avisos duplicados.**
> (1) **Duplicado de faltantes**: el trigger `trg_faltante_telegram` estaba como `AFTER INSERT **OR UPDATE**`
> (único así). Como `PKC` es **upsert** (la app reenvía el mismo evento), cada UPDATE re-disparaba el aviso →
> 2-3 Telegram por faltante. Se dejó **solo `AFTER INSERT`** (como el resto) → 1 aviso. (2) **Confiabilidad**:
> las notificaciones eran `net.http_post` "fire-and-forget" — si fallaba (timeout/red/Telegram caído) el aviso
> se **perdía sin reintento** (se vio: handshake TLS > 5 s default → timeout). Ahora **todas** pasan por
> **`telegram_outbox`** (tabla): el trigger **encola** (`tg_enqueue`, escritura local, nunca falla por red) +
> **flush inmediato**; un **pg_cron cada 1 min** (`telegram-outbox-flush` → `tg_outbox_flush()`) **reintenta
> hasta status 200** (timeout 20 s, hasta 60 intentos ≈ 1 h) y reconcilia la respuesta async de pg_net. La
> **`dedup_key`** (= `client_id`) evita doble-envío aunque un trigger dispare de más. Migrados: faltante (PKC),
> carga-sin-control (CRA), ppp-error (PPE), sin-planimetría (PSP), falta-facturación (cron), + los nuevos MGX/SSG.
>
> Nota: **v4.25** — MG: cada fila muestra **"a guardar: N"** (antes "disponible") y abajo **"Faltan: N"** =
> `disponible − góndola − excedente` (lo que queda por asignar; verde en 0, ámbar si falta). Vivo a medida que
> se cargan los steppers.
>
> Nota: **v4.24** — **MG (Guardar a góndola): Excedente + buscador + guardar fuera de lista + 2 alertas Telegram.**
> (1) **Excedente**: nuevo depósito **`excedente`** (góndola que no entra). Cada artículo tiene **dos steppers**
> lado a lado — **Góndola** y **Excedente** — independientes, topados a `góndola + exc ≤ disponible`. Al
> confirmar: `a_guardar −(g+e)` · `terminado +g` · `excedente +e`. El excedente es un sector más en Stocks
> (tira + columna + Ajustes) y **cuenta como stock disponible para las OCs** (`terminado + racks + excedente`).
> (2) **Buscador** arriba (teclado numérico) que filtra por código. (3) **Guardar fuera de lista**: si el código
> buscado **no está** en "a guardar" (típico error de tipeo en recepción), botón "➕ Guardarlo igual" → item
> `manual` que **NO descuenta `a_guardar`** (solo entra a góndola/excedente) y **emite evento `MGX`** →
> **alerta Telegram** (trigger `trg_mg_fuera_lista_telegram`). (4) **Alerta picking sin stock**: en el TP, si se
> sacó de góndola **más de lo que el sistema tenía** (saldo `terminado` quedaría negativo), `stockBajaPicking`
> emite **evento `SSG`** → **alerta Telegram** (trigger `trg_picking_sin_stock_telegram`). Símbolos `– / +` y
> números **centrados** (prolijo). Validado con Playwright. ⚠ Los dos triggers Telegram usan el bot/grupo
> "Faltantes Virgilio" (`-1004379879565`), patrón `net.http_post` como el resto.
>
> Nota: **v4.23** — **Solapa Stocks: "cuánto hay en cada sector"** (`stkBodyStocks`). (1) **Tira de totales
> por depósito** arriba (Góndola · A guardar · Racks · A separar · A facturar · Insumos), totales GLOBALES en
> cajas (no filtrados). (2) **Columnas por sector** en la tabla por artículo: Góndola y A guardar siempre;
> Racks / A separar / A facturar **solo si tienen stock** (no ensanchan de gusto). `fmtCajas` redondea a 1
> decimal (racks fraccionados). El `colspan` de las filas de detalle/empty es dinámico. Insumos sigue como
> sección aparte abajo (artículos distintos). Validado con Playwright.
>
> Nota: **v4.22** — **Pipeline de stock "Separar Pedidos" → "A Facturar"** (dos depósitos intermedios entre
> el picking y la facturación). Recorrido de las cajas pickeadas: **góndola** `--TP-->` **separar_pedidos**
> `--TAP-->` **a_facturar** `--facturado-->` fuera del stock. (1) **TP** (`stockBajaPicking`): saca de góndola
> (`terminado −`) y mete en **`separar_pedidos +`** las cajas reales pickeadas (eventos PKC, por tanda),
> `tipo='picking'`. (2) **TAP** (`stockSepararAFacturar`, hook en `send()`): mueve el neto de la tanda
> `separar_pedidos −` / **`a_facturar +`**, `tipo='separado'`. (3) **Marianela factura el último NP de la
> tanda** (la tanda queda 100% facturada en `facTickNP`) → `stockSalidaFacturado`: **`a_facturar −`**,
> `tipo='facturado'` → sale del stock. Cada paso mueve el **neto real** del depósito de origen para esa tanda
> (`_stockNetoDepTanda`, nunca deja negativos) y es **idempotente** (dedup por `tipo`+`ref=tanda`). Nueva
> **solapa "📦 A Separar"** en *Stock y Compras* (`stkBodyProceso`): muestra por tanda las cajas en *a separar*
> (pickeado, falta armar) y en *a facturar* (armado, falta facturar), con totales y filtro. `stockComputeSaldos`
> ahora inicializa `separar_pedidos` y `a_facturar`; el dropdown de *⚙ Ajustes* y la solapa *Salidas* (solo la
> baja de góndola del picking) contemplan los nuevos depósitos. Validado con Playwright. ⚠ El stock disponible
> para OCs sigue siendo `terminado + racks` (NO cuenta estos intermedios: son cajas comprometidas a pedidos).
>
> Nota: **v5.01** — **Rol "solo conteo"** (`CONTEO_EMAILS`, ej. Giuliana
> `delavegagiulianab@gmail.com`): al loguear con Google aterriza en `#conteoPanel` (un único
> botón "Hacer conteo") → `openStockAdmin(true)` abre el admin de Stock en modo **solo conteo**
> (`_stk.soloConteo`: sin solapas, directo a `stkBodyConteo`). No es supervisor ni operario (no
> necesita estar en Empleados); `cntGuardar` no requiere supervisor. **v5.00** — detalle por sector
> de Stocks (`stkBodySectDetail`) reordenado a **Código · Cajas · Descripción · Sector** (entra en
> el celu sin recortar). **Excedente cargado** (conteo 29/06: 48 líneas / 1664 cajas, posiciones
> **P1–P30** en `ubicacion`, `ref='conteo excedente 29/06'`): el picking lo levanta primero solo
> (v4.26 `pkFetchExcedente` lee `deposito=excedente` con su ubicación). ⚠ Códigos con doble
> identidad (099↔99, 124↔124E): se cargó el de la **góndola** para que el Total sume bien.
>
> Nota: **v4.99 (server-side)** — **Pipeline de stock también del lado del SERVER**
> (`reconciliar_pipeline_stock()` + cron jobid 22 `*/10 * * * *`; ver
> `sql/reconciliar_pipeline_stock.sql`). **Root cause** de por qué *Pickeados*/*A facturar*
> mostraban 0 **y la góndola nunca bajaba por el picking**: era UN solo bug — el CHECK
> `Movimientos_Stock_deposito_check` no incluía `separar_pedidos`/`a_facturar`/`excedente`,
> y como `stockBajaPicking` manda `[terminado−, separar_pedidos+]` en **un batch** y
> `stockMove` **se traga los 4xx**, el rechazo del CHECK volteaba TODO el movimiento en
> silencio (ni góndola − ni separar +). Encima los equipos de picking corren app vieja (TWA)
> que ni intenta el pipeline. **Fix**: (1) migración `movimientos_stock_deposito_check_pipeline`
> amplía el CHECK a `terminado/excedente/separar_pedidos/a_facturar/a_guardar/racks/insumos`;
> (2) `reconciliar_pipeline_stock()` replica las 3 etapas (PKC/TP→separar+góndola−,
> TAP→a_facturar, 100% facturado→fuera), **idempotente** (dedup por movimiento), **respeta
> descuentos de góndola previos** (no re-descuenta el seed de C58B/C/D), sólo post-cutoff,
> comparte los `tipo` con el cliente (guards evitan doble conteo si una app nueva sí corre el
> pipeline). Backlog 29/06 reconciliado: **Pickeados 627** (C58C/C58E/C59C), **A facturar 442**
> (C58A/C58B/C58D), góndola −634 (sólo las 3 sin descuento previo; quedó con 2 arts en −5).
>
> Nota: **v4.21** — **Fix m³/hora del monitor pegado en 0** (panel "Mts3 x Hora" / "Parcial").
> `fetchMonitorDayStats` leía el m³ por tanda del cache global `_monitorSheetCache`, pero `renderMonitor`
> lo setea **después** de llamar a esa función. En la 1ª carga el cache estaba `null` → todas las tandas
> caían a la histórica del Sheet; las tandas **nuevas del día** (que no están en la histórica) daban m³ 0 y
> el panel quedaba en 0,0 (los primeros ~15 s, o para siempre si la histórica no las tenía). Fix: el render
> le pasa el `sheetMap` recién fetcheado como **2º parámetro** y el cache de 15 s sólo se reutiliza si se
> calculó **con** sheet (flag `hadSheet`). El m³ NO está en Supabase para producción real, pero la PPP del
> día sí (`PPP_Programacion_Diaria`, `PPP_SOURCE="auto"`) → el m³ por tanda sale de ahí o de la histórica.
>
> Nota: **v4.20** — **PPP: tilde de AP/TAP a la derecha de la impresora**. Cada fila de la PPP muestra dos
> pastillas **AP** (armado empezado) y **TAP** (armado terminado) por tanda, verdes con ✓ cuando están
> hechas. Se nutren de `getActivityStatus()` (`armadoStarted` / `armadoDone`) — lectura de Supabase, no
> escribe la PPP. Helper `_pppApTapBadge(p)`; se inserta tras el botón 🖨️ en `_pppRowTr`/`_pppRowTrRO`.
>
> Nota: **v4.18–v4.19** — **PPP, dos ajustes**. v4.18: la **razón social larga** ya no desfasa ni ensancha
> la columna (`.ppp-cli-in`: `max-width:180px` + ellipsis + tooltip con el nombre completo). v4.19:
> **clickear un pedido en el panel de errores** lleva a su fila (`pppGoToRow(np)` → `scrollIntoView` +
> flash `.ppp-row-flash`; cada `<tr>` tiene `id="ppprow_<np>"`; los NP del panel son `<a class="ppp-go">`).
>
> Nota: **v4.17** — **Máximo de OC = Proyección por tendencia (PaginaLK) × índice (configurable)**.
> El máximo del generador ya no sale del Excel estático; sale de la **estadística madre por tendencia**
> que calcula PaginaLK (repo `loekemeyer/PaginaLK`, Supabase `kwkclwhmoygunqmlegrg`). Esa proyección
> **no está guardada** allá: se computa al vuelo en su admin (`_computeEstMadreProjections`: por
> cliente×artículo, ventana 24m, promedio desde 1ª compra **descartando picos disruptivos**; suma sobre
> clientes; excluye clientes test 1/3878 y `sales_excluded_items`). **Fluctúa mes a mes**. Se expuso como
> **RPC `fn_proyeccion_madre()`** (PaginaLK, anon) y se **sincroniza** a Virgilio: tabla
> **`proyeccion_madre`** (`cod, proy_cajas_mes, uxb, proy_uni_mes, actualizado`) + función
> **`refresh_proyeccion_madre()`** (extensión `http`, GET al RPC, filtra `proy>0` para descartar códigos
> de descuento) + **`pg_cron` mensual** (`'0 6 5 * *'` = día 5, después del import). En el generador:
> `ocgFetchProyeccion` (mapa cod→proy_cajas, cod normalizado sin ceros a la izquierda); **máximo (cajas)
> = ceil(proyección × índice)**; si un artículo no tiene proyección, cae al objetivo del Excel
> (`OC_Maximos.max_cajas`, marcado *xls*). **Índice configurable**: columna **`OC_Maximos.indice`**
> (default 1,5) + **módulo "⚙ Índices"** en el generador (`ocgEnterIndices`/`ocBodyIndices`/`ociSetAll`/
> `ociSave`): editar global ("a todos en X") o por artículo, guardar con sesión de supervisor. Validado
> con Playwright (proy×índice, fallback, editor). ⚠ Regla en PaginaLK: tabla `sales_excluded_items` +
> trigger `trg_sl_excluir_no_venta` en `sales_lines` que descarta al importar códigos no-venta (ej. 1101).
>
> Nota: **v4.16** — Admin: 5 grandes en una fila + 7 chicos en una tira (fix de breakpoints).
>
> Nota: **v4.15** — **Vista Administración en 2 niveles** (pedido del usuario). **GRANDES** (uso diario,
> mismo tamaño, fila de 5, `.sup-primary`): **Facturación · PPP · Carga Recepción Mercadería · Stock y
> Compras · Recepción Remitos (RR)** (ese orden lo definió el usuario). **CHICOS** (ocasionales,
> `.sup-secondary`, más chicos y atenuados, bajo el rótulo "Reportes y configuración"): Monitor de
> operarios · Análisis de productividad · Inconsistencias · Faltantes · Editar Planimetría · Talleristas
> de Recepción · Mails autorizados. **"Stocks" + "Órdenes de Compra" se unificaron en UN botón**: "📦
> Stock y Compras" abre `openStockAdmin`, que ahora tiene una solapa **"📑 Compras (OCs)"** (`stkTab`
> intercepta `compras` → `openOCAdmin`). Responsive: 5→3→2 columnas.
>
> Nota: **v4.14** — **Fix de foco en buscadores/steppers**. Reemplazar `innerHTML` en cada tecla
> "sacaba" del campo (había que re-clickear por dígito). Helper **`_renderKeepFocus(container, html)`**:
> guarda el input activo (tag+clase+índice) y el cursor, y los restaura tras el re-render. Aplicado a
> `stkRender, ocRender, insRender, scRender, brRender, mgRender`.
>
> Nota: **v4.13** — **GENERADOR DE OCs en la página (replica el Excel "Pedidos Talleristas/Prov")**.
> **BETA, coded pero no para usar** hasta que esté el stock inicial cargado. Vive en el admin **Órdenes
> de Compra** (`openOCAdmin` → botón "⚙ Generar OCs (beta)" → vista `ocBodyGen`). **Fórmula (= la del
> Excel, hoja OCUPACION VIRGILIO col H)**: por artículo **`A pedir = max(0, Máximo + Pedidos − Stock)`**,
> redondeado para arriba a cajas enteras. **Fuentes**: (a) **Stock** = `Movimientos_Stock` **Góndola
> (terminado) + Racks** (NO cuenta "a guardar"), vía `stockComputeSaldos`; (b) **Pedidos/demanda** =
> Σ cajas por artículo en los pedidos del **PPP** (`PPP_Programacion_Diaria`, set de NP) según la **base
> de picking** (`PPP_Base_Pedidos`, vía `fetchPickingBase`) — función `ocgDemanda`; (c) **Máximo +
> Proveedor** = tabla nueva **`OC_Maximos`** (`cod, descripcion, linea, max_cajas, proveedor, uni_x_caja,
> activo`; RLS lectura anon / escritura authenticated), **importada del Excel** (OCUPACION VIRGILIO:
> Stock Max Cajas + Proveedor) — 339 códigos (315 activos, 22 proveedores). El **Máximo** del Excel =
> Est.Madre_Uni × Índice ÷ Uni-x-Caja (Est.Madre se actualiza ~cada 3 meses → re-importar). **Agrupa por
> proveedor**; los **proveedores internos** (`Racks` = importación, `Log/ Fabr` = fábrica) se muestran
> pero **NO** generan OC externa. Al **"Generar las OCs"** escribe las líneas de los externos en
> `Ordenes_Compra` (proveedor, fecha, codigo, descripcion, cantidad=falta, estado=pendiente, rubro='Art
> Term'; escritura con sesión de supervisor). Validado con Playwright (fórmula, internos, generación).
> **Decisiones/pendientes**: códigos con proveedor combinado ("Garcia / Lucho") quedan como ese string
> (a futuro, partir); **futuro**: que se genere automático + guardar PDFs en una carpeta / enviar por
> WhatsApp con plantilla (a trabajar después). El usuario carga el stock inicial más adelante (recién ahí
> da números reales).
>
> Nota: **v4.12** — **Stock inicial / "marcar inicio" robusto**. (1) `stockComputeSaldos` ahora cuenta
> **SIEMPRE** los movimientos `tipo='inicial'` (stock inicial = base), aunque sean anteriores al corte;
> el `cutoff` sólo desconsidera los movimientos **reales** previos (recepción/guardado/picking/ajuste/
> salida_cervantes/baja_racks/etc.), sin borrarlos. Así se puede cargar el inicial de **varios depósitos**
> (góndola/racks/insumos) en cualquier orden y **marcar inicio una sola vez**, sin que un depósito pise a
> otro. (2) En el admin Stocks → ⚙ Ajustes, la carga inicial pasó a **dos pasos separados**:
> **`stockGuardarInicial()`** (carga el inicial del depósito elegido, sin tocar el corte) y
> **`stockMarcarInicio()`** (botón aparte que fija `cutoff_ts = ahora`, una sola vez). Se quitó el botón
> combinado "Guardar + marcar inicio" (era un footgun multi-depósito: movía el corte y dejaba afuera lo
> cargado antes). Validado con Playwright. Decisión del usuario: **el stock inicial se carga más adelante**
> (primero verifica que el resto del flujo sume/reste bien).
>
> Nota: **v4.11** — **ÓRDENES DE COMPRA** (módulo admin, base del match recibido↔pedido). Botón
> supervisor **"📑 Órdenes de Compra"** (`openOCAdmin`). **Descubrimiento importante**: la tabla
> **`Ordenes_Compra` YA EXISTÍA** con datos reales (18 líneas de cajas de "Corrugadora"). Es **plana**:
> una fila por artículo pedido (`codigo, descripcion, cantidad, cantidad_recibida, unidad, proveedor,
> rubro, fecha, estado` + campos de mensajería al proveedor `mensaje_enviado/fecha_mensaje/
> proveedor_telefono` que mantiene otra herramienta). Una **"OC" = grupo (proveedor · fecha · rubro)**.
> El módulo lista las OCs agrupadas con **Pedido / Falta** (= Σcantidad − Σrecibida) y estado
> (pendiente|parcial|recibida); al abrir una OC muestra sus líneas con **recibido editable** y
> **faltante en vivo**; permite **guardar recibido** y **marcar recibida/reabrir**; y **crear OC manual**
> (carga líneas planas). **RLS de la tabla** (pre-existente, respetada): `select_all` anon+auth (lectura),
> pero `insert/update/delete` **sólo `authenticated`** → las **escrituras usan `facAuthWriteHeaders`**
> (sesión Google de supervisor, igual que Planimetría/Talleristas); la lectura va con anon. ⚠ Se creó por
> error una tabla `OC_Items` (modelo header+items) y una policy `oc_all` anon-write: **ambas
> revertidas/eliminadas** (se usa la tabla plana existente y su RLS original). **Pendiente** (necesita
> input del usuario): (a) **importar los PDF de OC** (share Windows `D:\Shares\...\A2 OC Art Term VIGENTE`,
> no accesible del sandbox) — poblaría esta misma tabla; (b) **auto-actualizar `cantidad_recibida` desde
> la recepción** (definir el vínculo recepción→OC: por `codigo`, por remito, desde qué fecha).
>
> Nota: **v4.10** — **SALIDA A CERVANTES** (botón nuevo de operario). Se agregó el botón **`SC`**
> ("Salida a Cervantes") a la botonera (en la fila de logística; **`CT` Conteo** se corrió a la
> 3ª fila, ahora ambas filas de 6). Manda **artículo terminado** a la otra planta (muestra /
> devolución): es una **baja de góndola** → `Movimientos_Stock` `deposito='terminado'`, `delta`
> negativo, `tipo='salida_cervantes'`, `ref` = remito/motivo opcional. **No** es un toggle ni genera
> evento en `Registros`: el botón intercepta en `selectOption` y abre **directo** el modal
> `showCervantesModal` (sin "Enviar"); la salida queda registrada sólo en `Movimientos_Stock` (con
> legajo + ts como traza). El modal (tipo MG) muestra lo que hay en góndola (stock terminado > 0),
> buscador, stepper por artículo (tope = stock) y un campo remito/motivo; confirmar usa **`stockMove`**
> (offline-safe). En el **admin Stocks** la solapa **Salidas** ahora muestra picking **+** salida a
> Cervantes (columna "Destino": tanda vs 🚚 Cervantes · motivo). Validado con Playwright (layout de
> botonera, intercept del botón, render, clamp, fila de movimiento).
>
> Nota: **v4.09** — **INSUMOS** (stock de insumos en la página). Los botones **RI** (Recepción
> Insumos) y **EI** (Entrega Insumos) —que ya existían como toggles de actividad— ahora, **al
> tocarse (inicio)**, abren un modal que registra **stock de insumos** en `Movimientos_Stock`
> (`deposito='insumos'`, tipo `recepcion_insumo` `+` / `entrega_insumo` `−`). El modal
> (`showInsumoModal('RI'|'EI', legajo)`) tiene **buscador** sobre el catálogo **`Insumos`** (tabla
> nueva: `id, cod (unique), nombre, creado_por, creado`; RLS abierta anon+auth) y **alta de código
> al vuelo** (`insCrear` → POST a `Insumos`) para cuando el insumo no está. Cada fila muestra el
> **stock actual** y un stepper; en EI avisa si va a quedar negativo (no lo bloquea — "como entra,
> puede salir"). Confirmar usa **`stockMove`** (offline-safe `vir_stock_pend`). En el **admin Stocks**
> (solapa Stocks) se agregó una sección **"📦 Insumos"** con el saldo por código. El selector de
> depósito de **Ajustes** ya permite cargar/ajustar `insumos`. Validado con Playwright (RI/EI render,
> buscador, warning, clamps, filas de movimiento correctas) y shape de insert en Supabase.
> ⏳ Falta que el usuario pase el **listado de insumos** para precargar el catálogo (igual se crea solo
> al usarse).
>
> Nota: **v4.08** — **RACKS → GÓNDOLA** (page-based, sin Telegram). Los **racks** son góndolas de
> pallets donde se guarda stock en **master cajas**; una vez por semana (al generar las OCs, miércoles)
> se baja de racks a la góndola. **Modelo**: depósito nuevo **`racks`** en `Movimientos_Stock` (en cajas;
> se muestran 3 unidades por artículo: **master ↔ caja ↔ unidad** vía `Cajas_x_Master` —columna nueva en
> `Articulos Virgilio X Tallerista`, junto a `Uni_x_Caja`). Tablas nuevas: **`Racks_Ordenes`**
> (`id, fecha, estado pendiente|bajado, creada_por, creada, cerrada_at`) y **`Racks_Bajadas`**
> (`id, orden_id, cod_art, descripcion, cajas, estado propuesta|aprobada, creada_por, ts, aprobada_at`);
> RLS abierta anon+authenticated. **Flujo**: (1) la operadora toca **"OCs generadas"** en el admin Stocks
> (solapa 🏗 **Racks**) → crea una `Racks_Ordenes` **pendiente** (`racksCrearOrden`). (2) **Alarma en la
> página**: mientras haya orden pendiente, a los operarios les aparece un banner en la botonera
> (`#racksAlarma`, `racksCheckAlarma`, refresco 5′, llamado desde `goToOptions`). (3) **Operario baja**:
> botón "Registrar bajada" → `showBajarRacks` (módulo tipo MG: muestra stock de racks en las 3 unidades,
> el operario marca cuántas cajas baja) → guarda en `Racks_Bajadas` **estado `propuesta`** (NO mueve stock
> todavía; reintento offline `vir_racks_pend`). (4) **Marianela aprueba** en **Carga Recepción Mercadería**
> (`recepcion.js`, botón "📦 Bajadas Racks → góndola" con contador de pendientes) → `racksAprobarBaja`:
> inserta 2 `Movimientos_Stock` (`-racks` / `+terminado`, tipo `baja_racks`), marca la bajada `aprobada` y,
> si era la última de la orden, cierra la orden (`bajado` → apaga la alarma). **Si no se baja, NO se mueve
> stock.** Mismo patrón reusable a futuro para reclamar artículos con poco stock (botón → orden/alarma en la
> página). Admin Stocks ahora tiene **5 solapas** (Stocks · 🏗 Racks · Ingresos · Salidas · Ajustes) y el
> selector de **depósito** en Ajustes incluye racks/insumos/a_guardar (`_stkDep`). Validado con Playwright
> (admin render, operario `brRender`, clamps, alarma).
>
> Nota: **v4.06–v4.07** — **STOCK ONLINE** (pedido del usuario; objetivo: stock dentro de la página).
> Modelo **event-sourced**: tabla **`Movimientos_Stock`** (`ts, cod_art, descripcion, deposito
> ('a_guardar'|'terminado'), delta (+/- cajas), tipo, ref, legajo`); el **stock = suma de `delta`** por
> `cod_art`/`deposito` considerando sólo `ts >= corte`. Tabla **`Stock_Config`** guarda el corte
> (`clave='cutoff_ts'`). **Flujos**: (1) **RT/recepción** (`recepcion.js opEnviar`) → cada artículo recibido
> suma a **'a_guardar'** (tipo `recepcion`). (2) **MG** (Guardado a Góndola) → al tocar MG, `showMGModal`
> muestra lo que hay en 'a_guardar', el operario elige cuántas cajas guarda y al confirmar genera 2
> movimientos por artículo (`-a_guardar`, `+terminado`, tipo `guardado`). (3) **Picking** → al **TP**,
> `stockBajaPicking` suma las cajas **reales** de los PKC de la tanda y resta de **'terminado'** (tipo
> `picking`, dedup por `ref=tanda`). **Admin** "📦 Stock / Movimientos" (`openStockAdmin`): saldos por
> artículo (terminado negativo en rojo), detalle de movimientos, **cargar stock inicial** (movimientos
> `inicial`) y botón **"marcar inicio"** (setea `cutoff_ts` → desconsidera lo anterior sin borrarlo).
> Cliente: `stockMove`/`stockFlushPend` (POST + reintento `vir_stock_pend`), `stockFetchMovs`/`GetCutoff`/
> `ComputeSaldos`. Helpers offline-safe. (Arranca en 0; el corte permite resetear cuando se carga el inicial.)
>
> Nota: **v4.05** — **Dos alertas nuevas a Telegram** (grupo **"Faltantes Virgilio"**, chat `-1004379879565`, el
> mismo bot/grupo de faltantes y sin planimetría). (1) **FALTA DE FACTURACIÓN** — *server-side* (`pg_cron` +
> `pg_net`): función `notificar_falta_facturacion_telegram(modo)`. **`'manana'`** (cron `falta-fact-manana`,
> `0 21 * * *` = 18:00 AR): pedidos con **entrega mañana**, **armado terminado** (hay TAP en ≤5 días) y **sin
> facturar** (no están en `Facturacion_NP`) → avisa. **`'hoy'`** (cron `falta-fact-hoy`, `0 11 * * *` = 08:00
> AR): **entrega HOY y sin facturar** (urgente/vencido). (2) **ERROR EN PPP** — *client-emit*: el monitor PPP
> (modo readonly) al detectar errores (`_pppComputeErrors`) emite un evento **`PPE`** (`texto =
> sinzona:N|zonadif:N|tandamal:N|sacar:N`, id determinístico `ppe_<día>` + upsert → **1 aviso por día**); el
> trigger **`trg_ppp_error_telegram`** (`notificar_ppp_error_telegram`, AFTER INSERT) lo reenvía con el detalle
> (sin zona · zona≠barrio · tandas mezcladas fecha/ruta · a sacar). Cliente: función nueva `_pppEmitError`;
> `PPE` agregado a `isUpsert` (index.html + sw.js). Verificado end-to-end (POST 200, `ok:true`).
>
> Nota: **v4.04** — **El wizard "Completar" se movió a AP + TAP sin pop-up + persistencia** (cierra el pedido
> del usuario sobre el flujo). Al tocar **AP** ahora se abre el wizard (Paso 1 Faltantes → Paso 2 Líos) en
> lugar del aviso read-only `showMarianelaAviso`; **TAP ya NO abre ningún pop-up** (es solo el cierre del
> armado). Como el wizard queda **abierto durante el armado**, se **persiste el avance** en `localStorage`
> (clave `vir_comp_<TANDA>`, ventana 36 h): se guarda en cada cambio (`_compPersist`, llamado desde
> `_compRecalc` y `_compLioNp`), se **retoma al reabrir AP** (`_compRestore` al inicio de
> `showCompletarWizard`, antes de reconstruir) y se **borra al Terminar** (`_compClearPersist`). Cerrar con la
> **X NO borra** (se retoma al reabrir). Validado con Playwright (guardar → cerrar → restaurar → terminar →
> limpiar, sin errores). El flujo completo del usuario: **AP → faltantes → líos → TAP (sin popup)**.
>
> Nota: **v4.03** — **Wizard "Completar" reordenado + botonera de líos** (pedido del usuario). (1) **Orden
> nuevo**: Paso 1 = **Faltantes** (antes Paso 2), Paso 2 = **LÍOS en botonera de cuadrados** (reemplaza el
> tipeo del número). (2) **Los líos se arman sobre lo ENTREGADO** (`pedido − faltó` del Paso 1):
> `_compBuildLiosData` calcula por NP las cajas que salen por código (descuenta el faltante repartido en el
> Paso 1, clave `np|cod` sin la E final). (3) **Botonera por NP** (una a la vez, nav ← / →): cada código un
> cuadrado **código / (en este lío / quedan) / − +** con **+ suelta**, ordenada por nº de código; los códigos
> ya repartidos salen de la grilla. **La cantidad de líos sale sola** (= cuántos se cierran). (4) **Guardado**:
> evento **TAL** con texto extendido `NP|LÍOS|TANDA|RESUMEN` (resumen = composición `A=544x1;B=546x5;…`;
> retrocompatible: lo viejo sigue leyendo `NP|LÍOS|TANDA`). `compTerminar` valida que cada NP tenga TODAS sus
> cajas repartidas antes de cerrar. Funciones `_compBuildLiosData`/`_compLioStep`/`_compLioSuelta`/
> `_compLioSiguiente`/`_compLioDel`/`_compLioNp`/`_compLiosResumen`/`_compRenderLios`. ⚠ **Sigue disparándose
> en TAP** (todavía no se movió a AP ni se sacó el popup de TAP — pendiente: disparo en AP, TAP sin popup,
> persistencia del avance en localStorage). **v4.00–v4.02** (interim): v4.00 faltantes permiten completar
> (`sum ≤ a.falta`, llegó stock); v4.01 columna **Líos** en monitor de Facturación (lee TAL); v4.02 ensanchar
> esa vista a 1240px para que entre Acción.
>
> Nota: **v3.99** — **Entregas en Supabase: UNA tabla persistente `Entregas_Virgilio` (no más vistas)**
> (pedido del usuario: "una sola tabla, sin duplicar"). Se **borraron las vistas** `Entregas_Virgilio` y
> `Faltantes_Virgilio` (v3.97/v3.98) y se creó una **TABLA** `Entregas_Virgilio` con columnas exactas:
> `fecha_salida · cod_cliente · np · cod_art · cajas_pedidas · cajas_entregadas · cajas_falto · tanda`
> (+ `id`, `creado`). **La app la llena al dar TAP**: en `compTerminar` arma el **pedido entero** de la tanda
> (una fila por **NP × artículo**, sacado de `pedidoFull` = picking base por NP), calcula el `cajas_falto` del
> reparto del Paso 2 (`faltMap`, clave `np|art` sin la E final) y `cajas_entregadas = pedidas − faltó`, y hace
> **un POST en bloque** (`_compSaveEntregas`, 1 sola llamada). **Sin duplicar la base**: la fila guarda el
> pedido tal cual estaba al entregar (no se re-lee la base efímera `PPP_Base_Pedidos`). **Offline-safe**: si
> el POST falla por red, las filas quedan en `localStorage` (`vir_entregas_pend`, cap 5000) y se reintentan al
> volver online y al cargar (`_compFlushEntregas`); un 4xx (error de datos) NO se reintenta (evita loop).
> **`fecha_salida` = `fecha_entrega`** de `PPP_Programacion_Diaria` (no la de armado: el pedido se arma el día
> anterior). **Se quitaron los eventos FAL** (el faltante ya queda en la tabla; los líos siguen yendo como
> **TAL** por la cola). RLS: `ent_insert`/`ent_select` para `anon`+`authenticated`. Funciones nuevas:
> `_compSaveEntregas` / `_compFlushEntregas`; `showCompletarWizard` ahora arma `pedidoFull` + captura `fecha`.
>
> Nota: **v3.98** — **Wizard "Completar" Paso 2: modo CARGÓ + tope + auto-fill + switch** (pedido del
> usuario). (1) **Modo `_compMode`** (default **"cargo"**, elegido por el usuario): el operario anota lo que
> **CARGÓ** a cada NP y el **faltó** sale por diferencia (`pidió − cargó`); modo `"falto"` = anota el
> faltante. El switch es **solo de UI** — internamente siempre se guarda el FALTANTE (`asig`), así **FAL /
> la vista `Entregas_Virgilio` / los cálculos NO cambian**. Hay un **toggle en vivo** en el Paso 2 (para
> que prueben los dos). (2) **Tope**: cada input no puede superar lo que **pidió** esa NP (`max=pidio`,
> clamp en `_compFaltInput`). (3) **Auto-fill "agarró 0"**: si el picking levantó **0** (`real===0`), cada
> NP queda con faltó = lo que pidió, **automático** (readonly), sin que lo marquen (igual que el caso de 1
> solo cliente). `arts[].auto`/`real`. (4) **Claridad**: label **CARGÓ** (verde) + secundario **faltó X**
> (rojo, chico) por NP, para no confundir lo cargado con lo faltante. CSS `.comp-mode-toggle`/`.comp-fnp-box`/
> `.comp-fnp-lbl`/`.comp-fnp-sec`. La vista `Entregas_Virgilio` ya trae `cajas_pedidas · cajas_faltantes ·
> cajas_entregadas` (entregó + faltó en Supabase).
>
> Nota: **v3.97** — **TAP: wizard "Completar" (líos + reparto de faltantes) + vista `Entregas_Virgilio`**
> (pedido del usuario). Al dar **TAP** se abre `showCompletarWizard` (reemplaza al `showLiosModal` suelto):
> **Paso 1** = líos por NP (guarda como antes, opcion **TAL**); **Paso 2** = repartir las **cajas
> faltantes** del picking (de `faltantesDeTanda`/PKC) entre las NP que pidieron cada artículo (1 NP →
> automático; 2+ → el operario reparte hasta completar). Navegación con flechas ← →, botón **Terminar**
> (se habilita con líos completos + faltantes repartidos). Si la tanda no tiene faltantes, sólo Paso 1.
> **Guardado de faltantes**: opcion **FAL**, `texto = tanda|np|cod_cliente|cod_art|cajas_faltantes` (por la
> cola → offline-safe). **Vista Supabase `Entregas_Virgilio`** (security_invoker, grant anon/auth): cruza
> `PPP_Programacion_Diaria` (np→cliente+`fecha_entrega`) × `PPP_Base_Pedidos` (pedido entero) − faltantes
> (FAL) → columnas `fecha · cod_cliente · razon_social · tanda · np · cod_art · cajas_pedidas ·
> cajas_faltantes · cajas_entregadas`. **Sin duplicar la base**: la vista la lee al vuelo; el faltante se
> guarda 1 vez (FAL); `entregadas = pedidas − faltó`. **fecha = fecha_entrega** (no la de armado: el pedido
> se arma el día anterior). ⚠ La base es del día en curso (se reemplaza al sync) → el programa externo lee
> la vista el mismo día y guarda su histórico. Funciones: `showCompletarWizard`/`_compRenderLios`/
> `_compRenderFalt`/`_compRecalc`/`_compGo`/`compTerminar`/`_compSendFalt`.
>
> Nota: **v3.96** — **Armado (AP): el aviso muestra TODOS los faltantes de la tanda** (pedido del usuario).
> Antes `showMarianelaAviso` (se dispara al tocar **AP**, línea ~5295) sólo mostraba los faltantes que había
> que **REPARTIR** (faltante >1 y pedido por 2+ NP); si no había reparto, no mostraba nada. Ahora muestra
> **todos** los faltantes del picking de la tanda (de los eventos **PKC**, `real < esperado`, últimos 5
> días, vía `faltantesDeTanda`), ordenados con los de reparto primero. Los de **reparto** van marcados en
> **rojo** (`.mar-art-rep`) con "repartir · N ped."; el resto en ámbar. Texto del modal actualizado
> ("Revisá los faltantes antes de separar…"). El supervisor sigue teniendo la vista completa en **📦
> Faltantes**.
>
> Nota: **v3.95** — **Talleristas / Artículos: fix "no aparece nada" (ej. Pintos) + estética + ← Volver**.
> (1) **Bug del vínculo**: el panel de artículos buscaba por `Cod_Tallerista` (código), pero **varios
> talleristas no tienen código** (en `Codigos X Tallerista` el `Codigo` es NULL, ej. **Pintos**) y sus
> artículos en `Articulos Virgilio X Tallerista` están ligados por **`Tallerista` (NOMBRE)** con
> `Cod_Tallerista` NULL → no aparecía nada. Ahora `tallArtsLoad` consulta por **`Tallerista=eq.<nombre>` +
> `Linea`** (el nombre es NOT NULL, siempre está) y `tallOpenArts` ya **no exige código**; `tallArtAdd` setea
> `Cod_Tallerista: cod || null`. (Pintos LK tiene 224/225/220-223/208/229…; CH 229/901/902/910/911/920/922.)
> (2) **Estética**: `.tall-row` pasó a tarjeta de **2 líneas** (`.tall-row-top` Nombre + Borrar arriba;
> `.tall-controls` LK/CH abajo) — antes el 📦 ensanchaba los chips y "Borrar" se iba a otro renglón apretado.
> (3) **← Volver**: botón en la barra del panel de artículos (`.recp-admin-back` → `closeTallArts`).
>
> Nota: **v3.94** — **PPP / Imprimir: diagnóstico del "Buscando" trabado**. Si la ruta rápida no matchea,
> el escaneo de una carpeta de red grande tardaba sin feedback (parecía colgado en "Buscando el PDF…").
> Ahora: (a) la ruta rápida `getFileHandle` prueba el prefijo **con y sin punto** (`Pedido de Clte._Div_` /
> `Pedido de Clte_Div_`) y extensión `.pdf`/`.PDF`; (b) el escaneo muestra **progreso** ("Revisando la
> carpeta… N archivos") vía `onProgress` y tiene **tope de 25 s** (`Date.now()`), así nunca parece colgado;
> si corta, el cartel "no encontré" muestra nombres reales (`_pppDirSamples`) para ver el formato.
>
> Nota: **v3.93** — **PPP / Imprimir: fix "no hace nada"** (pedido del usuario). Dos causas y dos fixes.
> (1) **Lentitud**: desde v3.90 `pppFindNpPdf` **escaneaba TODA la carpeta** por pedido → con carpetas
> grandes tardaba mucho y parecía colgado (y consumía el gesto del click). Ahora primero hace la ruta
> **RÁPIDA** (`getFileHandle` con el nombre exacto ISIS `PDF_PREFIX`+NP-con-ceros+`_NN.pdf`, sin escanear),
> y sólo si no matchea cae al **escaneo por número** (fallback para otro prefijo/relleno, ej. CHEF).
> (2) **Impresión silenciosa**: `_pppPrintPdf` subió el delay 400→700ms (que el visor renderice antes de
> `print()`) y se quitó el `window.open` interno (lo bloqueaba el popup-blocker). Ahora guarda el blob en
> `_pppLastPdfUrl` y al imprimir el estado muestra un link **"Abrir el PDF"** (`pppAbrirUltimoPdf`) — lo toca
> el usuario (gesto) → no se bloquea → imprime con Ctrl+P. Respaldo garantizado si la impresión automática
> del iframe no sale.
>
> Nota: **v3.92** — **Talleristas de Recepción: editor de ARTÍCULOS por tallerista** (pedido del usuario).
> En el editor "👷 Talleristas de Recepción", el badge **LK/CH** ahora es un botón (📦): al tocarlo abre un
> sub-overlay (`tallArtsOverlay`, z-index 1260) para **ver/agregar/editar/borrar** los artículos que ese
> tallerista entrega en esa línea. Tabla `Articulos Virgilio X Tallerista`; vínculo **`Cod_Tallerista`
> (= código LK/CH) + `Linea`** (la MISMA query que usa Recepción `renderArticulos`). Cada fila: `Cod_Art` ·
> `Desc` · `Uni_x_Caja` editables inline + Borrar. Al **agregar**, si dejás Desc/U×Caja vacíos y el
> `Cod_Art` ya existe en otro tallerista, los **completa de ahí** (maestro). NOT NULL de la tabla: `Linea,
> Cod_Art, Desc, Tallerista, Uni_x_Caja` (se setean todos). **RLS**: lectura anon (`select_all`), escritura
> con JWT supervisor (`insert_all`/`update_all`/`delete_all` = authenticated) vía `facAuthWriteHeaders` →
> **sin SQL**. Funciones: `tallOpenArts`/`tallArtsLoad`/`tallArtsRender`/`tallArtSave`/`tallArtAdd`/
> `tallArtDelete`. ⚠ Los artículos se ligan por **código**: si cambiás el código LK/CH de un tallerista,
> sus artículos viejos (con el código anterior) quedan con ese código.
>
> Nota: **v3.91** — **PPP / Imprimir: ruteo de carpeta por N° de pedido + prefijo real**. Regla del usuario:
> NP que empieza con **4** → PDF en `X:\PDF_ISISCHEF`; empieza con **9** → `X:\PDF_ISIS`. `_pppOrderDirsForNp`
> ordena las carpetas para buscar **primero en la correcta** (identifica la CHEF por el nombre, `/chef/i`),
> con fallback al resto. Si no encuentra y la carpeta que correspondía NO está conectada, el cartel lo
> **avisa** ("empieza con 4 → va en PDF_ISISCHEF, conectala"). El **formato real** del archivo es
> `Pedido de Clte._Div_000000097904_00.pdf` — con **punto** después de "Clte" (el `PDF_PREFIX` viejo decía
> `Clte_` sin punto: por eso la búsqueda por nombre exacto de ≤v3.89 fallaba). Desde v3.90 la búsqueda es
> por NÚMERO, así que el prefijo/punto ya no importan; `PDF_PREFIX` quedó solo de referencia (corregido).
>
> Nota: **v3.90** — **PPP / Imprimir: búsqueda de PDF por NÚMERO (robusta) + diagnóstico**. Antes
> `pppFindNpPdf` **armaba el nombre exacto** (`PDF_PREFIX` + NP con ceros + `_NN.pdf`) y fallaba si el
> prefijo o el relleno difería (típico entre `PDF_ISIS` y `PDF_ISISCHEF`). Ahora **lista la carpeta** y
> compara el **número embebido** en cada `.pdf`: el NP = la corrida de dígitos más larga del nombre
> (`nm.match(/\d+/g)`), el sufijo `_NN` = versión (se queda con la más alta). Anda con cualquier prefijo y
> cualquier cantidad de ceros, y no confunde 97904 con 979040/97905 (probado). `pppPrintTanda` usa
> `_pppIndexDirs(dirs)` (1 pasada por carpeta → `Map(NP→archivo)`). Si NO encuentra, el cartel ahora muestra
> **nombres reales** de la carpeta (`_pppDirSamples`) para ver el formato. `PDF_PREFIX`/`PDF_WIDTHS`/
> `PDF_VERS` quedan solo de referencia (ya no se usan para construir el nombre).
>
> Nota: **v3.89** — **PPP / Carpeta PDF: soporte de VARIAS carpetas** (pedido del usuario: los PDF están en
> `X:\PDF_ISIS` **y** `X:\PDF_ISISCHEF`). Antes la app conectaba **una sola** carpeta. Ahora guarda una
> **lista** (`PDF_DIRS_KEY = "pdf_isis_dirs"`, array de handles en IndexedDB vía `fshGet/fshSet`) y al
> imprimir busca el PDF en **todas** (`pppFindNpPdfAny(dirs, np)` → primer match). El botón **🖨️ Carpeta(s)
> PDF** ahora **agrega** una carpeta por click (`pppConnectPdfDir` → `_pppPickPdfDir`, dedupe por
> `isSameEntry`); el estado lista todas con ✓/🔒 y un link **olvidar** (`pppForgetPdfDir`, borra la lista).
> `pppGetPdfDirs(interactive)` devuelve las carpetas con permiso concedido. **Migración**: `_pppLoadPdfDirs`
> incorpora el handle único viejo (`pdf_isis_dir`) a la lista y borra la clave vieja. Recordatorio del
> **bloqueo de Chrome** (v3.88): hay que elegir la **subcarpeta** (`X:\PDF_ISIS`), no el disco `X:\`.
>
> Nota: **v3.88** — **PPP / Carpeta PDF: guía ante el bloqueo de Chrome** ("Esta carpeta no se puede abrir…
> contiene archivos del sistema"). NO es un bug: el File System Access API (`showDirectoryPicker`) **bloquea
> carpetas sensibles** — la **raíz de un disco** (`C:\`, `D:\`, `Z:\`), la carpeta de usuario, Escritorio,
> Windows, Archivos de programa, etc. **Solución (lado usuario)**: elegir la **subcarpeta** donde están los
> PDF (ej. `Z:\PDF_ISIS`, no `Z:\`), o copiar los PDF a una carpeta común (Documentos) y elegir esa.
> **Cambios de código**: el picker ahora abre con `startIn: "documents"`, el `confirm` avisa que no se puede
> elegir el disco entero, y el `catch` (no-Abort) explica el caso «contiene archivos del sistema». Tooltip
> del botón **🖨️ Carpeta PDF** actualizado.
>
> Nota: **v3.87** — **PPP: tabla sin scroll horizontal (garantizado)** (pedido del usuario: "no quiero
> scrollear"). Las columnas largas **Razón Social** (`.ppp-cli`), **Localidad** (col 7) y **Zona** (col 9)
> ahora envuelven con `overflow-wrap:anywhere` → su ancho **mínimo** deja de depender del texto. Resultado
> medido (Playwright, peor caso): el **mínimo** de la tabla es **~917px fijo**, y como la PPP está topeada
> en **1240px** (`#pppOverlay .planim-body > *{max-width:1240px}`), **nunca hay scroll** en monitor/laptop
> (sólo aparecería por debajo de ~920px de ancho de contenedor). El `.ppp-tablewrap{overflow-x:auto}` queda
> como red de seguridad pero no se dispara.
>
> Nota: **v3.86** — **PPP: buscador + tandas con error en rojo + imprimir por tanda + tabla más compacta**
> (pedido del usuario). (1) **Buscador** (`#pppSearchInp`, `_pppSearch`/`pppSetSearch`/`_pppSearchStr`):
> filtra por **cualquier dato** de la fila (NP, cliente, cód, tanda, localidad, zona, fecha, tipo) y sólo
> muestra coincidencias (filtra `programados`/`aProgramar`/`entreg` → los contadores de las pestañas
> reflejan los matches); al buscar, las tandas con coincidencias se **abren solas** (`_pppBlock`:
> `open = _pppOpen.has(id) || _pppSearch`). (2) **Tandas con error en ROJO + ⚠️**: en `_pppBlock`,
> `hasErr = pedidos.some(p._err.length)` → clase `ppp-tanda-err` (franja roja) + `⚠️` antes del nombre.
> (3) **Imprimir por tanda**: botón 🖨 en la **franja** (`pppPrintTanda(npsCsv)`) que busca e imprime **todos
> los PDF** de los pedidos de la tanda en secuencia (con Chrome `--kiosk-printing` salen solos; si no, un
> diálogo por PDF). (4) **Tabla más compacta** (sacar scroll + espacios muertos): padding de celda 8/12→5/7,
> botones de fila 5/12→4/8 y font 13→12, `.ppp-cli` min-width 160→130, Localidad min 84→72.
>
> Nota: **v3.85** — **PPP: control POR NP + fix del wrap "feo" + header "Localidad"** (pedido del usuario).
> (1) **Wrap**: el v3.83 había puesto `.ppp-tbl{white-space:normal}` para evitar scroll, pero con el ancho
> de 1240px (v3.84) **envolvía todo** (headers, badges) y quedaba feo. Se volvió a `white-space:nowrap` y
> sólo envuelven las columnas largas: **Razón Social** (`.ppp-cli`, ya envolvía) y **Localidad**
> (`.ppp-tbl td/th:nth-child(7){white-space:normal}`). (2) **Control POR NP, no por tanda**: en solo-lectura
> se **sacó** el botón **"✓ Controlar"** de la franja (`entBtn` gateado a `!PPP_READONLY`) y el panel
> **"✓ Controlar TODA la tanda"** (`pppControlarTanda`, ahora `if(!PPP_READONLY)`). En su lugar, cada fila
> de la pestaña **Programación** tiene un botón **Controlar / ✓ Controlado** (toggle `pppControlarToggle`,
> verde lleno = controlado, outline = sin controlar; sólo `_pppTab==="plan"`). Sigue siendo **local**
> (`vir_ppp_entregados`, no emite CRN); controlado + aún en Supabase ⇒ alarma 🚮 SACAR. (3) Header de la
> tabla **"Localidad / Barrio" → "Localidad"** (`PPP_THEAD`). Celda de acciones `.ppp-acc` (nowrap,
> derecha) con los botones Controlar + 🖨.
>
> Nota: **v3.84** — **PPP: layout compacto (ancho máx 1240px centrado, no 100%) + "✓ Controlar" local
> reactivado** (pedido del usuario: "nunca hace falta usar el 100%; optimizá los espacios"). (1) **Ancho**:
> el v3.83 había puesto la PPP a `max-width:none` (100%) → quedaba enorme. Ahora `#pppOverlay .planim-body
> > *{max-width:1240px}` + `align-items:center` → **columna centrada de 1240px**. (2) **Espaciado más
> compacto**: `.ppp-tanda` margin-bottom 12→5px y radio 12→10px; `.ppp-tanda-h` padding 10→6px y grid
> flexible (`18px 200px 1fr 120px auto`, antes anchos fijos 460/124); `.ppp-sec-t` margin 18→11 / padding
> 7→5 / fuente 14→13; `.ppp-tabs` margin 14/12→6/8; `.ppp-preview` margin-top 14→6; gap del `.planim-body`
> del PPP 12→8. (3) **"✓ Controlar" anda de nuevo desde la PPP** (segunda vía, **local**, lo eligió el
> usuario): en `_pppRowTrRO` volvió el tilde **✓ Controlado** por fila (clase `ppp-ctrl-only`, se ve sólo
> en modo Controlar) y el botón **✓ Controlar** de la franja sigue (abre `pppSetMode('ctrl')` →
> `pppControlar`/`pppControlarTanda`, escribe `vir_ppp_entregados` **local**). El **✏️ Editar** y su panel
> (fecha/devolver) quedan **ocultos en solo-lectura** (eso se corrige en Excel). ⚠ El tilde de la PPP es
> LOCAL (no emite CRN ni va a Supabase): se ve sólo en ese navegador. El control "real" sigue siendo el
> **RR** del operario (CRN → Supabase). Un pedido marcado como controlado y aún en la Programación de
> Supabase dispara la alarma **🚮 SACAR** (sacarlo del Excel).
>
> Nota: **v3.83** — **PPP: ancho completo (sin scroll) + "Sugerir tandas" solo-lectura e imprimible**
> (pedido del usuario). (1) **Ancho**: la PPP estaba limitada a **560px** por `.planim-body > *{max-width:560px}`
> (cap del editor de planimetría, v3.67) → la tabla de 12 columnas se salía con scroll horizontal. Override
> `#pppOverlay .planim-body{align-items:stretch}` + `> *{max-width:none}` → usa **todo el ancho de la
> página**; y `.ppp-tbl{white-space:normal;table-layout:auto}` (antes `nowrap`) → el texto largo (razón
> social, localidad) **envuelve** en vez de forzar scroll. (2) **Sugerir tandas (solo-lectura)**: en modo
> `PPP_READONLY` volvió el botón **🪄 Sugerir tandas**, pero NO edita: `pppSugerirView` calcula la
> sugerencia con el MISMO algoritmo que `pppSugerirTandas` (`_pppComputeSugerencia`: súper 1×cliente; resto
> por zona→cliente empacando ≤ m³/tanda; códigos `C<N°base><letra>`) **sin escribir edits**, y la muestra
> en un overlay `#pppSugOverlay` (`_pppSugHtml`: una tabla por tanda con NP·Cód·Cliente·Localidad·m³ +
> totales + aviso de los SIN ZONA que quedan afuera). Sirve para que la operadora la **cargue a mano en el
> Excel**. (3) **Imprimible**: botón 🖨 Imprimir (`pppPrintSug`) abre la sugerencia en una ventana nueva con
> CSS propio (`_PPP_SUG_PRINT_CSS`) y dispara `window.print()`. El N° base de la sugerencia sale del auto
> (v3.78, última tanda Supabase +1). No toca la PPP ni Supabase.
>
> Nota: **v3.82** — **PPP = visor SOLO-LECTURA de Supabase + panel de errores** (pedido del usuario: "por
> ahora que solo funcione en función de Supabase, que no corrija nada, solo visualizar; se sigue
> corrigiendo en Excel"). Flag **`PPP_READONLY = true`** (poner `false` vuelve a la PPP editable). En
> modo lectura: (a) `merge` ignora `vir_ppp_edits` y `pppLoadProgFromSupabase` no suma extras locales →
> la vista es **Supabase puro**; (b) se ocultan los controles de edición (Sugerir/Confirmar/N° base/borrar,
> el cuadro 🔗 "agregar a tanda", "Tandas armadas", botones OK/↩/✏️/✓); las filas (`_pppRowTrRO`) van como
> **texto** + botón 🖨 Imprimir. (c) **Panel de errores** arriba (`pppErroresHtml`/`_pppComputeErrors`,
> los 4 que pidió el usuario, anota `p._err` y resalta la fila): **🚮 SACAR** = pedido `programmed` cuyo NP
> está en entregados/controlados (CRN/CCR — sigue en la Programación de Supabase pero ya se entregó);
> **⚠ SIN ZONA** = el barrio no cae en ninguna zona (`pppZonaDeBarrio` vacío; no para Súper/Retira/Expo);
> **⚠ ZONA?** = la columna `zona` del Excel ≠ la que da el barrio (compara con `_pppZonaNorm`, formato/acentos);
> **⚠ TANDA** = tanda con rutas/camión mezclados (`_pppRuta`) o varias fechas de entrega. En lectura, los
> entregados **NO** se sacan de Programación (se muestran con el 🚮 para verlos). Verificado contra los
> datos: `zona` en Supabase viene igual que la que calcula la app (`Zona 1 - CABA Sur`…), y hay casos
> reales con `zona=''` (Micro Centro, Villa Sarmiento). ⚠ La PPP **no escribe nada** (ni local ni
> Supabase); las correcciones siguen en el Excel.
>
> Nota: **v3.81** — **PPP: la Programación pasa a salir de Supabase + el import dedupea contra Supabase**
> (pedido del usuario; antes era SOLO LOCAL y mostraba 0 programados aunque Supabase tuviera ~63). (1)
> Al abrir la PPP, `pppLoadProgFromSupabase()` lee **`PPP_Programacion_Diaria`** (`supaFetchAll`) y la usa
> como **BASE** de `_pppParsed.prog` (mapeo en `_pppRowFromSupa`: ⚠ `p.fecha`=`fecha_recep`,
> `p.localidad`=`barrio`; fechas `YYYY-MM-DD`→`dd/mm/aaaa` con `_pppSupaFecha`). Un pedido queda
> **`programmed`** si tiene **tanda O fecha de entrega** (los súper van por fecha; no se deriva por
> `tanda&&fecha` porque la semilla tenía casos con tanda-sin-fecha y fecha-sin-tanda). Las **ediciones
> locales** (`vir_ppp_edits`) siguen mandando **encima** (merge), y los pedidos locales cuyo NP **no**
> está en Supabase (importados sin sincronizar) se **mantienen** (`extra`). Si Supabase falla, queda lo
> local (no rompe). Primero renderiza local (instantáneo) y después reemplaza con Supabase. (2)
> **Dedupe de import**: `pppMergePedidos` ahora **omite** los NP que ya están en Supabase
> (`_pppSupaNps`, set que deja `pppLoadProgFromSupabase`) → al importar Formato PPP no se duplica lo que
> ya está; el status muestra "N ya en Supabase (omitidos)". (3) **Fix**: "↩ devolver a A Programar"
> (`pppPedidoAProgramar`/`pppTandaAProgramar`) ahora setea `programmed=false` + `fecha_entrega=""` (antes
> `delete`) para **override explícito** sobre la base de Supabase (si no, el pedido seguía "programado").
> ⚠ La **semilla** (`PPP_SEED`, 123 ped · ~83 programados en sus `edits`) sigue de fallback local; los
> `edits` viejos pueden pisar Supabase para esos NP (no se limpian para no perder trabajo del usuario).
> **Base Pedidos (Picking)**: el import local sigue inerte (solo timestamp; el picking ya lee
> `PPP_Base_Pedidos` de Supabase directo → sin riesgo de duplicado). El N° base (v3.78-79) no cambió.
>
> Nota: **v3.80** — **PPP: botón "🖨️ Imprimir" por pedido → manda a imprimir el PDF del NP desde la
> carpeta del servidor (ISIS)** (pedido del usuario). Cada fila de pedido (`_pppRowTr`) tiene un botón
> **🖨️ Imprimir** que llama `pppPrintNp(np)`. El admin conecta **UNA vez** la carpeta donde están los PDF
> (ej. `Z:\PDF_ISIS` en `\\LOEKE-SVR`) con el botón **"🖨️ Carpeta PDF"** (`pppConnectPdfDir` →
> `showDirectoryPicker({mode:"read"})`); el handle se guarda en IndexedDB (`vir-fs-handles`, key
> `pdf_isis_dir`) reusando los helpers `fshGet/Set/Del` + `_fshPerm` de la auto-carga del Excel (v3.41).
> **Por qué File System Access y no un link**: una página `https://…github.io` **no puede abrir un
> archivo `Z:\…` directo** (el navegador bloquea `file://`); esta API es la forma web-nativa de leer la
> carpeta local/mapeada. La carpeta tiene **~130k archivos** → NO se escanea: se abre por **nombre exacto**
> con `getFileHandle` (O(1)). Patrón del archivo: `Pedido de Clte_Div_` + **NP con ceros a 12 dígitos**
> (`000000097899`) + `_NN.pdf`; `pppFindNpPdf` prueba versiones `_00.._05` y se queda con la **más alta**
> (ancho 12 primario, fallback 13/11 por si difiere — constantes `PDF_PREFIX`/`PDF_WIDTHS`/`PDF_VERS`).
> **Imprime, NO sólo abre**: `_pppPrintPdf` lee el PDF a memoria (ArrayBuffer), lo carga en un **iframe
> oculto** y dispara `contentWindow.print()` (diálogo de impresión directo); si el navegador bloquea el
> print, último recurso abre el PDF en otra pestaña. ⚠ El diálogo de impresión **siempre aparece** (no se
> puede imprimir 100% silencioso desde el navegador, es por seguridad) — queda a un clic. Sólo **Chrome/
> Edge en PC** (el monitor; en celular no corre, igual que la auto-carga). Estado de la carpeta en
> `#pppPdfDirStatus` (`pppRenderPdfDirStatus`, al abrir la PPP). Sólo lectura → no toca el "SOLO LOCAL".
>
> Nota: **v3.79** — **PPP N° base: ahora se VE de dónde sale (vinculado a Supabase visible)** (el usuario
> reportó "no está vinculado a Supabase": el número salía bien pero sin ninguna señal de que viniera de la
> tabla, y si la lectura fallaba caía a local **en silencio**). Cambios: (1) **nota de origen** bajo el
> toolbar (`#pppBaseNote`, `_pppRenderBaseNote`) — **verde** "🟢 Supabase (Prog. Diaria): última tanda
> C63 → N° base 64" cuando la lectura anduvo, **roja** "🔴 No pude leer Supabase (…) — N° base local: N"
> cuando falla, "✍️ puesto a mano" si lo editás. (2) **Supabase es la fuente primaria**: `base = supaMax
> + 1`; lo local/`baseLast` quedó sólo como **piso anti-colisión** (si aplica, la nota lo aclara
> "ajustado"). (3) **Ya no se queda pegado a local**: sólo fija el día (`baseAutoDate`) si Supabase
> **respondió**; si falla, reintenta al reabrir (cooldown 6s, guard `_pppBaseBusy`). Verificado que el
> **RLS permite la lectura anónima**: `sql/ppp_supabase.sql` tiene `policy ppp_prog_select ... for select
> to anon using (true)` → en el navegador del usuario la lectura de `PPP_Programacion_Diaria` está
> habilitada (el sandbox NO puede probarla: el proxy bloquea `*.supabase.co`, igual que Google). `baseNote`
> + `baseOk` se guardan en `vir_ppp_cfg`. Resto de la lógica de v3.78 igual.
>
> Nota: **v3.78** — **PPP: el "N° base" (con el que se nombran las tandas `C<NN><letra>`) se calcula
> SOLO** (pedido del usuario; antes era fijo `60` a mano). Regla elegida = **un número nuevo por día de
> programación = última tanda en Supabase + 1**: lee la tabla **`PPP_Programacion_Diaria`** (las hojas
> de Programación Diaria espejadas; `pppFetchMaxTandaBase` vía `supaFetchAll`, **solo lectura** — no
> cambia el "SOLO LOCAL" de la PPP), saca el **mayor `C<NN>`** (`_pppBaseNumOf`, formato `C` + número +
> letra; ignora formatos de operario tipo `A15C`) y suma 1. **Mismo día → reusa** el número ya fijado
> (no sube); **día nuevo → recalcula**. Persiste en `vir_ppp_cfg` (`baseN` + `baseAutoDate` + `baseLast`
> high-water). Toma el **máx** entre Supabase, lo **local** (`pppLocalMaxBase`, edits+pedidos) y `baseLast`
> → no se repite ni baja aunque Supabase todavía no haya espejado lo de hoy. Hoy (última = `C63`) da
> **64** → tandas `C64A, C64B…`; mañana **65**. `pppSugerirTandas` ahora **continúa las letras**
> (`_pppLetterIdx`) si re-armás el mismo día (no pisa `C64A`). El campo **N° base** (`#pppBaseNInp`) se
> autocompleta al abrir/renderizar 📥 A Programar (`pppAutoBaseN` en `pppRenderProg`) y **se puede editar
> a mano** igual (un edit manual queda fijado para ese día; al otro día vuelve a autocalcular).
>
> Nota: **v3.77** — **REVIERTE v3.76: RR queda en los operarios Y se suma el botón admin** (aclaración
> del usuario). RR vuelve a la botonera del operario (`filas.row2` incluye `"RR"` de nuevo) y se sacó el
> cleanup de `showOperario` (ya no hace falta). El supervisor tiene **además** el botón **"Recepción
> Remitos (RR)"** en Administración (`openRemitosAdmin` → `showControlRemitos("0", true)`) que abre **la
> MISMA lista que el operario**: NP · Cod Cliente · Razón Social · Líos · Controlado (se quitó la columna
> Demora y `crFmtDemora` que se habían agregado en v3.75, para que sea idéntica). El modo admin sólo
> cambia el comportamiento de fondo (legajo `0`, no cierra ningún toggle). Resumen del modelo: RR lo
> pueden controlar **los operarios (botonera) y el admin (botón)**, los dos sobre la misma lista.
>
> Nota: **v3.76** — *(revertida en v3.77)* RR (Recepción Remitos) pasa a ser SOLO del admin (pedido del usuario). Se
> **sacó el botón RR de la botonera del operario** (`filas.row2`, ya no incluye `"RR"`). El control de
> remitos lo hace ahora el supervisor desde Administración con el botón **"Recepción Remitos (RR)"**
> (el de v3.75, `openRemitosAdmin` → `showControlRemitos("0", true)`; se renombró de "Remitos a
> controlar"). **Cleanup**: `showOperario` cierra cualquier **toggle RR colgado** del operario (`delete
> st.toggles.RR`) — un toggle abierto bloquea EP/TP/AP/TAP, así que sin el botón quedarían trabados. El
> resto de la infra RR (dispatch `code==="RR"`, `TOGGLE_CODES`, `INC_TOGGLE`, `SURVIVING_TOGGLES`) se
> deja: es inofensiva sin botón y el cleanup la neutraliza. **CR** (Control Remitos, otra cosa) sigue en
> la botonera del operario.
>
> Nota: **v3.75** — **Admin: botón "🚚 Remitos a controlar"** (pedido del usuario). Da al supervisor
> la MISMA lista de RR (`showControlRemitos`) — cargados al camión sin controlar, con cliente (PPP +
> "Pedidos Entregados"), líos y **Demora** desde que se cargó — y puede **tildar Controlado**. Botón
> nuevo en el panel de Administración (`openRemitosAdmin`). Se reusa todo el código de RR con un flag
> `_cr.admin`: el título cambia, se agrega la columna **Demora** (`crFmtDemora`, sólo en admin), y al
> «Terminé» emite **CRN** por NP igual que el operario **pero NO cierra ningún toggle RR** (el admin no
> tiene botonera). Usa **legajo "0"** (sistema, excluido de reportes de operario, igual que CRA); el
> CRN igual mueve el pedido a Pedidos Entregados y limpia la alarma "🚨 SIN CONTROLAR" del PPP. NO es
> lo mismo que **🏭 "Carga Recepción Mercadería"** (esa es la mercadería que ENTRA de talleristas).
>
> Nota: **v3.74** — **Recepción Remitos (RR): el cliente de los NP arrastrados sale de "Pedidos
> Entregados"** (pedido del usuario). Síntoma: RR mostraba **Cod Cliente / Razón Social en "—"** para
> casi todos los NP. Causa: esas dos columnas salían SÓLO del **PPP del día** (`fetchMonitorSheet`); los
> NP cargados en días anteriores (backlog cargado-sin-controlar, ventana de 7 días) **ya no están** en
> la PPP de hoy → "—". **Fix**: nuevo `fetchEntregadosMeta()` lee la hoja **"PPP Excel Pedidos Entregados
> 2026"** (`MONITOR_HISTORIC_CSV_URL`, gid `2146771217`) y arma `NP → {cod, rs}`; `fetchCRData` lo usa
> como **fallback** sólo para los NP que faltan (no lee la hoja si no hace falta). La hoja usa el **mismo
> layout de columnas que la PPP** en las filas recientes (`NP=col2, COD=col4, RS=col5`; filas viejas tienen
> la Razón en col6 → fallback; indexa col1 y col2 porque en filas viejas el N° está en col1). Cacheado 5
> min. ⚠ Los **Líos** siguen saliendo de `TAL` (armado): si una tanda no cargó los líos, quedan en "—"
> igual (eso NO lo arregla esto). No se tocó Carga Camión (CC ya saca la razón de `Facturacion_NP`).
>
> Nota: **v3.73** — **Planimetría: el código 513 pasa de sector D36 → F13** (pedido del usuario).
> En `planimetria.js`: `"513":["D36",100]` → `"513":["F13",100]`. Se cambió **sólo el sector**; el
> orden de picking queda en **100** (no se tocó la secuencia). Cache-buster `planimetria.js?v=3.73`.
> No hay override en Supabase para 513, así que manda la estática. ⚠ Con orden 100 el 513 se levanta
> entre los códigos del sector D (orden 100–103); si se quiere que se levante junto con los otros de
> F13 (~orden 104), hay que reordenar aparte.
>
> Nota: **v3.72** — **Planimetría: alias con cero adelante para TODOS los códigos de 2 dígitos**
> (pedido del usuario, generaliza v3.70/v3.71). En vez de ir uno por uno, se agregó a `planimetria.js`
> el alias `"0XX":["sector",orden]` = `"XX"` para **cada código numérico de 2 dígitos** (12 nuevos:
> 052,053,054,055,058,059,066,067,070,034,043,097 — los 5 previos 026/027/031/057/099 ya estaban →
> 17 en total). Mismo sector que el gemelo, sin colisiones (el script saltea los que ya tenían alias).
> Cache-buster `planimetria.js?v=3.72`. ⚠ Siguen siendo alias **sobre el archivo generado**: si se
> regenera del Excel se pierden (re-correr el script o que la hoja "Picking" ya traiga el cero). Los
> códigos de **1 dígito no existen** en la planimetría, y los de **3+** ya vienen completos, así que
> con esto queda cubierto todo el rango de ceros adelante numéricos.
>
> Nota: **v3.71** — **Planimetría: más alias con cero adelante 031/099** (mismo caso que v3.70).
> Se agregaron a `planimetria.js`: `"031":["H45",158]` (=`31`) y `"099":["L09",177]` (=`99`),
> mismo sector que su gemelo. Cache-buster `planimetria.js?v=3.71`. Mismo ⚠ que v3.70 (son alias
> manuales sobre el archivo generado; si se regenera del Excel, re-agregarlos).
>
> Nota: **v3.70** — **Planimetría: alias con cero adelante 026/027/057** (reporte de campo:
> tanda **C54D**, legajo 8, "SIN PLANIMETRÍA"). Mismo patrón de ceros que la "E" (v3.43/44): el
> picking lee la base por `/export` y trae los códigos **como texto con cero adelante** (`026`),
> pero `planimetria.js` (`window.GONDOLA`) los tenía **sin** cero (`26`). El lookup es exacto
> (`gOf = G[String(c).toUpperCase()]`, **no normaliza** ceros) → `G["026"]` no encontraba `"26"` →
> `PSP` (Picking sin planimetría) + aviso Telegram. **Fix de datos**: se agregaron a `planimetria.js`
> los alias `"026":["F01",107]` (=`26`), `"027":["F05",106]` (=`27`), `"057":["B57",18]` (=`57`) —
> **mismo sector** que su gemelo. Bump del cache-buster `planimetria.js?v=3.70` (si no, el browser
> sirve el cacheado). ⚠ `planimetria.js` es **generado** de la hoja "Picking" de `AAA_PPP_Vigente.xlsm`:
> si se regenera, estos alias se pierden salvo que se sumen también a esa hoja (o se cargue por el
> editor de planimetría → Supabase, que mergea sobre la estática y sobrevive a la regeneración).
> 💡 Pendiente/opción ofrecida: **normalizar ceros en el lookup** (`gOf` probar `G[cod]` y
> `G[cod.replace(/^0+/,"")]`) cerraría toda la clase de bug de una, sin alias manuales (no implementado
> por ahora: toca la lógica de pares Nacional/Importado y el aviso PSP).
>
> Nota: **v3.69** — **Control Remitos (CR): pasa de *toggle plano* a una pantalla de control**
> (pedido del usuario; cierra "los facturados con líos tienen que aparecer en CC **y en CR**").
> **Modelo confirmado por el usuario**: CR y CC **se nutren los dos de los NP facturados** del
> reparto (misma fuente: `Facturacion_NP` cerrados ≥ `CC_REPARTO_DESDE_ISO`), pero son **pasos
> independientes** — un NP está en CC hasta que se **carga** (`CCN`) y en CR hasta que se
> **controla** (`CCR`). **RR se nutre de lo que marca CC** (`CCN`), eso **no cambió**. Al tocar
> **CR** se abre un popup (`showControlRemitosCR`/`fetchCCRData`/`ccrRender`, espejo de Carga
> Camión) con NP · Razón Social · **Líos** (de `TAL`) · **Controlado** (tic); al «Terminé Control»
> manda un **`CCR`** (`texto="NP|TANDA"`, id determinístico `ccr_<legajo>_<np>_<día>` + upsert) por
> NP tildada y cierra el toggle CR. **El NP controlado desaparece SÓLO de CR** (no resta `CCN`) y
> **`CCR` NO alimenta RR** (a diferencia de CC, que sí: RR lee `CCN`). `CCR` está en el `isUpsert`
> (index.html + sw.js); lo **ignoran** el monitor y el módulo de inconsistencias (no está en
> `INC_CORE`/`INC_TOGGLE`), igual que `CCN`/`CRN`. Wiring del botón CR igual que CC/RR (re-toque
> re-abre el popup; el cierre es sólo por «Terminé»). 📦 **A futuro (guardado, NO implementado)**:
> medir **productividad de CC y CR en m³/hora** = Σ m³ de los NP con `CCN` (CC) / `CCR` (CR) sobre
> el **tiempo del toggle** (ej.: 2 m³ en 1 h → 2 m³/h). Los eventos ya llevan `NP|TANDA` + timestamp
> y el toggle CR/CC ya registra apertura/cierre → alcanza para cruzar los m³ (del PPP/Sheet) después.
>
> Nota: **v3.68** — **Carga Camión (CC): ahora muestra la cantidad de líos por NP** (📦), pedido
> del usuario ("los NP facturados tienen que aparecer en CC … con la cantidad de líos"). Los líos
> salen de los eventos **TAL** (anotados al terminar armado), el **mismo origen** que ya usa
> Recepción Remitos (RR). `fetchCCData` ahora también trae los `TAL` (ventana 7 días) y arma un
> `Map` NP→líos; cada item lleva `lios` (o `null` si el armador no lo cargó). `ccRender` agrega
> `📦 N` por fila (gris `—` si no hay dato, gris si es 0; clases `.cc-lios`/`.cc-lios0`). No cambia
> qué NP aparecen (siguen siendo el reparto: facturados+cerrados − cargados) ni los eventos.
> ⚠ **Pendiente (a definir con el usuario)**: hacer que **CR = Control Remitos** (hoy *toggle plano*
> desde la v3.45, sin lista; distinto de RR) muestre también los facturados con líos — falta decidir
> si CR sólo **muestra** la lista o además lleva un tic "Controlado" registrado (evento nuevo).
>
> Nota: **v3.67** — Editor de Planimetría, polish estético: todo el cuerpo se acota a una
> **columna centrada de 560px** (`.planim-body{align-items:center}` + `.planim-body > *{max-width:560px}`)
> → ya no se estira a todo el ancho ni queda el hueco. Filas con **hover** (sombra suave),
> botones Guardar/Borrar de **igual alto** (42px) con hover, inputs con **anillo de foco**, la
> columna Sector más justa (150px) y el N° de orden centrado. Solo CSS de `#planimEditorOverlay`.
>
> Nota: **v3.66** — Editor de Planimetría: (a) el buscador **vacío ahora muestra TODAS las
> ubicaciones** (antes pedía buscar algo) **ordenadas por N° de orden** (orden de góndola, no
> alfabético) — `planimRender` ordena por `ordOf`, cap 500. (b) La columna **Sector** dejó de
> ocupar el 100% (`flex:1 1 120px` → `flex:0 1 220px` en `.plh-sec`/`.planim-row-sec`) y los
> botones Guardar/Borrar se alinean a la derecha (`margin-left:auto`). Además, **limpieza en
> Supabase**: se deduplicaron policies RLS (se borraron las `{authenticated}`-solo que estaban
> de más en `Control_Modo_OP` y `Entregas …`, quedando las `{anon,authenticated}`) y se
> normalizó la única fila `estado='listo'` → `'procesado'`.
>
> Nota: **v3.65** — limpieza post-auditoría de `recepcion.js`: se sacó el **CSS muerto** que
> quedó de los reworks de Pendientes (bloque del checklist `chk*` de v3.58 y de las tarjetas
> v1 `pendList`/`pendItem`/`pendElapsed`/…) y la función **`pendTd`** (la usaba la versión
> tabla, ya no). Sin cambios de comportamiento. Auditoría: sintaxis OK, sin funciones
> rotas/llamadas-sin-definir; backend OK (columnas + RLS de `Control_Modo_OP`, bucket
> `remitos`, policies de Entregas), 0 archivos huérfanos. `recepcion.js?v=3.65`.
>
> Nota: **v3.64** — Pendientes: la **Demora** (`.pcDemora`, "⏱ Xhs") se agranda a 18px (vs 13px
> del resto de la meta) para que se note. `recepcion.js?v=3.64`.
>
> Nota: **v3.63** — Pendientes: las tarjetas tienen **ancho fijo** (360px) en vez de estirarse
> (`1fr`) → cada una mide siempre lo mismo haya 2 o 7, y entran las que quepan por fila
> (`grid-template-columns: repeat(auto-fill, minmax(min(100%,360px), 360px))`). `recepcion.js?v=3.63`.
>
> Nota: **v3.62** — Pendientes optimizado **para PC** (lo usa una operadora en monitor): las
> tarjetas pasan de una columna a una **grilla multi-columna** (`grid-template-columns:
> repeat(auto-fill, minmax(340px,1fr))`) usando **todo el ancho** (clase `pendWide` en `opPage`
> → saca el cap de 780px) → se ven varias recepciones por fila y se **scrollea mucho menos**.
> Tarjetas un poco más compactas. `recepcion.js?v=3.62`.
>
> Nota: **v3.61** — fix visual en Recepción: el header sticky del Modo OP (`.opHeader`) no
> tenía `z-index`, así que al scrollear Pendientes las tarjetas (y su botón Enviar) se
> pintaban **por encima** de la barra "Pendientes". Se le puso `z-index:6` → ahora el header
> tapa lo que scrollea debajo. `recepcion.js?v=3.61`.
>
> Nota: **v3.60** — **Pendientes pasó de TABLA horizontal a TARJETAS verticales** (pedido del
> usuario; evita scroll horizontal y deja los controles grandes/claros). Cada recepción = una
> tarjeta: header (Tallerista + Tipo + RTO/FC), meta (Fecha · Hora · Marca · ⏱ Demora en vivo),
> Entrega (detalle + total), y debajo las acciones en filas: **Carga ISIS** (tilde), **Control
> Partes Talleristas** (tilde "Corresponde" + botón "No corresponde"), **Faltantes x Día**
> (tilde), **Foto RTO** (adjuntar/arrastrar → Storage). Pie con **Enviar** → código de 4 díg.
> El tilde se rediseñó (checkmark dibujado con `::after`, más prolijo). Misma lógica de
> persistencia viva en Supabase de v3.59 (UPDATE por toque, nada en localStorage; `pendCard`/
> `pendCheckRow`/`pendPartesRow`/`pendFotoRow` reemplazan las celdas de tabla). `recepcion.js?v=3.60`.
>
> Nota: **v3.59** — **Pendientes (Marianela) = TABLA con acciones por fila, todo en
> Supabase (NADA en localStorage)**. Columnas: Fecha · Hora · Demora (en vivo, "Xhs"/"X,5hs"
> desde `created_at`) · RTO/FC · Tipo · Marca (línea) · Tallerista · Entrega (detalle) ·
> **Carga ISIS** (tick) · **Control Partes** (tick "Corresponde" + botón "No corresponde") ·
> **Faltantes x Día** (tick) · **Foto RTO** (adjuntar/arrastrar → sube a Storage bucket
> `remitos`) · **Enviar**. Cada tick/foto se **persiste al toque** (`pendPersist` = UPDATE de
> la fila; **no duplica**, y al recargar la fila vuelve con lo guardado — columnas nuevas en
> `Control_Modo_OP`: `isis bool`, `control_partes text`, `faltantes bool`, `foto_url text`,
> `codigo text`). **Enviar** (habilitado con los 4 completos) genera un **código de 4 dígitos
> único del día** (`pendGenCodigo`), lo guarda con `estado='procesado'` + `procesado_at`, y lo
> muestra en la fila. Se reemplazó el checklist en pantalla aparte (v3.58) por esta tabla.
> Storage: bucket público `remitos` + policies insert/select para anon/authenticated.
> `recepcion.js?v=3.59`.
>
> Nota: **v3.58** — **Recepción → Pendientes: botón "Procesar" + checklist de Marianela +
> horas en vivo**. (a) El botón de cada pendiente ahora dice **"Procesar"** (antes "Listo").
> (b) Cada fila muestra **⏱ "hace X h Y min"** desde `created_at` (cuándo se cargó por RT),
> refrescado **en vivo** cada 30 s (`pendFmtElapsed`/`pendTickElapsed`/`_pendTimer`). (c) Al
> tocar **Procesar** se abre un **checklist** (`pendAbrirChecklist`/`renderChecklist`, step
> `"checklist"`) que Marianela tiene que confirmar: **Carga a ISIS · Control Partes Talleristas
> (botones Corresponde / No corresponde) · Faltantes x Día · Enviar la foto del remito**. Recién
> con los 4 tildados se habilita **"✓ Procesar recepción"**, que hace **SOLO UPDATE** de la fila
> existente (`estado='procesado'`) → **no se duplica en Supabase**, y vuelve a la lista (la
> recepción ya sale de Pendientes). ⚠ Por ahora el checklist es un **gate** (no persiste qué
> tildó); si se quiere auditoría (ISIS/corresponde/etc.) se agrega columna + se guarda en el
> mismo UPDATE. La foto del remito es un **tilde de confirmación** (no sube archivo todavía).
> `recepcion.js?v=3.58`.
>
> Nota: **v3.57** — **Recepción (supervisor): menú LOCAL Carga / Pendientes + checklist
> "Pendientes"**. El botón "Carga Recepción Mercadería" ahora abre `window.openRecepcionMenu()`
> (en `recepcion.js`): un menú con **✍️ Carga Manual** (el flujo del operario) y **📋 Pendientes**.
> **Pendientes** lista las recepciones cargadas leyendo **`Control_Modo_OP`** (`estado='pendiente'`,
> orden por `created_at` desc) — fecha · tallerista/prov · línea · RTO/FC · detalle (códigos·cajas) ·
> total — con un botón **✓ Listo** por fila que la marca revisada (`update estado='listo'`) y la saca
> de la lista. Lee/escribe con la sesión anónima del módulo (`supabase` en recepcion.js). Navegación:
> nuevo flag `opState.fromMenu` (operario RT entra directo a la carga sin "Atrás"; el supervisor ve
> "Atrás" → vuelve al menú); `opResetState` extraído de `openOp`. ⚠ Requiere la tabla
> **`Control_Modo_OP`** + RLS (insert/select/update para anon/authenticated) — SQL por chat; si falta,
> Pendientes avisa "¿falta la tabla/permisos?". `recepcion.js?v=3.57`.
>
> Nota: **v3.56** — **"Carga Recepción Mercadería" (supervisor) ahora es 100% LOCAL**. El
> usuario **borró** la app externa `Control-Carga-Remitos-FC`, así que el iframe del panel
> Admin daba **404**. Se quitó el iframe (overlay `#recepcionAdminOverlay`, `recpOpen`,
> `recpShowChooser`, `recpAutoNav`, `closeRecepcionAdmin`, `RECEPCION_ADMIN_URL`/`_CARGA_URL`)
> y `openRecepcionAdmin` ahora abre el **Modo OP embebido** `window.openRecepcionOp()` de
> `recepcion.js` (el mismo que usan los operarios al tocar **RT**), sin legajo (no toca el
> acumulador de cajas del RT). ⚠ Para que **guarde** hace falta la **policy RLS de INSERT**
> en `Entregas Tallerista Virgilio` / `Entregas Prov AT` (sesión anónima → rol
> `authenticated`); si no, salta *"new row violates row-level security policy"*. La opción
> **"Pendientes"** del chooser viejo no quedó embebida (era la home de la app borrada).
>
> Nota: **v3.55** — **Revertido el corte de v3.54** en `facFetchFcKeys`. El backlog de tandas viejas
> en "a facturar" no era por falta de un corte en el código, sino porque **la PPP no estaba
> actualizada** (la Programación Diaria todavía tenía esas tandas ya entregadas). Como "a facturar"
> se nutre de la PPP, el fix correcto es **actualizar la PPP** (sacar/mover las entregadas), no meter
> un corte por fecha de armado que además podría esconder tandas legítimas. `facFetchFcKeys` vuelve a
> marcar FC con solo `TP` + `TAP` (sin filtro de fecha). El corte del **CC** (`CC_REPARTO_DESDE_ISO`
> en `fetchCCData`) se mantiene: ese sí filtra `Facturacion_NP` (otra fuente, no la PPP).
>
> Nota: **v3.54** — *(revertida en v3.55, ver arriba)* corte de go-live por fecha de ARMADO (TAP) en
> "a facturar". Se descartó: el backlog salía por la **PPP desactualizada**, no por falta de corte.
>
> Nota: **v3.53** — **Contador "NPs facturados hoy" ya no se resetea al "Generar PDF"**. Mostraba
> `_facNpsHoy.size` (facturados **pendientes de cierre**), así que al cerrar (PDF) los NP pasaban a
> tener `cierre_id` y el contador volvía a **0** (parecía que no se había facturado nada). Ahora
> cuenta los NP con **`facturado_at` de hoy** (BsAs), con o sin cierre → nuevo `_facCountHoy`, que
> `fetchFacturadosTodos` calcula (suma `facturado_at,np` al select). El chip "NPs facturados hoy" y la
> línea de estado usan `_facCountHoy`. Los botones "Generar PDF"/"Revertir" siguen atados a
> `_facNpsHoy` (los pendientes de cierre, que sí es lo que se cierra/revierte).
>
> Nota: **v3.52** — **Carga Camión (CC) = el REPARTO, no los facturados sin cerrar** (cambio de
> modelo, pedido del usuario). Antes el CC mostraba los facturados **sin cerrar** (`cierre_id IS
> NULL`) y al "Generar PDF" desaparecían — al revés de lo correcto. Ahora el ciclo termina cuando se
> **carga al camión**, no cuando se factura. **Nuevo CC** (`fetchCCData` + `showCargaCamion`): muestra
> los NP **facturados y CERRADOS** (`cierre_id` no nulo = ya pasaron por "Generar PDF" / están en un
> reparto) **menos** los ya cargados (eventos **`CCN`**). O sea: aparecen **al Generar PDF**, y
> desaparecen **al cargarlos** (en la próxima apertura, tras "Terminé"). Mismo patrón que Control
> Remitos (cargados − controlados), un paso antes. **Sin ventana de tiempo**: si un NP del reparto no
> se cargó, queda visible (se ve el error) hasta que se carga. **Corte de arranque**
> `CC_REPARTO_DESDE_ISO = 2026-06-22`: lo facturado/cerrado antes se asume entregado a mano (había
> 279 cerrados sin ningún CCN — el flujo de CC por app es nuevo) y NO ensucia la pantalla.
> `Facturacion_NP` ya trae tanda/razón social → el CC no usa el Google Sheet. **El PDF / cierre NO
> cambió.** Monitor: el **✅ "Tandas a FC" ahora PERSISTE** tras el PDF (usa `_facNpsTodos` además de
> `_facNpsHoy`; antes desaparecía al cerrar); la tanda sigue saliendo del panel sola al entregarse
> (`CRN`).
>
> Nota: **v3.51** — **Ajuste del QR de fichada en el TV box**: el QR de v3.50 (clamp 140px) quedaba
> ~3px más ancho que el espacio reservado a la derecha (`padding-right` ~157px del `.monitor-right-bottom`)
> y **tapaba un pedacito de "Total por día"**. Se baja a `clamp(120px, 24vh, 150px)` → entra con ~17px
> de aire, sigue ~3× más grande que el original (40px) y no se solapa. Además se **centra dentro de su
> zona** (`bottom: 20px; right: 12px` en vez de pegado a la esquina 8/8) → márgenes parejos arriba/abajo
> e izq/der. (Nota: con MUCHAS tandas a FC,
> las últimas filas siguen sin entrar en la TV; se evaluó una banda full-width multi-columna pero se
> descartó porque al haber muchas tandas en la tabla izquierda no hay forma de que entre todo en 494px.)
>
> Nota: **v3.50** — **Monitor TV en pantallas CORTAS/achatadas** (TV box ~979×494 "modo
> ordenador"): el layout escalaba por **ancho** (vp-narrow/medium/wide) pero faltaba el eje de
> **alto** → a poca altura el panel derecho (stats + FC + Total) no entraba y los cards de abajo
> ("Tandas a FC", "Total por día") quedaban cortados (había que scrollear). **Fix CSS-only**: nuevo
> bloque `@media (max-height: 560px)` al **final** del `<style>` (gana por orden de fuente a las
> reglas base del modo TV/vp-narrow) que comprime los verticales (header, paddings de tablas, gaps)
> para que entre **sin scroll**. Además **agranda el QR de fichada** en angosto: estaba clavado a
> 40px desperdiciando el ~espacio reservado a la derecha → ahora `clamp(140px, 28vh, 180px)`. No
> toca el JS ni afecta TVs de alto normal (>560px).
>
> Nota: **v3.49** — **FIX Facturación: un NP ya facturado reaparecía como pendiente** (y al
> re-tildarlo se reabría, dejando cierres huérfanos). Síntoma: tildabas un NP, dabas "Terminé —
> Generar PDF" (se generaba el cierre OK) y **el NP volvía a la lista** con su ✓, en un loop; cada
> vuelta dejaba el cierre anterior con 0 NPs. **Causa**: `facRender` ocultaba sólo los facturados
> **pendientes de cierre** (`_facNpsHoy` = `cierre_id IS NULL`), no los ya **cerrados**; si la tanda
> seguía en FC, el NP cerrado reaparecía. **Fix**: nuevo set **`_facNpsTodos`** (todos los NP en
> `Facturacion_NP`, con o sin cierre, vía `fetchFacturadosTodos`) y `facRender` ahora excluye
> `_facNpsHoy` **o** `_facNpsTodos` → un NP facturado (pendiente o cerrado) **no vuelve** a la lista.
> `facRevertir` saca los revertidos de `_facNpsTodos` para que sí vuelvan a pendientes. Se mantiene
> el conteo "facturados hoy" sobre `_facNpsHoy` (pendientes de cierre) y la Carga Camión sigue
> leyendo `cierre_id IS NULL`.
>
> Nota: **v3.48** — **FIX crítico: HTTP 400 en Facturación, Carga Camión, PPP-Supabase y
> Planimetría** por el cache-buster `&_=<timestamp>` en las URLs de Supabase. **Causa**: PostgREST
> (Supabase actualizó la versión y se volvió estricto) interpreta `_=1782…` como un **filtro sobre
> una columna inexistente `_`** y responde **400**. Confirmado en los logs de la API: de los GET
> recientes, los que llevaban `&_=` daban **400** y los que no, **200**. Síntomas: el operario tocaba
> **Carga Camión** y veía "No se pudo cargar (¿sin conexión?). HTTP 400" (`fetchFacturadosHoy` no
> tiene fallback); en **Facturación** el monitor de ventas mostraba "NPs facturados hoy: 0", el
> botón "Terminé — Generar PDF" gris y **NPs ya cerrados reaparecían** (al fallar la query,
> `_facNpsHoy` quedaba vacío → no ocultaba nada ni contaba). **Fix**: se quitó `&_=`+`Date.now()` de
> las 3 llamadas REST a Supabase (`fetchFacturadosHoy`, `supaFetchAll`/PPP, `loadPlanimetriaRemote`);
> el anti-caché ya lo daba `cache:"no-store"`. Los cache-busters `&_=` de las URLs **CSV de Google**
> (picking, volumen, monitor PPP/histórico, fichadas-monitor) se mantienen: Google sí los tolera.
> ⚠ Regla: **nunca** poner `&_=`/params desconocidos en URLs de PostgREST/Supabase; cache-bustear con
> `cache:"no-store"`.
>
> Nota: **v3.47** — **Carga Camión: botón "Terminar sin cargar por app"** (pedido del usuario).
> El popup de Carga Camión (`showCargaCamion`) cuando **falla la carga de la lista** (HTTP 400 /
> sin conexión) o **no hay NP facturados** sólo ofrecía "Cerrar" (que **minimiza** y deja el
> toggle `CC` abierto → el operario quedaba trabado). Se agregó **"✓ Terminar Carga Camión (sin
> cargar por app)"** (`ccEndWithoutLoading`) que **cierra el toggle CC** (evento `CC`, con
> `ts_inicio`) **sin** mandar ningún `CCN` — escape para cuando se cargó el camión sin usar la
> app o la lista no levanta. Pide confirmación. (El flujo normal ya podía cerrar con "Terminé
> (0 cargadas)"; esto cubre los estados de error/vacío donde ese botón no aparecía.)
>
> Nota: **v3.46** — **FIX crítico de compatibilidad: la app NO cargaba en navegadores
> viejos de TV** (kiosko/monitor). El bloque principal de `<script>` de `index.html`
> usaba el operador **`??` (nullish coalescing, ES2020)** en `parseHHMMtoHours(...) ?? 8/17`
> (cálculo de horas trabajadas). `??` recién existe desde **Chrome 80**; el **TV box tiene
> Chrome 75** y la **TV LG** (webOS) es aún más vieja → tiraban **SyntaxError** y abortaba
> TODO el bloque principal de JS, que incluye el código de **modo kiosko** (`?monitor=tv&key=tv`).
> Síntoma: la URL entraba con `&key=tv` pero **NO se borraba la clave** ni abría el Monitor
> → caía al **login** (el `<script>` de `initAuth` es otro bloque y sí parseaba). Se
> reemplazó `?? N` por un chequeo `(_x == null) ? N : _x` (ES2017, mismas semánticas: el
> default solo si es null/undefined, respeta el `0`=medianoche). También se reescribió un
> `Object.fromEntries` (Chrome 73+) a mano por la LG. **Regla:** el proyecto apunta a
> **ES2017** — NO usar `??`, `?.`, `||=`, `?.()`, `replaceAll`, `Promise.allSettled`
> ni nada ≥ES2018 en `index.html` (rompe las TVs). Diagnóstico rápido (v2.52): si el
> `#versionBadge` queda **vacío** = el JS NO corrió (parse error en un navegador viejo).
>
> Nota: **v3.45** — **Se separó el "Control Remitos" en DOS botones** (pedido del usuario).
> Toda la lógica de descarga (popup `showControlRemitos`: tabla de NP cargadas al camión,
> tildar **Controlado**, «Terminé» → un **CRN** por NP + pasar a Pedidos Entregados) pasó del
> botón **CR** a un botón NUEVO **RR = "Recepción Remitos"** (en `filas.row2`). **RR** es ahora
> el toggle que abre/re-abre el popup (1er toque = abre + evento `RR` apertura; «Terminé» =
> `CRN` por NP + cierra el toggle `RR`); reusa todo el código `_cr*`/`crRender`/`fetchCRData`
> (sólo cambió a qué toggle se ata). **CR = "Control Remitos"** quedó como **toggle plano**: el
> operario sólo lo toca **al inicio y al fin** (sin popup, no pide cantidad). Ambos están en
> `SURVIVING_TOGGLES` (`["CR","RR","MG"]`), `TOGGLE_CODES`, `NEVER_INPUT`, `INC_TOGGLE`/`INC_DESC`
> y la sugerencia "Continuar". Los eventos **CRN/CRA** y la integración PPP (controlados →
> Pedidos Entregados) **no cambiaron** (siguen leyendo `CRN`).
>
> Nota: **v3.44** — **Origen del fix de importados (E) en el picking**: `fetchPickingBaseFromSheets`
> ahora lee la base por **`/export?format=csv&gid=845301421`** (pestaña "PPP Excel Base Datos
> Pedidos") en vez de **gviz**. El `export` devuelve los valores **como texto** → respeta los
> códigos `035E` y el cero adelante `026`, que gviz coaccionaba a número y descartaba (v3.43).
> **gviz queda de respaldo** (`PICKING_BASE_CSV_URL_GVIZ`): si el export falla o devuelve HTML
> (login/permiso), cae a gviz para no dejar el picking vacío (detecta HTML con `slice(0,64).trim()`
> empezando en `<`). Con esto, hasta una tanda pickeada **antes** de sincronizar a Supabase trae
> bien los importados. Constantes nuevas `PICKING_BASE_DOC` / `PICKING_BASE_GID`. ⚠ El `export`
> requiere que la hoja sea accesible por link (igual que gviz); si algún día deja de andar, revisar
> el compartido del Sheet.
>
> Nota: **v3.43** — **FIX picking: los códigos IMPORTADOS (terminados en "E") no se
> pickeaban**. Diagnóstico (datos): en 60 días, 0 de 398 `PKC` tenían código E, pese a que
> los E son ~25% de la base. El picking suma la base por NP; cuando a la tanda le faltaban
> NP en Supabase (pedidos del día sin sincronizar), el fallback **reemplazaba TODO** el
> agregado con la hoja de Google (`fetchPickingBaseFromSheets`). Esa hoja, leída vía
> **gviz** (`tqx=out:csv`), **infiere la columna Artículo como NUMÉRICA** → descarta los
> códigos **texto** `035E` (los devuelve vacíos → `if(!art)continue` los saltea) y les saca
> el cero (`026`→`26`). Por eso desaparecían los importados de toda la tanda. **Fix (app)**:
> el fallback ahora **solo rellena los NP faltantes** desde Sheets, **sin pisar** los que
> Supabase trae bien (con la E) → apenas la tanda sincroniza a Supabase, el picking muestra
> los importados. ⚠ **Pendiente (origen)**: una tanda pickeada ANTES de sincronizar todavía
> cae a gviz (sin E); se cierra haciendo que la hoja entregue la columna **Artículo como
> TEXTO** (formato Texto plano en el Sheet, o leerla con `/export?format=csv&gid=…` en vez
> de gviz). La base correcta vive en `PPP_Base_Pedidos` (Supabase).
>
> Nota: **v3.42** — **El "picking" ya estaba en la auto-carga (v3.41), era cuestión de
> nombre**: el archivo del picking es el que la app llama **"Base Pedidos"**
> (`PPP Excel Base Datos Pedidos`, Pedido·Artículo·Cajas) — la misma fuente que usa el
> picking en vivo. Se **renombró a "Base Pedidos (Picking)"** en el botón de import, en
> el cartel de "última importación" y en la fila de auto-carga (`PPP_AUTO_LABEL.base`),
> para que se vea claro que ese slot ES el picking. Comportamiento idéntico al Formato
> PPP (elegir 1 vez → auto-levanta al cambiar, con anti-duplicado por firma). Aclaración:
> el picking *en vivo* (flujo EP `fetchPickingBase`) sigue leyendo de Google Sheets /
> Supabase (se refresca solo); este import local de Base Pedidos sigue SOLO LOCAL.
>
> Nota: **v3.41** — **PPP: auto-carga del Excel desde una carpeta local** (File System
> Access API; pedido del usuario). En vez de importar a mano, el supervisor **elige el
> archivo una vez** (botón "Elegir archivo" en el menú ⬆ Importar, para Formato PPP y/o
> Base Pedidos) y la app lo **levanta solo** al abrir la PPP y cada 3 min mientras esté
> abierta. ⚠ **Solo Chrome/Edge en PC** (la API no existe en Safari/Firefox/iOS → ahí se
> degrada y queda solo el import manual, que **sigue disponible**). El **handle** se
> guarda en IndexedDB (DB aparte `vir-fs-handles`, sobrevive recargas); tras reiniciar el
> navegador el permiso se re-confirma con **1 clic** ("🔓 Reconectar"). **ANTI-DUPLICADO**
> (los 2 reportes se pisan a diario en la misma ruta): guarda una **firma** por archivo en
> `vir_ppp_auto` (`{name,meta,hash,ts}`) — `meta`=lastModified+size, `hash`=SHA-256 del
> contenido; si la `meta` no cambió, o el `hash` es igual a lo último importado, **NO**
> re-importa (evita duplicar). Si cambió, llama al mismo `pppHandleFile` (que ya dedupea
> por NP y conserva las ediciones de tanda). Funciones: `fshOpen/Get/Set/Del`,
> `pppAutoPick/Check/CheckAll/Start/Stop/Forget/Reconnect/RenderStatus`, `_sha256Hex`,
> `_fshPerm`; `pppHandleFile` ahora acepta `(tipo,f,buf,quiet)`. UI en `#pppAutoBox`
> dentro del menú de import. Sigue SOLO LOCAL.
>
> Nota: **v3.40** — **PPP: sugerir agregar un pedido de "A Programar" a una tanda YA
> en Programación del mismo cliente** (pedido del usuario). En el tab 📥 A Programar,
> arriba, aparece un cuadro 🔗 (`.ppp-match-box`) con cada **cliente que ya tiene tanda
> en Programación** y sus pedidos sueltos; el botón **"→ Agregar a Tanda CXX · 📅 fecha"**
> (`pppAddToProgrammedTanda`) los mete en esa tanda (setea `tanda` + `fecha_entrega` +
> `programmed` en los edits) **aunque pase el m³/tanda objetivo (0,8)** → los pedidos de
> un mismo cliente quedan juntos. Match por **cód cliente** (`_pppCliKey`; si no hay cód,
> razón social); si el cliente tiene varias tandas programadas toma la de **fecha de
> entrega más temprana**. Excluye súper (van por su propia vía). Cálculo + banner en
> `pppRenderProg` (tab A Programar). Sólo toca edits locales (`vir_ppp_edits`) → SOLO LOCAL.
>
> Nota: **v3.39** — **CR: la tabla va como lista plana** (pedido del usuario): se
> sacó la fila separadora **"TANDA …"** (y su CSS `.cr-tanda-row`). `crRender` ahora
> itera `_cr.items` directo, sin agrupar. El orden de `showControlRemitos` se mantiene
> (**vencidos primero, luego por tanda y NP**) → las NP de una misma tanda quedan
> juntas igual, sin encabezado. Columnas intactas: NP · Cod Cliente · Razón Social ·
> Líos · Controlado.
>
> Nota: **v3.38** — **Control Remitos (CR): la lista pasó a TABLA con columnas
> fijas** (pedido del usuario). El popup `crRender` ahora arma una tabla con
> encabezados **NP · Cod Cliente · Razón Social · Líos · Controlado** (antes era
> una lista de tarjetas agrupadas y el tilde se rotulaba "Recibido"). La última
> columna **Controlado** es el tic que marca el operario; el flujo no cambió:
> tildar → «Terminé» emite **CRN** por NP y pasa el pedido a Pedidos Entregados.
> Se mantiene el agrupado por tanda como **fila separadora** (no es columna) y el
> resaltado de **VENCIDO** (fila roja + chip "VENCIDO" en Razón Social; el
> "temblando" por `translateX` se reemplazó por un **pulso de fondo**
> `cr-rowpulse`, más robusto en `<tr>`). Sólo cambia la presentación: datos,
> eventos (`CRN`/`CR`) y persistencia (`vir_cr_checked_<legajo>_<día>`) intactos.
>
> Nota: **v3.37** — **Alarma + aviso Telegram de "cargado sin controlar y vencido"** (Parte 4, cierra
> el ciclo de CR). En la PPP de la operadora, un pedido **cargado al camión (CCN) pero NO controlado**
> (ni CRN ni manual) que **pasó el plazo** (`crVencido`: 30 hs; viernes→lunes 12 hs) se marca **en rojo
> grande y temblando**: la tanda (`.ppp-cargvenc` + badge "🚨 SIN CONTROLAR" parpadeante en la franja)
> y la fila del pedido (`.ppp-cargvenc-row`, celda "🚨 SIN CONTROLAR" en lugar de "Entregado"). Lógica:
> `pppRefreshEntregado` ahora trae también `ts_cliente` y arma `_pppLoadMs` (NP→ms de la 1ª carga);
> helper `_pppCargaVencida(p)`. **Telegram**: `pppCheckCargaVencida()` emite **un evento `CRA`** por NP
> vencida (`texto="NP|TANDA|RAZÓN"`, client_id `cra_<np>_<día>` + upsert) y el trigger Supabase
> **`trg_carga_sin_control_telegram`** (función `notificar_carga_sin_control_telegram`, **AFTER INSERT**,
> mismo bot/chat `@Faltantes_Virgilio_bot` que faltantes/planimetría, vía `net.http_post`) lo reenvía.
> Como el trigger es **AFTER INSERT** y el id es determinístico+upsert, **avisa 1 sola vez por NP/día**
> (re-emisiones son UPDATE → no re-disparan). El chequeo corre al abrir la PPP y en cada cambio de
> pestaña (`pppRefreshControlado`/`pppRefreshEntregado`); exige tener cargados CCN **y** CRN para no dar
> falsos positivos. El evento `CRA` usa legajo `0` (test/basura, excluido de reportes).
>
> Nota: **v3.36** — **Control Remitos (CR)** para el operario (cierre del ciclo de entrega).
> El botón **CR** de la botonera (ya existía como toggle, label "Control Remitos") abre un popup
> (`showControlRemitos`, reusa `#tandaModal`) con la **lista de NP que YA se cargaron al camión**
> (eventos **CCN**), mostrando **NP · Cod Cliente · Razón Social · Líos · Controlado (tic)** (tabla desde v3.38). Cód y
> Razón salen del PPP del día (`fetchMonitorSheet`); **Líos** de los eventos **TAL** (anotados al
> terminar armado, ver v3.34); el tilde "Recibido" lo marca el operario. Al tocar **«Terminé»**:
> (1) manda un evento **CRN** (`texto="NP|TANDA"`, client_id determinístico `crn_<legajo>_<np>_<día>`,
> upsert) por cada NP tildada, y (2) **cierra el toggle CR** (evento `CR`). Persistencia del
> tildado en `vir_cr_checked_<legajo>_<día>`; **Wake Lock** para que no se salga si se bloquea el
> cel; re-tocar CR re-abre el popup (no cierra). **Integración PPP**: `pppRefreshControlado` lee los
> **CRN** y los **mergea al set de controlados** (`vir_ppp_entregados`) → esos pedidos salen de
> Programación y pasan a **Pedidos Entregados**, **coexistiendo** con el "✓ Controlado" manual de la
> operadora (los dos caminos valen). **Plazo de control / alarma VENCIDO**: desde que se cargó (CCN)
> hay **30 hs** para controlar; si el vencimiento cae **sábado/domingo (incluye las cargas del
> viernes)** se corre al **lunes 12:00** (`crDeadline`/`crVencido`, AR=UTC-3). Los NP vencidos van
> **arriba, en rojo y temblando** (`.cr-venc`) dentro del popup. (La alarma en la vista de la operadora
> + aviso Telegram se agregó en **v3.37**.)
>
> Nota: **v3.33–v3.35** — Ciclo de entrega del **operario** (previo a CR). **v3.33/34 (Líos)**: al
> mandar **TAP** (terminé armado) se abre un popup que **obliga** a anotar cuántos **líos** lleva
> cada NP de la tanda (`showLiosModal`; si no lleva, poné **0**; no se puede dejar vacío ni salir sin
> completar). Cada NP → evento **TAL** (`texto="NP|LÍOS|TANDA"`). **v3.35 (Carga Camión)**: al iniciar
> **CC** se abre un checklist con **las NP facturadas pendientes** (las ya FC por admin,
> `fetchFacturadosHoy`) agrupadas por tanda; el operario tilda lo que cargó (Wake Lock activo). El
> botón **"🚛 Terminé Carga Camión"** manda **CCN** (`texto="NP|TANDA"`) por cada NP tildada y
> **cierra** el toggle CC. Re-tocar CC re-abre el checklist; "Cerrar (sigo después)" minimiza.
>
> Nota: **v3.32** — PPP: **editor de clientes súper**. Botón **🛒 Clientes súper** en la PPP →
> overlay `#pppSupersOverlay` para **agregar (cód + nombre) / borrar**; persiste en
> `vir_ppp_supers` (`openPppSupers`/`pppSuperAdd`/`pppSuperDel`/`pppSupersRender`) y re-renderiza
> la PPP. La detección de súper sigue siendo: lista de clientes (por cód) + Tipo KRIKOS +
> barrio/zona Súper.
>
> Nota: **v3.31** — PPP: en Programación, dentro de **cada día** las tandas se **ordenan por
> camión (color)** y no por número: Sur/Oeste · Norte · Centro · Súper · Retira (y dentro de
> cada camión, por tanda). Así lo que va junto queda junto aunque el N° de tanda no sea
> consecutivo (`_pppCamKey` en el sort del tab Programación).
>
> Nota: **v3.30** — PPP: **botonera de tanda en 2 modos separados** (pedido del usuario, antes
> se mezclaba). La franja tiene **✓ Controlar** (verde) y **✏️ Editar** (ámbar); cada botón abre
> SU modo, excluyente (`pppSetMode` con `_pppMode` por id, persiste entre renders). En **modo
> Controlar** se ve solo lo de tildar entregas ("✓ Controlar TODA la tanda" + "✓ Controlado"
> por fila `.ppp-ctrl-only`; inputs bloqueados). En **modo Editar** solo lo de corregir (panel
> de fecha + "↩ toda la tanda" + "↩" por fila `.ppp-edit-only`; inputs Tanda/Fecha editables).
> Borde izq. verde/ámbar según el modo. (v3.29: badge VENCIDA en blanco bold legible.)
>
> Nota: **v3.28** — PPP: **editar tanda (✏️ lápiz)** en Programación. El botón ✏️ abre la
> tanda en **modo edición** (`pppEditTanda`, clase `.ppp-edit-mode`) y muestra un panel:
> **(1) cambiar la Fecha de Entrega de toda la tanda** (date input → `pppTandaFecha`, aplica
> a todos los NP de la tanda); **(2) mover** un pedido a otra tanda = cambiar su **Tanda** en
> la fila (input ya existente, sigue programado); **(3) devolver a "A Programar"**: botón ↩
> por fila (`pppPedidoAProgramar`) y botón "↩ toda la tanda" (`pppTandaAProgramar`) que le
> sacan tanda+fecha+programación. Helper `_pppTandaNps`.
>
> Nota: **v3.27** — PPP: **alarma de tanda VENCIDA**. Si una tanda programada tiene Fecha de
> Entrega **en el pasado** y sigue en Programación (no entregada), la franja se pone **roja,
> con badge "⏰ ¡VENCIDA!" y una sacudida (shake) periódica** para que la operadora la
> reprograme. Clase `.ppp-vencida` (chequea `_pppFechaDate(fe) < hoy` en `_pppBlock`),
> animación `pppShake`.
>
> Nota: **v3.26** — PPP: **franja de tanda rediseñada**. (a) La **Fecha de Entrega quedó en
> columna propia alineada** (franja en CSS grid: caret · nombre · resumen · fecha · meta). (b)
> **Color por camión/ruta** (`_pppRuta` + clases `rt-so/rt-n/rt-c/rt-ret` en `.ppp-tanda-h`):
> Sur/Oeste azul · Norte teal · Centro violeta · Retira gris · Súper ámbar; legend arriba de
> Programación. (c) El botón **"✓ Controlar" ahora ABRE la tanda** (`pppAbrirControlar` vía
> placeholder `__BLOCKID__`) para tildar **pedido por pedido** (cada fila tiene su "✓
> Controlado"). (d) **El estado abierto/cerrado de cada tanda PERSISTE** entre renders
> (`_pppOpen` por clave estable `_pppKid`), así controlar un pedido no cierra la tanda.
> (e) En la franja, los **N° Pedido consecutivos se colapsan en rango** `inicio/sufijo`
> (`_pppNpFmt`): 97757…97763 → **97757/63**; los no consecutivos quedan sueltos.
>
> Nota: **v3.25** — PPP: **(a) tandas colapsables (acordeón)**. Cada bloque arranca
> **cerrado**; la franja azul muestra los datos clave (**Razón Social · N° Pedido · 📅 Fecha
> de Entrega**) y al **tocarla se expande** el detalle (`_pppBlock` con id + `pppToggleBlock`,
> caret ▸/▾, `.ppp-tanda .ppp-tablewrap{display:none}`). Los botones del header llevan
> `event.stopPropagation()` para no abrir/cerrar al clickearlos. **(b) Ciclo Entregado →
> Controlado**: la columna **"Entregado"** se nutre sola del evento **CCN** (carga de camión
> por NP que marcan los operarios) — `pppRefreshEntregado`/`_pppEntregadoCC`, lectura de
> Supabase. El botón manual ahora es **"✓ Controlado"** (lo marca la operadora,
> `pppControlar`/`pppControlarTanda`): **recién al Controlar** el pedido pasa a **"Pedidos
> Entregados"** (tab renombrado). "Listo FC" sigue del evento TAP. Todo lectura, sigue SOLO LOCAL.
>
> Nota: **v3.24** — PPP: **3 retoques de UI**. (a) Los dos botones gigantes de importar se
> reemplazaron por **un botón mínimo "⬆ Importar Excel ▾"** que abre un **popup**
> (`pppToggleImport`/`pppCloseImport`, `#pppImportMenu`) con las dos opciones (Formato PPP /
> Base Pedidos) y el dato de última importación de Base Pedidos adentro. (b) Se **sacó la
> barra "🔄 Estado operarios (Listo FC)"** de Programación (el Listo FC se refresca solo al
> entrar al tab). (c) **Resumen rediseñado como TABLA compacta** estilo Excel (`Resumen
> Prog`): una fila por día de entrega, columnas Z1..Z7 / Retira / Súper / Total / Camiones /
> Demora, fila TOTAL, con tinte de color por zona — **entra todo en una sola hoja**
> (`pppResumenHtml`, `.ppp-restbl`).
>
> Nota: **v3.23** — PPP: **dedupe por N° Pedido** en `pppRenderProg` (codeado, automático en
> cada render): un NP aparece **una sola vez** y cae en una única solapa según su estado por
> NP (Entregado > Programado > A Programar). Si un pedido ya está programado o entregado, **no
> se vuelve a mostrar en "A Programar"** aunque venga repetido en los datos (p. ej. al
> reimportar el Formato PPP del día con pedidos ya programados).
>
> Nota: **v3.22** — PPP: **estado actual PRECARGADO** (semilla). El estado de la PPP del
> Excel `AAA_PPP_Vigente` quedó **embebido** en `PPP_SEED` (123 pedidos · 83 programados en
> 7 días · 8 súper). `pppSeedIfNeeded()` (llamado en `openPPP`) lo carga **una sola vez** en
> `localStorage` (`vir_ppp_pedidos` + `vir_ppp_edits`), marcado con `vir_ppp_seeded_v1`. Así
> al abrir la PPP ya está todo cargado **sin importar nada**. Temporal hasta Supabase (para
> re-sembrar: borrar la clave `vir_ppp_seeded_v1`). La migración por archivo (v3.21) sigue
> disponible.
>
> Nota: **v3.21** — PPP: **migración del estado actual desde el Excel**. Si en "Importar
> Formato PPP" se sube el Excel de la PPP completo (hoja **"Programacion Diaria"**, 15 cols
> por posición con secciones), se **autodetecta** (`pppEsPPPCompleta`) y se carga TODO
> (`pppLoadProgCompleta`/`pppImportarCompleta`): lo de la sección **Programación** con tanda
> → **ya programado** con su fecha de entrega; **súper** → por su fecha; el resto → **A
> Programar**. Verificado con `AAA_PPP_Vigente`: **123 pedidos** (75 programados en 7 días
> de entrega, 8 súper, 39 a programar). Lee la hoja "Programacion Diaria" aunque no sea la
> primera. El Formato PPP simple (export del día) se sigue detectando y acumulando como antes.
>
> Nota: **v3.20** — PPP: el encabezado de cada tanda ahora **alinea a la izquierda** (m³ +
> botón OK/Entregada a la altura de la columna Fecha, `min-width` en `.ppp-tanda-name` +
> `flex-wrap`) para que el botón **no quede cortado** a la derecha en pantallas anchas.
>
> Nota: **v3.19** — PPP: **OK por tanda**. Cada tanda armada (y cada súper) en 📥 A Programar
> tiene un botón **✓ OK → Programar** que la **saca de A Programar** y la pasa a 🗓️
> Programación. La **Fecha de Entrega se elige automática**: `_pppScheduleTandas` la mete en
> el **día más temprano con lugar** según los **m³ ya programados ese día** y el tope **6
> m³/día** (`dayCap`); una tanda gigante (> día) se lleva un día vacío. Los **súper van por
> su fecha preestablecida** (no usan el cupo). `pppOkTanda`/`pppOkSuper` comparten el
> scheduler con **✅ Confirmar todas** (`pppConfirmarProgramar`, hace todas por prioridad de
> fecha de recepción). Reversible con "borrar tandas".
>
> Nota: **v3.18** — PPP: el **m³/tanda (0,8) es un objetivo modificable, no un tope duro**.
> Se sacó el cartel "⚠ > 0,8 m³" de las tandas grandes: pasarse es normal (un cliente con
> varios NP queda junto aunque supere 0,8) y se programan igual. La capacidad se edita en
> la barra; nada bloquea tandas > objetivo.
>
> Nota: **v3.17** — PPP: el botón **"Entregado" ya NO aparece en 📥 A Programar** (el pedido
> todavía no está programado); va **solo en 🗓️ Programación** (y "↺ Deshacer" en Entregados).
>
> Nota: **v3.16** — PPP: **ciclo de vida del pedido**. (a) Columna **"Listo FC"** en
> Programación: se **tilda sola** cuando el operario termina el armado de la tanda (evento
> **`TAP`**) — se lee de Supabase con `getActivityStatus().armadoDone` (`_pppArmadoDone`,
> `_pppListoFC`, `pppRefreshArmado`; es solo lectura, no rompe el "solo local"). Botón "🔄
> Estado operarios" + auto al abrir/entrar a Programación. (b) **Entregado → Entregados**:
> botón por pedido **y por tanda** (`✓ Entregada`, `pppEntregarTanda`); **persistido** en
> `vir_ppp_entregados` (sobrevive recarga). Flujo completo: descarga → 📥 A Programar →
> armar+confirmar → 🗓️ Programación (Listo FC al armar) → Marianela marca Entregado → ✅
> Entregados.
>
> Nota: **v3.15** — PPP: las **entregas son sólo Lun–Vie** (no Sáb/Dom). `_pppDeliveryDate`
> ahora saltea sábado **y** domingo al asignar las fechas de entrega automáticas.
>
> Nota: **v3.14** — PPP: **flujo en 2 etapas** (refinado por el usuario). (a) **Todo lo
> importado cae en la solapa 📥 "A Programar"** (no programado). (b) Ahí se **arman tandas**
> (`🪄 Sugerir tandas`) con tope **m³/tanda = 0,8** (`tandaCap`, antes 6 era mal); los súper
> quedan exentos (van solos por su fecha de entrega). (c) **`✅ Confirmar y programar`**
> (`pppConfirmarProgramar`) pasa las tandas a **🗓️ "Programación"** asignándoles **Fecha de
> Entrega automática**: empaca las tandas en días de entrega a **m³/día = 6** (`dayCap`,
> máximo por día), priorizando fecha de recepción vieja; fecha base = próximo día,
> **saltea domingos** (`_pppDeliveryDate`). Los súper se programan por SU fecha (no usan el
> cupo de 6). Estado nuevo `programmed` en `vir_ppp_edits`. Solapas: 📥 A Programar · 🗓️
> Programación (por fecha de entrega → tanda) · 🚚 Resumen (usa programados) · ✅ Entregados.
> `borrar tandas` resetea tanda+programación. Config en `vir_ppp_cfg` {tandaCap,dayCap,baseN}.
>
> Nota: **v3.13** — PPP Fase 3: **tab 🚚 Resumen de camiones** (réplica de `Resumen Prog`).
> Agrupa los pedidos **por Fecha de Entrega**; suma m³ **por zona** (los súper cuentan en
> "Súper", no en su zona geográfica); arma camiones por **ruta fija**: Sur/Oeste=Z1+Z3+Z4 ·
> Norte=Z5+Z6+Z7 · Centro=Z2 · Súper (uno por cliente) · Retira (sin camión). Cada ruta a
> **6 m³/día** → `ceil(m³/cap)` camiones. Muestra m³ por zona (chips), desglose de camiones
> y **demora promedio** (Fecha Entrega − Fecha Recep) por día + total. `pppResumenHtml`,
> `_pppFechaDate`. **Verificado**: el mapeo de zona coincide con el Excel en 104/104 filas y
> los totales por zona dan idénticos al `Resumen Prog`. SOLO LOCAL.
>
> Nota: **v3.12** — PPP Fase 2: **botón "Sugerir tandas"** (armado automático asistido).
> Barra con **m³/tanda** (capacidad, default **6**) y **N° base** (default 60), persistidos
> en `vir_ppp_cfg`. `pppSugerirTandas`: dentro de cada **zona** ordena por **fecha de
> recepción** (más vieja primero) y empaca por **cliente** (los pedidos de un mismo cód van
> juntos) hasta llegar a la capacidad; al pasarse abre otra tanda; un cliente que solo ya
> supera la cap queda en su tanda. **Súper** = una tanda por cliente. **No pisa** tandas ya
> puestas a mano ni programa pedidos **sin zona** (primero asignarles el barrio). Códigos
> `C<base><A,B,C…>`. Escribe como edits (editable/reversible); "borrar tandas" limpia todas.
> Capacidad real del negocio: **6 m³ por camión/día**.
>
> Nota: **v3.11** — PPP Fase 1 completa: **acumulación + 3 secciones + detección de súper**.
> **Acumulación**: importar el Formato PPP ya NO reemplaza — los pedidos del día **se suman**
> a los existentes (dedupe por N° NP; si el NP repite, actualiza sus datos del Excel y
> conserva los edits de tanda/fecha). Persistido en `localStorage` `vir_ppp_pedidos`
> (`pppMergePedidos`/`pppLoadPedidosStore`); `openPPP` lo recarga al abrir. Status: "X
> nuevos · Y actualizados · Z total". **3 secciones** (réplica del Excel): 🛒 **Súper**
> (cada cliente súper su propia tanda), 📋 **Pedidos a Programar** (sin tanda, agrupados por
> **Zona** y ordenados por **fecha de recepción** más vieja primero), ✅ **Programados**
> (con tanda, agrupados por tanda con total m³). Asignar la Tanda mueve el pedido de "a
> Programar" a "Programados" en vivo. **Súper** = (1) lista de clientes editable
> `vir_ppp_supers` sembrada con los 4 actuales (Coto/Dorinka/Matiz/S.A.Imp Exp Patagonia),
> (2) Tipo=KRIKOS si el Excel lo trae, (3) Zona=Super del barrio (`pppEsSuper`). SOLO LOCAL.
>
> Nota: **v3.10** — PPP: **Zona automática desde el Barrio** (réplica de la lógica del
> Excel real `AAA_PPP_Vigente`). La Zona NO se escribe: sale del barrio de entrega
> buscado en la tabla `Resumen Prog`!AC:AD del Excel (**84 barrios → 10 zonas**: Z1 CABA
> Sur, Z2 CABA Centro, Z3 CABA Oeste, Z4 GBA Sur, Z5 GBA Oeste, Z6 GBA Norte, Z7 GBA
> Norte Lejos, Super, Retira, Expo). Tabla embebida en `PPP_BARRIO_ZONA`; match
> normalizado (sin acentos/mayúsc/paréntesis) en `pppNormBarrio`/`pppZonaDeBarrio`. La
> Zona se muestra como **chip de color** por zona; barrios fuera de tabla muestran un
> selector "⚠ asignar" y se **recuerdan** por barrio (`vir_ppp_zona_ovr`), extendiendo
> la tabla como en el Excel. **Auditoría del Excel real** (para fases siguientes): hoja
> `Programacion Diaria` = 1 fila/pedido en secciones apiladas (Problemas / Súper a
> Programar / a Programar / Programación con `Total CXX:`); súper = Tipo KRIKOS, un
> camión por súper; camiones por ruta fija Z1+Z3+Z4 / Z5+Z6+Z7 / Z2 solo / Retira /
> Súpers; `Resumen Prog` agrupa por Fecha Entrega+Zona y calcula demora promedio. SOLO LOCAL.
>
> Nota: **v3.09** — PPP: **Tanda y Fecha Entrega editables a mano** (no vienen del Excel).
> Cada fila tiene un input para **Tanda** (primera columna) y otro para **Fecha Entrega**.
> Lo tipeado se guarda en `localStorage` `vir_ppp_edits` **por N° Pedido** (sobrevive
> recarga y reimportación del mismo Excel; SOLO LOCAL) y se mergea al render
> (`pppLoadEdits`/`pppSaveEdits`/`pppSetEdit`). Al escribir una Tanda, el pedido se
> reagrupa en vivo (re-render). Los pedidos **sin tanda** quedan en el grupo
> **"Sin tanda asignada"** que aparece **primero** (tarjeta ámbar) para cargarlos cómodo;
> el resto de las tandas, A→Z. Fecha Entrega no reagrupa (solo guarda). Sigue SOLO LOCAL.
>
> Nota: **v3.08** — PPP: **detección por PATRÓN de datos** (reescritura de
> `pppDetectProgCols`). El Excel "Formato PPP" trae el **encabezado disperso** (celdas
> vacías/combinadas) que NO alinea con las filas de datos → la detección por nombre de
> columna agarraba columnas vacías (Cód/Razón/m³ salían en blanco). Ahora se detecta por
> el **patrón del dato**: N° Pedido = 5 dígitos, Cód = 4 dígitos, m³ = decimal, Fecha =
> fechas; y para los textos (Razón Social / Localidad) se **realinea** el encabezado
> (k-ésimo header no vacío ↔ k-ésima columna con datos) y se usa el nombre lógico. Esto
> sigue la posición REAL del dato, sin importar columnas vacías intercaladas. Además el
> **diagnóstico 🔧** ahora vuelca **columna por columna** (letra + encabezado + 2 ejemplos)
> para ver la "verdad" del Excel. Tanda/Fecha Entrega/Zona pueden seguir vacías. SOLO LOCAL.
>
> Nota: **v3.07** — PPP: **fix de keywords** en `pppDetectProgCols` para que peguen con
> los encabezados REALES del Excel "Formato PPP" que usa el usuario:
> `pedido | fecha | codigo | cliente | mts 3 | vendedor | dir. entrega | loc. entrega |
> prov. entrega`. Mapeo: **Cód Cli ← codigo**, **N° Pedido ← pedido**, **Fecha ← fecha**,
> **Razón Social ← cliente**, **m³ ← mts 3**, **Localidad Entrega ← loc. entrega**.
> ⚠ **Ese Excel NO trae Tanda, Fecha Entrega ni Zona** (son campos que hoy completa la
> planificación; el usuario dijo que Zona/Fecha Entrega "se rellenan después"). Por eso la
> "unificación por tanda" todavía no puede salir de este archivo — **falta definir de dónde
> sale la Tanda** (asignar en la PPP / otro Excel / cruce por NP). Mientras tanto, si ningún
> pedido tiene tanda, el grupo se rotula **"Sin tanda asignada"** (antes "Tanda —"). Sigue
> SOLO LOCAL.
>
> Nota: **v3.06** — PPP: la detección de columnas no levantaba varios campos. Ahora
> `pppDetectProgCols` elige la fila de encabezado **por puntaje** (la que más keywords
> tiene) y se agregó un **diagnóstico desplegable** en la vista (`.ppp-diag`,
> `_pppLastDetect`) que muestra qué columna detectó cada campo + los **encabezados
> reales** del Excel, para ajustar las palabras clave si algo cae en "✗ FALTA".
>
> Nota: **v3.05** — **PPP: formato fijo (sin panel de mapeo)**. Por pedido del usuario
> se sacó el panel de elegir columnas. Ahora el **Formato PPP** detecta las columnas
> **por el NOMBRE del encabezado** (`pppDetectProgCols`: tanda/cod cli/pedido/fecha/
> razón/m3/localidad/fecha entrega/zona) y arma la vista agrupada por tanda con esas
> 9 columnas (m³ a **2 decimales**; fechas formateadas DD/MM/YYYY, `cellDates`+`_pppFecha`).
> **Base Pedidos** ya NO muestra tabla: solo la **fecha/hora de la última importación**
> (`#pppBaseInfo`/`pppShowBaseInfo`, persistida en `localStorage` `vir_ppp_base_ts`).
> Sigue SOLO LOCAL. (El panel de mapeo y `_pppGuessMap` quedaron dormidos.)
>
> Nota: **v3.04** — PPP: el auto-guess del mapeo ahora también detecta **Tanda**
> (texto corto alfanumérico tipo C41A), **Zona** (valores con "zona") y **Localidad**
> (siguiente columna de texto) — antes quedaban en "ninguna" y salían vacías.
> `_pppGuessMap` usa un set de columnas ya usadas (cada col se asigna una vez).
> Además `pppShowMapping` respeta el mapeo guardado solo si la columna es válida
> (`>=0`); si un campo quedó sin mapear, cae al auto-guess mejorado.
>
> Nota: **v3.03** — dos cosas. **(a) PPP: drag-drop** — además del click, podés
> **arrastrar el `.xls` encima** de cada botón de importar (`pppHandleFile` compartido
> por click y drop; `pppDragOver`/`pppDrop`; highlight `.ppp-drag`). **(b) #4 parte 2:
> editor de Talleristas de Recepción** — botón "👷 Talleristas de Recepción" (panel
> Admin) → overlay que lee `Codigos X Tallerista` (id, Nombre, Linea LK/CH, Codigo),
> agrupa por Nombre y muestra el código LK/CH editable + agregar/borrar. Escribe con
> el JWT del supervisor (la RLS de esa tabla ya permite INSERT/UPDATE/DELETE a
> authenticated → no hace falta SQL). `tallLoad`/`tallRender`/`tallSaveCod`/`tallAdd`/
> `tallDelete`. Con esto, #4 (Mails + Talleristas) queda completo.
>
> Nota: **v3.02** — **PPP: mapeo de columnas configurable** (fix del import). El
> "Formato PPP" tiene su propio layout (NO el de Programacion Diaria): el NP es de 5
> dígitos y antes se tomaba mal el cód. cliente como NP. Ahora al Importar Formato PPP
> aparece un panel para **elegir qué columna es cada campo** (NP/Tanda/Cliente/Cód/m³/
> Zona/Localidad), con **auto-guess por patrón** (`_pppGuessMap`: 5díg→NP, 4díg→cód,
> decimal→m³, texto largo→cliente) y se **guarda en localStorage** (`PPP_MAP_KEY`).
> `pppApplyMapping` arma los pedidos y `pppRenderProg` agrupa por la Tanda elegida.
> Sigue SOLO LOCAL. Pendiente del usuario: pulir estética si hace falta.
>
> Nota: **v3.01** — **#4 (parte 1): editor de Mails autorizados (supervisores)**.
> Botón "✉️ Mails autorizados" (panel Admin) → overlay para agregar/borrar mails de
> supervisor. Tabla Supabase `Supervisores_Virgilio` (email) que se **mergea sobre los
> 3 fijos** de `SUPERVISOR_EMAILS` (los fijos no se borran → no hay lockout).
> `loadSupervisoresRemotos` la baja (anon) y `isSupervisorEmail` chequea fijos + remotos;
> `showLoggedIn` la espera antes del check. Escribe con el JWT del supervisor
> (`mailsAdd`/`mailsDelete`). ⚠ Requiere crear la tabla + RLS (SQL por chat). Falta la
> parte 2 de #4: editor de **Talleristas de Recepción** (tabla `Codigos X Tallerista`).
>
> Nota: **v3.00** — **PPP Fase 2 (vista, SOLO LOCAL)**. Por pedido del usuario, el PPP
> ahora **no escribe nada en Supabase** (banner "EN PRUEBAS — SOLO LOCAL"; `pppSubir`
> queda dormido). Al **Importar Formato PPP** se renderiza la **Programación** linda
> (`pppRenderProg`): agrupada **por tanda** (card azul con N pedidos + m³), tabla
> NP·Cliente·Cód·m³·Zona·Entrega, y botón **"✓ Entregado"** por pedido que lo mueve a
> la pestaña **"Entregados"** (estado local en memoria, `_pppEntregados`/`pppEntregar`/
> `pppDeshacer`/`pppTab`). **Importar Base Pedidos** muestra solo un vistazo
> (`pppRenderBase`, es data para el picking). Falta (cuando guste el formato): conectar
> a Supabase (subir + Entregado→`PPP_Pedidos_Entregados`) y el vínculo con Facturación.
>
> Nota: **v2.99** — **#1 Carga Recepción: "Carga Manual" auto-navega al form**. Como no
> hay deep-link (repo privado), al elegir "Carga Manual" se carga la app y, por ser
> **mismo origen**, `recpAutoNav` busca dentro del iframe un botón/link hacia "Recepción
> de Mercadería" (keywords) y lo clickea (reintenta ~5,5s; fallback al home). `recpOpen`
> fuerza recarga (about:blank→url) y, si algún día se setea `RECEPCION_CARGA_URL` con un
> deep-link real, lo abre directo sin heurística. ⚠ **Heurístico sin probar** (no tengo
> acceso a esa app); si no acierta el botón, hace falta el deep-link o el texto exacto
> del botón del home.
>
> Nota: **v2.98** — **integrado el flujo de LOGIN GLOBAL + selector de planta in-app +
> rebrand a "Producción"** (del branch `claude/login-global-flow`, otra sesión).
> Ahora: login (Google/legajo) → **`#plantSelector`** (Virgilio / Cervantes, sesión
> compartida, no re-pide login) → `chooseVirgilio()` → `_renderIdentity()` →
> `showSupervisor`/`showOperario` (mis pantallas). Funciones: `showSelector`,
> `_routeAfterAuth`, `_renderIdentity`, `chooseVirgilio/Cervantes`, `cambiarPlanta`,
> botón `#btnCambiarPlanta`. Cervantes (`cervGate`) levanta la sesión compartida y
> redirige a la raíz si no hay. Rebrand: íconos/manifest/twa. ⚠ Mi **`/selector/`
> standalone (v2.82) quedó REDUNDANTE** (ahora el selector es in-app); no se borró —
> queda como página huérfana, se puede limpiar después. Se integró sobre mi v2.97
> (cherry-pick limpio: las zonas no se solapaban; mis features v2.9x intactas).
>
> Nota: **v2.97** — **PPP Fase 1: importador de Excel → Supabase**. Los botones del
> módulo PPP ahora **leen el `.xls`/`.xlsx`** (SheetJS lazy desde CDN —
> `pppLoadXlsx`—, el navegador del supervisor lo baja), **mapean columnas IGUAL que el
> Apps Script** (`pppMapBase`: Pedido=A/Art=C/Cajas=F → `PPP_Base_Pedidos`; `pppMapProg`:
> por posición, fila=pedido si col C tiene NP → `PPP_Programacion_Diaria`), muestran
> **preview** (5 filas) y al confirmar hacen **reemplazo total** (DELETE+INSERT por
> lotes de 1000) con el **JWT del supervisor** (`facAuthWriteHeaders`/`pppSubir`).
> ⚠ Requiere **1 SQL una vez**: policies RLS de escritura para los mails de supervisor
> en `PPP_Base_Pedidos` y `PPP_Programacion_Diaria` (hoy solo escribe el service_role).
> Falta **Fase 2**: generar la vista PPP (Programación) linda + botones "Entregado" que
> muevan el pedido a `PPP_Pedidos_Entregados`, vinculado a Facturación.
>
> Nota: **v2.96** — **Carga Recepción Mercadería: chooser Pendientes / Carga Manual**.
> Al abrir (`openRecepcionAdmin`) ahora aparece un chooser con dos tarjetas; el iframe
> de `Control-Carga-Remitos-FC` carga recién al elegir (`recpOpen`), con botón **← Volver**
> (`recpShowChooser`). **Pendientes** → home de la app (como antes). **Carga Manual** →
> `RECEPCION_CARGA_URL` ⚠ **TODO**: hoy cae al home; falta el **deep-link real** de la
> pantalla "Recepción de Mercadería" (repo privado + github.io bloqueado en el sandbox →
> el usuario tiene que pasar el `#hash`/`?param` de esa pantalla).
>
> Nota: **v2.95** — tres cosas en el panel Admin. **(a)** Botón **"Recepción (Admin)" →
> "Carga Recepción Mercadería"** (sigue llamando a `openRecepcionAdmin`, iframe de
> `Control-Carga-Remitos-FC`). **(b)** Nuevo botón **"🗓️ PPP"** (`openPPP`/`#pppOverlay`)
> — **scaffolding, NO activado**: dos botones "Importar Base Pedidos" / "Importar Formato
> PPP" inertes (`pppImportar` no toca Supabase). Objetivo: **reemplazar el sync
> Excel→Supabase** de la PPP, subiendo las hojas a `PPP_Base_Pedidos` /
> `PPP_Programacion_Diaria` (reemplazo total). ⚠ El write real necesita una **Edge
> Function con service_role** (la app con key pública SOLO lee esas tablas; ver
> `sql/ppp_supabase.sql`). Pendiente: fuente del archivo + Edge Function. **(c)**
> Pendiente del chooser **Pendientes / Carga Manual** en Carga Recepción — bloqueado: el
> repo `Control-Carga-Remitos-FC` es **privado** y github.io está fuera del allowlist →
> falta el deep-link de cada pantalla.
>
> Nota: **v2.94** — dos cosas. **(a) FIX Inconsistencias mostraba el tablero del Monitor.**
> Como el monitor abre SIEMPRE en modo TV y la regla `#monitorModal.tv #monitorContent`
> (display:flex) le ganaba en especificidad al `.hidden` que pone `setMonitorTab("incons")`,
> el tablero se veía encima de Inconsistencias. Se acotó la regla con `:not(.hidden)`
> → ahora al cambiar de pestaña, `#monitorContent` se oculta y se ve `#inconsContent`
> (que ya tenía estilos TV). **(b) Editor de Planimetría más ordenado**: título de sección
> "Buscar y editar ubicaciones" + **fila de encabezados** (Código · Sector · Orden ·
> Acciones) alineada con las columnas de cada fila (`.planim-list-head`/`.plh-*`,
> `planimRender` prepende el header; inputs con `.planim-row-sec`/`.planim-row-ord`).
>
> Nota: **v2.93** — **panel Administración en grilla tipo teclado**. Los botones grandes
> (`.sup-actions`/`.sup-action-btn`) pasaron de una columna a **grid de 3 columnas**
> (ícono arriba + texto centrado, tarjetas), que usa el ancho de la pantalla; en celular
> (≤560px) baja a **2 columnas**. Solo CSS.
>
> Nota: **v2.92** — **Facturación: se reubicó el botón "Cerrar"**. Estaba como barra
> roja a todo el ancho en el medio del header (heredaba el `button{width:100%}` global,
> igual que pasaba en Faltantes). Ahora es un botón **compacto arriba a la derecha**
> (`.fac-close-btn` con `width:auto; margin-left:auto`, sacado de `.fac-stats` y puesto
> como hijo directo de `.fac-top`). De paso, `↺ Revertir` también quedó compacto (no
> más barra). Solo CSS/markup.
>
> Nota: **v2.91** — el fallback del picking (v2.90) ahora también cubre el **monitor**
> (faltantes / quién pidió / aviso Marianela). Helper `faltEnsureBase(enr, tandas)`:
> si a los NP de las tandas mostradas les faltan filas en la base (mirror de Supabase
> atrasado), trae la base de Google Sheets y **mergea** los NP faltantes en
> `enr.pickBase` (mismo objeto que cachea el picking → sana ambos). Enganchado en
> `refreshFaltantes` y `showMarianelaAviso`. No hace nada si la fuente ya es Sheets.
>
> Nota: **v2.90** — **fix picking vacío por mirror de Supabase atrasado**. Si una tanda
> tiene NP que **todavía no están en `PPP_Base_Pedidos`** (Supabase), el picking
> mostraba "No encontré artículos… sin filas en la base". Ahora `showPickingList`
> detecta los NP sin filas y **reintenta con la base de Google Sheets** (siempre al
> día) — `aggFrom`/`npsSinFilas` → `fetchPickingBaseFromSheets`, y sana el cache de la
> sesión. El fallback global solo saltaba si la base venía **totalmente vacía**; este
> es por-tanda. Causa de fondo: el sync del Apps Script a Supabase corre más espaciado
> que la actualización del Sheet (los pedidos nuevos tardan en espejarse).
>
> Nota: **v2.89** — **planimetría: ajustes**. Se borraron `030`, `830`, `828`, `029`
> (no vigentes). `255`(G10) y `724`(G15) pasan a orden 75/76 (justo tras G07).
> `548` comparte lugar con `565` (A64). `planimetria.js?v=2.89`.
>
> Nota: **v2.88** — el aviso "preguntá a Marianela" ahora solo aparece cuando hay una
> **decisión de reparto real**. Por cada artículo faltante exige: **pickearon >1 caja**
> (`real>1`), **falta >1 caja** (sino va a un solo cliente) y el artículo lo pidió
> **más de 1 pedido** (se cuenta con `enr`/PPP, `contarPedidos`). Si ningún artículo
> califica, el modal NO se muestra. `faltantesDeTanda` ahora devuelve `esp`/`real`;
> el chip muestra "N pedidos". Sin acceso a la PPP, degrada a los gates de cajas.
>
> Nota: **v2.87** — **aviso "preguntá a Marianela" al armar una tanda con faltantes**.
> Cuando el armador EMPIEZA el separado (`AP`) de un pedido cuya **tanda se pickeó con
> faltantes**, se abre un modal (`#marianelaModal`) que le dice que **le pregunte a
> Marianela** cómo repartir, y le muestra los artículos cortos. El código de `AP` puede
> ser la tanda o el pedido (NP): se prueba como tanda y, si no, se busca la tanda del NP
> en la PPP (`faltGetEnrich`). Detección por los `PKC` con `real<esp` de esa tanda
> (últimos 5 días). Funciones: `showMarianelaAviso`/`faltantesDeTanda`/`closeMarianela`;
> hook en `send()` (rama `AP`). Si no hay faltantes (o sin red) no muestra nada.
>
> Nota: **v2.86** — **Faltantes: estimar quién quedó SIN SERVIR**. En la sub-fila
> "Pidieron" se reparten las cajas que el operario **puso** entre los NP **sirviendo
> primero a los pedidos más grandes**; cada NP queda marcado **"sin servir"** (pedido
> entero sin cubrir, badge rojo), **"faltan N"** (parcial, ámbar) o **"✓ completo"**
> (verde). El reparto descompone exactamente la `falta` por NP. Es un **estimado**
> (no se conoce el reparto real; se aclara con `title` en "Pidieron"). `quienPidio`
> ahora recibe el `puso` y setea `faltaCj`; `whoRow` pinta el estado.
>
> Nota: **v2.85** — **Faltantes: "quién pidió" (NP + Cód cliente)**. Bajo cada
> artículo faltante, una sub-fila lista los **NP** que pidieron ese artículo en la
> tanda, con su **Cód cliente + Razón Social + cajas pedidas** (orden por cajas desc).
> Cruce: `fetchMonitorSheet` (tanda→NPs + `cod`/`razonSocial`) × `fetchPickingBase`
> (NP→artículos+cajas), cacheado 2 min (`faltGetEnrich`). Con la lectura PPP desde
> Supabase (v2.84, `PPP_SOURCE`) **ya no depende de Google** si la fuente es Supabase.
> Matchea el par Nac/Imp (`580E`↔`580`). Funciones: `faltGetEnrich`, `quienPidio`/
> `whoRow` en `refreshFaltantes`.
>
> Nota: **v2.84** — **lectura PPP desde Supabase ACTIVADA** (programación / pedidos
> / m³ migrados de Google Sheets a Supabase). 3 tablas espejan las hojas que lee la
> app — `PPP_Programacion_Diaria`, `PPP_Pedidos_Entregados`, `PPP_Base_Pedidos` (DDL
> en `sql/ppp_supabase.sql`) — para sacar la dependencia de Google y **poder calcular
> m³ por SQL**. `index.html` elige la fuente con el flag **`PPP_SOURCE`** (`"sheets"` /
> `"auto"` con fallback a Sheets / `"supabase"`), hoy en **`"auto"`**:
> `fetchMonitorSheet`, `fetchHistoricSheet` y `fetchPickingBase` quedaron como
> *dispatcher* + `…FromSheets` + `…FromSupabase` (mismo Map; m³ leído **numérico**,
> sin `monitorParseM3`); helper `supaFetchAll` (pagina PostgREST con `Range` +
> `count=exact`). La carga la hace el **Apps Script** (`handleCargaPPPSync_`, el que ya
> escribe las hojas): un hook las **espeja** con **reemplazo total** (DELETE all +
> INSERT) y la `service_role` key del proyecto Virgilio — props
> `SUPABASE_VIRGILIO_URL`/`_SERVICE_KEY` (ver `MIGRACION-SUPABASE-PPP.md` +
> `apps-script/sync-ppp-supabase.gs`). Tablas con `id` autonumérico. Alcance: NO
> incluye `VolumenArticulos` ni la planimetría.
>
> Nota: **v2.83** — **rediseño estético del modal Faltantes** (vista supervisor).
> Antes los chips de fecha y el "Cerrar" salían a todo el ancho (heredaban el
> `button{width:100%}` global). Ahora: header prolijo con "Cerrar" compacto, chips de
> fecha redondeados en fila scrolleable, resumen en 3 tarjetas (tandas / artículos /
> cajas faltantes en ámbar), y cada tanda como card con badge rojo y tabla con
> jerarquía (Falta resaltada en chip, Puso/Pedía atenuados, números tabulares). Solo
> CSS/markup, misma lógica/datos (`.falt-*`, `refreshFaltantes`).
>
> Nota: **v2.82** — **las dos plantas en un repo** (reemplaza al repo `App-Produccion`,
> que se borra). Virgilio queda en la **raíz** (sin cambios), Cervantes se **copia** en
> **`/cervantes/`** (repo fuente `Registro-Produccion-2.0`, commit `d2d6a59`), y el
> **`/selector/`** ("¿Dónde vas a trabajar hoy?") linkea a ambas (`../` y `../cervantes/`).
> Cada app tiene botón **"← Cambiar planta"** → `selector/`. La entrada por defecto
> sigue siendo Virgilio (raíz). ⚠ `/cervantes/` es copia → re-sincronizar si cambia en
> su repo. Detalle en `CLAUDE.md` (sección "Estructura: dos apps en un repo").
>
> Nota: **v2.81** — editor de Planimetría: se **sacó** el botón "subir toda" y se
> agregó un **ayudante de ubicaciones aledañas** (`planimNearby`): al escribir un
> código/sector de referencia, muestra las ubicaciones cercanas **por orden** (4
> antes y 4 después) con su número de orden y sector → para elegir bien el orden de
> la ubicación nueva. Lee de `window.GONDOLA` (estática + lo que ya esté en Supabase).
>
> Nota: **v2.80** — **editor de Planimetría en el panel Admin (a Supabase)**.
> Botón "🗺️ Editar Planimetría" (supervisores) → overlay para agregar/editar/borrar
> códigos (cod, sector, orden) y cargar los pares Nacional/Importado. **Cada cambio
> se escribe DIRECTO a Supabase** (tabla `Planimetria`, upsert con el JWT del
> supervisor), no solo local. La app al arrancar baja `Planimetria` (anon) y la
> **mergea sobre planimetria.js** (`loadPlanimetriaRemote` → `window.GONDOLA`); si
> no hay tabla/red queda la estática. Botón "Subir toda la planimetría actual"
> (`planimSeedAll`). ⚠ Requiere crear la tabla `Planimetria` + RLS (SQL por chat).
> Primera parte del editor self-service (faltan mails y talleristas).
>
> Nota: **v2.79** — **planimetría: se borró `441E`** (código fantasma; solo existe
> `441`→J28, sin par E → sin aviso Nacional/Importado).
>
> Nota: **v2.78** — **planimetría: alta de 13 códigos** sin góndola en la base de
> pedidos (758→Ñ56, 071→C10, 255→G10, 724→G15, 256→G20, 828→L08, 548→A64, 29→F12,
> 556→A65, 30→A72, 830→L05, 396→A65, 759→Ñ59, 441→J28; orden interpolado). `809E`
> quedó solo en M13 (no puede estar en dos sectores).
>
> Nota: **v2.77** — **picking: aclarar Nacional/Importado en pares de planimetría**.
> Si un código tiene su par (base + E) cargado en `planimetria.js` **en el MISMO
> sector** (ej. `580`/`580E` en C19), al pickearlo el operario ve un aviso y dos
> botones **Nacional / Importado**; lo que toca **define el código que se registra**
> en el `PKC` (Nacional→`580`, Importado→`580E`) — así no se cruzan los stocks.
> `showPickingList` calcula `dual` por ítem (`dualOf`); `pkRender` muestra el paso
> de aclaración; `pkClarify`/`pkReclarify` setean `it.pick`; `pkOk`/`pkConfirmF`
> mandan el código elegido. **Activo** desde que existe el par `580`/`580E` (v2.76).
>
> Nota: **v2.76** — **planimetría: alta del código `580`**. Se agregó `"580":["C19",60]`
> a `window.GONDOLA` (planimetria.js), mismo sector y orden que `580E` (C19, 60).
> Antes solo existía `580E`; un picking con el código `580` pelado caía sin
> planimetría (orden al final + evento `PSP`/aviso Telegram). `index.html` ahora
> carga `planimetria.js?v=2.76` para bustear caché.
>
> Nota: **v2.75** — **acceso al panel Admin de Recepción + nuevo supervisor**.
> (a) Se agregó `comexloekemeyer@gmail.com` a `SUPERVISOR_EMAILS` (ve los
> monitores de Producción + el botón nuevo). (b) Botón **"🏭 Recepción (Admin)"**
> en `#supervisorPanel` que abre `openRecepcionAdmin()`: un overlay
> (`#recepcionAdminOverlay`, z-index 1250) con la app de Recepción
> (`Control-Carga-Remitos-FC`) **embebida en un iframe**. Como las dos apps están
> en el **mismo dominio** (`loekemeyer.github.io`), el iframe **comparte
> sesión/almacenamiento** y anda como nativo, sin duplicar las ~1500 líneas del
> Admin ni mantener dos copias. El `src` se setea lazy al abrir. (Alternativa
> descartada por ahora: copiar todo el Admin dentro de Producción.)
>
> Nota: **v2.74** — Recepción: el pop-up de **cajas** ya **no se cierra al tocar
> el fondo** (se sacó el handler de backdrop-dismiss de `#opCajasModal`). Así, si
> el empleado tarda en cargar el número o toca fuera sin querer, el pop-up **se
> mantiene**; solo se cierra con la ✕ o al confirmar el número.
>
> Nota: **v2.73** — al agregar un código a Log/Fabr, en vez de dejar `Desc`
> vacío, `arSaveCodeRemote` **busca el mismo `Cod_Art` en `Articulos Virgilio X
> Tallerista` (cualquier tallerista) y copia TODAS sus columnas** (Desc, UxB y
> cualquier otro dato del artículo); solo cambia `Cod_Tallerista` + `Linea`
> (borra `id`/`created_at`/`updated_at` para que las regenere la DB). Así el alta
> queda completa con la descripción y los datos que el sistema usa después. Si el
> código no existe en ningún lado, cae a un alta mínima (`Desc: ""`).
>
> Nota: **v2.72** — fix del alta de Log/Fabr: la tabla `Articulos Virgilio X
> Tallerista` tiene la columna **`Desc` NOT NULL**, así que `arSaveCodeRemote`
> mandaba `Desc: ""`. (No era RLS: la tabla sí acepta INSERT.)
>
> Nota: **v2.71** — los artículos agregados a Log/Fabr con "+" ahora se guardan
> en **`Articulos Virgilio X Tallerista`** (la MISMA tabla que lee la grilla),
> NO en localStorage ni en una tabla aparte → quedan fijos y **compartidos entre
> dispositivos**. `arAddCode` inserta una fila por línea (LK y CH) con el
> `Cod_Tallerista` de Log/Fabr (`arSaveCodeRemote`); la lectura normal de
> `renderArticulos` ya las trae (y en Log/Fabr se relaja el filtro "empieza con
> número"). Best-effort: si falla el insert (RLS), avisa con `alert`. ⚠ Requiere
> que la tabla acepte **INSERT** para el rol de la app (policy RLS, SQL por chat);
> y que esa tabla **no se pise** con la sync del Excel. (`?v=2.71`.)
>
> Nota: **v2.70** — Recepción: la grilla de códigos se muestra **ordenada por
> valor numérico** del código (`drawArticulosGrid` ordena por los dígitos
> iniciales, desempate alfabético). Así el artículo agregado a mano con "+" en
> Log/Fabr queda en su **lugar numérico**, no al final. (`recepcion.js?v=2.70`.)
>
> Nota: **v2.69** — **Recepción (Modo OP): agregar artículos a Log/Fabr con "+"**.
> En la grilla de códigos de **Log/Fabr** (solo ese tallerista) aparece un botón
> **"+"**; al tocarlo pide un código nuevo, lo agrega a la grilla, abre el pop-up
> de cajas y lo deja **fijo** para próximas recepciones. Persistencia en
> **localStorage** del dispositivo (`vir_recp_extra_<claveTall>`, ver
> `arEsLogFabr`/`arLoadExtras`/`arSaveExtra`/`arAddCode` en `recepcion.js`).
> ⚠ Es **por dispositivo** (no se comparte entre celulares todavía). El módulo
> `recepcion.js` ahora se carga con `?v=2.69` para bustear caché en cada cambio.
>
> Nota: **v2.68** — **facturación, el NP tildado seguía volviendo (v2.67 no
> alcanzó)**. Causa real: `fetchFacturadosHoy` era el **único** fetch sin
> anti-caché → el refresco leía la lista **vieja** (sin el NP recién facturado) y
> la fila reaparecía. Fix: `&_=Date.now()` + `cache:"no-store"`. Además, refuerzo
> `_facTickedLocal`: los NP tildados con **POST OK** se mantienen ocultos aunque
> la lectura tarde/falle, y se sueltan cuando el server los confirma (se limpia en
> Revertir y en el Cierre). Antes el `_facNpsHoy` se reconstruía del server en
> cada ciclo y descartaba el tilde optimista.
>
> Nota: **v2.67** — **fix facturación: el NP tildado "volvía" a la lista**. El
> tilde se **escribía** con el JWT del supervisor (`facAuthWriteHeaders`) pero
> `fetchFacturadosHoy` **leía con la key anónima**; si las RLS de `Facturacion_NP`
> exigen rol `authenticated` para `SELECT`, el refresco anónimo no veía el NP
> recién facturado y la fila reaparecía en cada ciclo. Ahora `fetchFacturadosHoy`
> lee con el **JWT** si hay sesión (cae a anónimo solo para la TV sin login).
>
> Nota: **v2.66** — **picking que no se pierde si se bloquea el celular**. El
> estado del picking interactivo (`_pk`) ahora se **persiste en `localStorage`**
> (`vir_pk_<legajo>`, incluye los ítems → reanuda offline) en **cada render**
> (`pkSave` en `pkRender`). Al reabrir, `renderPendingSuggestion` muestra
> **"▶ Seguir picking tanda X (hechos/total)"** que retoma exacto donde quedó
> (`pkResume`). Re-tocar EP de la misma tanda también restaura lo ya marcado
> (`showPickingList` mergea los `results` guardados). Se borra al terminar
> (`pkClearSaved` en `pkFinishPicking`); los guardados de días anteriores se
> ignoran y limpian. Antes, si el navegador mataba la pestaña, se perdía todo.
>
> Nota: **v2.65** — armado guiado (sigue apagado): **(a) m³ desde la hoja
> `VolumenArticulos`** (`fetchVolumenArticulos`, gid por `&sheet=VolumenArticulos`;
> detecta col código + col m³ por header) — ya NO se lee de la base de pedidos.
> **(b) Sueltas nunca**: `arPackLios` reparte las cajas en **`round(total/lío)`**
> líos (mín 1) lo más parejo posible, así lo que sobra se **agrega a otro lío o se
> junta entre sí** (mismo m³). Ej.: 11 cajas/lío 5 → **[6,5]**; con override
> 321=4, 11 cajas → **[4,4,3]**; 3 → [3]; 6 → [6]. Cada lío muestra su total de
> cajas. (Edge: si una caja/m³ tiene 1 sola unidad en el pedido, queda 1 lío de
> 1 — inevitable, no se puede mezclar con otra caja.)
>
> Nota: **v2.64** — dos cosas. (a) **Picking: no se puede terminar con artículos
> salteados.** Si el operario usó "Adelante" y dejó artículos sin marcar Ok/F,
> la pantalla final (`pkRenderDone`) **bloquea** "Terminé el picking", lista los
> que faltan y ofrece "Completar los que faltan →" (`pkGoFirstPending` salta al
> primer pendiente). `pkFinishPicking` tiene el mismo guard. Hay que marcar cada
> uno (Ok o F) sí o sí. (b) **Armado guiado (v2.63): total de líos del pedido +
> composición de cada lío.** Ahora muestra un banner "Pedido X · N líos en total"
> y, por caja, **qué juntar en cada lío** (`arPackLios` empaqueta en orden:
> "Lío 1: 505×5", "Lío 2: 505×2 + 586×3", "Sueltas: 586×1"). Sigue apagado por
> defecto.
>
> Nota: **v2.63** — **armado guiado por caja (OPCIONAL, apagado por defecto)**.
> Al tocar **AP** (Empecé Armado Pedido), si `ARMADO_GUIADO_ACTIVO === true` y el
> sheet **"PPP Excel Base Datos Pedidos"** tiene una columna de **m³** (header que
> contenga `m3`/`mt3`/`volum` — lo lee `fetchPickingBase` → `_pickM3Cache`), abre
> una guía interactiva (reusa `#tandaModal` + estilos `pk-*`): agrupa los ítems
> del pedido por **caja = mismo m³** (ítems distintos con igual m³ van juntos) y
> dice cuántos **líos** armar. Lío = `LIO_DEFAULT` (**5**) cajas; el parámetro es
> **por m³**, con override sembrado por código (`LIO_OVERRIDE_COD = {"321":4}` →
> se aplica a la caja/m³ de ese código). Lo que no llega a un lío queda **suelto**.
> Termina sugiriendo **TAP** (igual que el picking sugiere TP). Funciones
> `showArmadoGuide`/`arRender`/`arConfirm`/`arFinish`; hook en `send()`
> (`opcion === "AP"`). **No obligatorio / no rompe nada**: la flag está en
> **false** (no se les muestra a los operarios), es saltable, y si falta el m³ ni
> se activa (AP funciona como hoy). Pendiente del dueño: confirmar la
> hoja/columna real del m³, y dar OK para activarlo. (Aún no emite evento de
> detalle por caja — se agrega cuando se active.)
>
> Nota: **v2.62** — **cantidad de cajas por defecto al cerrar RT**. Al tocar RT
> para **cerrarlo** (2º toque, "Indicar Cantidad" en `selectOption`), el campo ya
> viene **pre-cargado** con las cajas que contó el Modo OP (editable). Para que
> cada recepción muestre **lo suyo** y no se acumule entre recepciones del día,
> el contador se **reinicia a 0 cada vez que se abre RT** (`recepcionResetCajas`
> en el hook de `send()`). El cierre por Terminar Día sigue igual (read-only). Es
> el mismo acumulador `localStorage` de v2.61.
>
> Nota: **v2.61** — **Modo OP de Recepción integrado en RT**. Al tocar **`RT`**
> (Recepción Mercadería, 1er toque/apertura) se abre el **Modo OP** portado de
> la app `Control-Carga-Remitos-FC` (v1.13.0): elegir Talleristas / Prov. Art.
> Terminado → buscar → línea **LK/CH** + fecha → N° RTO/FC → grilla de códigos
> con pop-up de cajas → resumen → confirmar. Graba en `Entregas Tallerista
> Virgilio` / `Entregas Prov AT` + deja el pendiente en `Control_Modo_OP` (mismo
> Supabase `hrxfctzncixxqmpfhskv`, pero con **login anónimo** vía `supabase-js`
> para pasar RLS). Vive en **`recepcion.js`** (`<script type="module">`),
> aislado bajo `#rcpRoot` (DOM + CSS scopeados, no choca con el `button{}` global
> de Producción). Expone `window.openRecepcionOp(legajo, dayKey)`; el hook está
> en `send()` (`if (opcion === "RT" && toggles.RT)`). **Necesita conexión** (lee
> y escribe datos vivos), a diferencia del resto de la app. **Cantidad de RT
> automática**: cada confirmación suma las cajas a `localStorage`
> (`vir_recepcion_cajas_<legajo>_<día>`); al **Terminar Día**, RT se cierra con
> ese total (`recepcionCajasDelDia`) **sin pedir el número a mano** — el campo es
> read-only y la validación no lo bloquea. Anular un envío resta del acumulador.
>
> Nota: **v2.60** — **aviso Telegram por códigos sin planimetría**. Al armar el
> picking, si hay códigos que no figuran en `window.GONDOLA` (planimetria.js),
> la app emite **un** evento **`PSP`** por tanda/legajo/día (`texto =
> TANDA|COD1,COD2`, id `psp_<legajo>_<tanda>_<día>` + upsert) por la cola
> offline. Un trigger de Supabase (`trg_sin_planim_telegram` →
> `notificar_sin_planimetria_telegram()`, **solo INSERT** a propósito: reabrir
> el picking upsertea y NO re-avisa) lo manda al bot `@Faltantes_Virgilio_bot`
> (mismo bot/chat que faltantes). Guard: si planimetria.js no cargó (`GONDOLA`
> vacío) NO avisa (serían todos falsos positivos). Función
> `pkNotifySinPlanim` en `index.html`; `PSP` agregado al `isUpsert` de ambos
> `trySendOneReport` (index + sw).
>
>
> Nota: **v2.59** — **planimetría / orden de góndola activado** en el picking. Se
> agregó **`planimetria.js`** (`window.GONDOLA = { "502":["A01",1], … }`, 315
> artículos código→[sector, orden]) generado de la hoja **"Picking"** del Excel
> `AAA_PPP_Vigente.xlsm` (cols Emp·Cod·Sector·Orden). `showPickingList` ahora
> **ordena los artículos por el `orden` de góndola** (los sin planimetría caen al
> final, numérico) y le adjunta el **sector**; `pkRender` muestra `Sector: A01`
> real (antes placeholder). Para actualizar la planimetría: re-subir el Excel y
> regenerar `planimetria.js` desde la hoja "Picking". `index.html` lo carga con
> `<script src="planimetria.js">`.
>
>
> Nota: **v2.58** — **vista "Faltantes"** en el panel del supervisor (botón 📦,
> modal `#faltantesModal`). Lee los eventos `PKC` del día elegido (selector hoy +
> 6) con la clave pública (REST, igual que el resto del monitor), filtra los que
> tienen `real < esperadas` y los **agrupa por tanda** (Artículo · Puso · Pedía ·
> Falta · Legajo) + resumen (tandas / artículos / cajas faltantes). Auto-refresco
> 20s. Funciones: `openFaltantes`/`refreshFaltantes`/`faltantesSetDay`.
>
>
> Nota: **v2.57** — **Carga Camión**: al iniciar `CC` (1er toque), el operario ve un
> checklist de las **NP de las tandas con armado terminado** (`TAP`, de
> `getActivityStatus().armadoDone` cruzado con `fetchMonitorSheet` para los NP) y
> **tilda las que cargó**. Cada NP marcada → evento **`CCN`** (texto = `NP|TANDA`)
> por la cola offline, con id determinístico `ccn_<legajo>_<np>_<día>` + upsert.
> Funciones: `showCargaCamion`/`ccRender`/`ccToggle`/`ccSave`/`ccSendDetail`.
> (v2.56: sector del picking como placeholder visible.)
>
> Nota: **v2.55** — el picking interactivo ahora tiene navegación ← Atrás /
>
> Nota: **v2.55** — el picking interactivo ahora tiene **navegación ← Atrás /
> Adelante →** entre artículos (se puede ir y volver; al revisitar uno confirmado
> muestra "ya confirmaste X (faltaron Y) — podés cambiarlo"). Para que ir y volver
> NO duplique registros, el evento `PKC` pasa a **client_id determinístico**
> (`pkc_<legajo>_<tanda>_<art>_<día>`) y **upsert** (merge-duplicates): reenviar o
> corregir hace UPDATE de la misma fila. Se extendió el `isUpsert` (antes solo FJ)
> en `trySendOneReport` de `index.html` y `sw.js` para incluir `PKC`. Funciones
> nuevas: `pkPrev`/`pkNext`/`pkAdvance`/`pkCount`. El popup se mantiene (no es
> pantalla completa).
>
> Nota: **v2.54** — el pop-up de picking pasó de **solo-lectura** a **flujo
> interactivo de a un artículo**: muestra `CÓDIGO` + cajas a levantar (y `sector`
> en gris hasta que se suba el orden de góndola), y el operario confirma con
> **Ok** (puso lo pedido → siguiente directo) o **F** (no está todo → anota
> cuántas cajas puso). Cada confirmación **se guarda en Supabase** como un evento
> nuevo **`PKC`** ("Picking artículo") por la **cola offline** (no se pierde sin
> red): `texto = "TANDA|CÓDIGO|ESPERADAS|REALES"` (ej. `A15C|502|5|3`), un evento
> por artículo. Reporte de faltantes: `where opcion='PKC'`, `split('|')` →
> faltante = esperadas − reales. Funciones en `index.html`: `showPickingList`
> (ahora arma `items[{art,esp}]` ordenados y abre el flujo), `pkRender`, `pkOk`,
> `pkF`/`pkConfirmF`, `pkSendDetail`. Al terminar todos los artículos, la pantalla
> final ofrece **"Terminé el picking"** (`pkFinishPicking`) que dispara el `TP`
> reusando `send()` (setea `selected="TP"` + el código de tanda). Pendiente: orden
> de góndola + sector real (cuando se suba ese dato).
>
> Nota: **v2.53** — **lista de picking** (pop-up al "Empecé Picking"). Cuando el
> operario manda `EP` con una tanda, aparece un modal (reusa `#tandaModal`) con
> los **artículos a levantar**: cruza la tanda → sus pedidos (`PPP Excel
> Programacion Diaria`, vía `fetchMonitorSheet` → `sheetMap.pedidos[].np`) con los
> artículos de cada pedido (hoja **`PPP Excel Base Datos Pedidos`**, ~20k filas:
> `Pedido | Fecha | Artículo | … | Cantidad Cajas`), **suma las cajas por código**
> y las muestra **ordenadas numéricamente** (después: orden de góndola). La base se
> baja por gviz **por nombre** (`&sheet=PPP Excel Base Datos Pedidos`, no por gid)
> y se cachea 5 min (`fetchPickingBase`). Si la tanda no está o no hay conexión, el
> modal lo avisa. Funciones nuevas en `index.html`: `fetchPickingBase`,
> `showPickingList`, `renderPickingList`; enganche en el flujo de envío (rama
> `opcion === "EP"`). La hoja `PPP Excel Base Datos Pedidos` la pushea la macro de
> Excel (vía `handleCargaPPPSync_`, ALLOWED_SHEETS), igual que Programación y
> Pedidos Entregados.
>
> Nota: **v2.52** — (a) el `#versionBadge` ya **no trae versión hardcodeada** en el
> HTML (antes decía `v2.04 ✓` y nunca se actualizó → engañaba el diagnóstico):
> queda **vacío** y lo llena el JS (`updatePendingIndicator`). **Regla de
> diagnóstico:** si el badge muestra versión → el JS corrió; si queda **vacío** →
> el JS NO corrió (navegador que no parsea el código / error). (b) El Service
> Worker, en `activate`, ahora **borra todas las cachés viejas** (`caches.delete`):
> versiones MUY viejas del SW precacheaban el HTML y dejaban TVs pegadas a un
> `index.html` viejo aunque se cambiara la URL; con esto, cualquier device que
> agarre el SW nuevo se auto-despega. ⚠ Un navegador que NO pueda ejecutar el JS
> (ES2017) tampoco corre el SW nuevo → para esos hay que **borrar datos del
> navegador** a mano (o usar una página de monitor en ES5, aún no existe).
>
> Nota: **v2.51** — en **modo kiosko** (TV de pared, `?monitor=tv&key=tv`) el
> handler de `load` ahora llama a `maybeAutoOpenMonitor()` además de
> `showKioskAdminPanel()`, así la TV **entra directo a la vista que pide la URL**
> (`?monitor=tv`→Monitor, `fc`→Facturación, `incons`→Inconsistencias) en cada
> recarga, en vez de quedarse en el panel "Administración". El panel queda de
> fondo: si se cierra la vista, sigue estando para elegir otra. (Antes el kiosko
> no auto-abría nada porque `initAuth()` corta en `__tvKioskMode` antes de llamar
> a `maybeAutoOpenMonitor()`.)
>
> Nota: **v2.50** — `fetchMonitorSheet` ahora lee la pestaña "PPP Excel
> Programacion Diaria" por **posición de columna FIJA**, no por nombre de
> encabezado. La pestaña tiene sub-tablas apiladas con encabezados repetidos,
> incompletos y duplicados por gviz; depender del header era frágil. Layout fijo
> (índices, 0-based): `Tanda=0, Tipo=1, N° NP=2, Fecha Recep=3, Cod=4, Razon
> Social=5, M3=6, V=7, Direccion=8, Barrio=9, Op=10, Fecha Entrega=11, Fecha
> Fc=12, Zona=13, Observaciones=14`. Se recorren TODAS las filas y se toman como
> pedido sólo las que tienen **N° NP** (las de título/encabezado/total no lo
> traen). `opIsSi` respeta la columna `Op`. Sanity-guard: si no hay ningún
> encabezado reconocible (p.ej. una página de login HTML) tira error; si lo hay
> pero las columnas no caen donde se esperan, avisa por consola (señal de que
> cambió el Excel → actualizar el objeto `C` en `fetchMonitorSheet`). ⚠ **Si se
> reordena/agrega una columna en el Excel, hay que actualizar esos índices.**
> Validado contra el CSV real del 2026-06-05. (v2.48/v2.49 fueron pasos previos:
> detección de header tolerante; v2.50 la reemplaza por posición fija.)
>
> Nota: **v2.49** arregla del todo el bug "Sin tandas planificadas" en la pestaña
> "PPP Excel Programacion Diaria" (la que lee el monitor, `gid=1947169223`). Esa
> pestaña tiene **varias sub-tablas apiladas** ("Pedidos con Problemas o Nuevos",
> "…Super a Programar", "…a Programar", "Programacion"), cada una con su fila de
> encabezado. Dos problemas: (1) gviz **duplica** los labels del header bueno
> ("Op Op", "M3 M3", "Fecha Entrega Fecha Entrega") → el match exacto de columnas
> fallaba; (2) los headers de las sub-tablas son **incompletos** (traen "Op" pero
> la col "Fecha Entrega" vacía). Cuando las sub-tablas crecen, el parser agarraba
> un header parcial y ninguna tanda quedaba con fecha → monitor vacío con `● al
> día`. Fix (index.html, `fetchMonitorSheet`/`findMonitorHeader`): `dedupeHeaderCell`
> colapsa los labels duplicados, `findMonitorHeader` exige tanda+op+`fecha entrega`
> (1ra pasada) escaneando 50 filas, se saltean las filas de encabezado repetidas
> (`Op`/`Tanda` literales) y `opIsSi` pasa a respetar la columna `Op` (antes
> `!tanda` marcaba como planificadas las filas sin código de tanda → los pedidos
> "a Programar"/"con Problemas" con Op vacío entraban como `S/Tanda` y sus fechas
> futuras desplazaban tandas reales de la ventana). Validado contra el CSV real
> del 2026-06-05 (header en fila 0 ya de-duplicada; C19H/C32C/C31A salen para hoy).
> **v2.48** fue un intento previo insuficiente (no contemplaba los labels
> duplicados ni el header incompleto).
>
> Nota: **v2.45** re-aplica el parche **"entrar con legajo"** (de Producción
> Virgilio v1.86): debajo del botón de Google, la pantalla de login tiene un
> input para tipear el legajo; se resuelve contra `Empleados` y la sesión
> (`vir_legajo_auth`) dura el día. Se había perdido al rebasar sobre tv-v.
>
> Nota: **v2.44** parte de la base **tv-v v2.43** (monitor en vivo + kiosko TV
> actualizados: tablas Mts3 x Hora, Parcial, Total por día, FC ✓, legajo en
> picking, duraciones cross-day, etc.) y le re-aplica dos features de operario:
> **(a) Llegada Tarde (`LT`)** automática y **(b) continuar tarea al día
> siguiente** (ver § 4). Importante: el **tiempo de LT NO se cuenta como
> trabajado** en el monitor (se excluye `opcion="LT"` en `fetchMonitorDayStats`,
> `showDayBreakdown` y `fetchProductivityData`). Sede `V` quedó con jornada
> **08:00–17:00** en `Empleados`.
>
> Nota: v1.49 (de otra branch) agregó la **pantalla de Facturación** (botón 🧾,
> tick por NP, tabla `Facturacion_NP`) y **gráficos de productividad** (Chart.js:
> m³/h por operario por día, picking y pedido) con export **PDF** (jsPDF) en el
> monitor. En **v1.51**: los días sin datos ya no se grafican en 0 (quedan como
> hueco) y al **tocar/click en un punto** se abre la composición de ese promedio
> (las tandas con su m³ y tiempo que suman el m³/h).
>
> En **v1.52**: se **habilitó el QR de fichada** (`QR_DISABLED=false`, flujo
> Supabase verificado), el monitor **excluye legajos test 0/1** de conteos/gráficos,
> los botones 📊/📋 ya no aparecen en el celular del operario (el supervisor abre
> monitor/facturación por URL `?monitor` / `?monitor=fc`), más varios fixes de
> estética/CSS.
>
> En **v1.53**: compatibilidad con navegadores de TVs viejas (~2017+). Se quitó la
> sintaxis que rompía el parseo en esos navegadores (`?.`, `catch` sin binding,
> spread de objeto, `Promise.allSettled`). ⚠ El código usa `async/await` y arrow
> functions (ES2016-2017), así que **TVs de 2015-2016 todavía NO lo corren** — para
> esas haría falta una página de monitor aparte escrita en ES5.
>
> En **v1.55**: el logo de la app (`icon.svg`) se muestra en los headers del
> **Monitor Virgilio** y de **Facturación (ventas)** — clase `.hdr-logo`, escala con
> el título (em) así crece en modo TV. (En v1.54 se había puesto en la pantalla de
> legajo; se movió a los monitores.) Resto pendiente de detallar.
>
> En **v1.56**: los botones flotantes **📊 Monitor Virgilio** y **📋 Facturación
> (ventas)** vuelven a estar **siempre visibles** abajo a la izquierda, en cualquier
> pantalla y dispositivo (se revierte el ocultamiento de v1.52). Cualquiera puede
> abrir los monitores tocándolos.
>
> En **v1.57**: (a) **3er botón flotante ⚠ Inconsistencias** a la derecha del de
> Facturación (abre el monitor directo en esa pestaña; también por URL
> `?monitor=incons`). (b) El **Monitor Virgilio abre SIEMPRE en modo TV** (fondo
> azul, tablero completo), aunque la pantalla sea chica — ya no usa el popup blanco.
>
> En **v1.58**: (a) se **quitó la pestaña de Inconsistencias del Monitor Virgilio**
> (el modal ya no tiene pestañas); Inconsistencias se abre solo por su botón ⚠ y el
> título del modal cambia a "Inconsistencias". (b) **Responsive del monitor TV**: el
> tablero azul ahora **scrollea** si no entra (antes se recortaba con `overflow:hidden`)
> y **se apila en 1 columna en celular** (`@media max-width:760px`) → entra bien en la
> TV de 32" y en pantallas chicas.

---

## 0. Qué es

App web de una sola página (PWA, sin framework) para registrar la **producción
de un depósito** (picking, armado de pedidos, carga de camión, recepción, etc.).
La usan los **operarios** desde el celular tocando botones de acción, y los
**supervisores** desde un **monitor** que cruza esos eventos con la programación
de pedidos de un Google Sheet.

- Se sirve desde **GitHub Pages**: `https://loekemeyer.github.io/Produccion-Virgilio/`
- Repo: `loekemeyer/produccion-virgilio` · se publica desde la branch **`main`**
  (lo que llega a `main` queda online en ~1 min; cada pantalla lo ve al refrescar).
- Branch de desarrollo actual: **`claude/fix-virgilio-production-GoGCS`**.
- **Play Store**: la PWA se publica como **TWA** (envoltorio Android que abre la
  web a pantalla completa). Cómo generar el `.aab` y publicar: ver
  **`PLAY-STORE.md`**. Config en `twa-manifest.json`; íconos PNG en `icons/`;
  Digital Asset Links en `.well-known/assetlinks.json` (¡va en la raíz del
  origen, no bajo `/Produccion-Virgilio/`!).

---

## 1. Archivos del repo

| Archivo | Rol |
|---|---|
| `index.html` | **La app completa** (~6.600 líneas): pantalla de operario + monitor + toda la lógica JS/CSS. Es el archivo central. |
| `sw.js` | Service Worker. **NO cachea HTML/assets**: sólo hace Background Sync de la cola offline (IndexedDB). `SW_VERSION = "v3.47-vir"`. |
| `manifest.json` | Manifiesto PWA. |
| `fichada.html` / `fichada.js` / `fichada-config.js` / `fichada-totp.js` / `fichada.css` | Sistema de **fichada por QR rotativo (TOTP)**. La página `fichada.html` se abre escaneando el QR y registra el **ingreso**. |
| `fichadas-monitor.html` | Tablero **independiente** "Monitor Fichadas Esnaola" (lee de `Fichadas_Historico` y sincroniza otro Google Sheet distinto). No está enlazado desde `index.html`. |
| `monitor/index.html` | Shim de **redirección**: da la URL limpia `/Produccion-Virgilio/monitor` → redirige a `/?monitor=tv` (para colgar la Smart TV). |
| `qrcode.js` | Librería vendorizada para generar QR. |
| `icon.svg` | Ícono (fuente vectorial). |
| `icons/` | Íconos PNG 192/512 + maskable + ícono 512 para la ficha de Play (generados desde `icon.svg`). Requeridos por la PWA/TWA. |
| `twa-manifest.json` | Config de Bubblewrap para empaquetar la TWA (Play Store). |
| `.well-known/assetlinks.json` | Plantilla de Digital Asset Links (verificación de la TWA). |
| `PLAY-STORE.md` | Guía paso a paso para generar el `.aab` y publicar en Google Play. |

---

## 2. Pantallas y navegación

Todo vive en `index.html`, alternando con la clase `.hidden` (no hay router):

- **Pantalla de legajo** (`#legajoScreen`): **login obligatorio con Google**
  (Supabase Auth, provider Google del proyecto `hrxfctzncixxqmpfhskv`). Arranca
  mostrando sólo el botón "Iniciar sesión con Google" (`#authBlock`). Tras loguear,
  el módulo de auth decide el **rol** por email y muestra la pantalla acorde:
  - **Supervisor** (emails en `SUPERVISOR_EMAILS`: `loekemeyer.n8n@gmail.com`,
    `loekemeyer.logistica@gmail.com`): ve `#supervisorPanel` con **4 botones grandes
    centrados** (📊 Monitor de operarios, 📋 Facturación, ⚠ Inconsistencias,
    📈 Análisis de productividad). No necesita estar en `Empleados` ni tiene legajo.
    (Los antiguos botones flotantes de abajo se eliminaron.)
  - **Operario** (email cargado en `Empleados`): se resuelve `email → {Legajo, Empleado}`
    (`select=Legajo,Empleado`). Ya **no se tipea el legajo** y **salta directo a la
    grilla de opciones** (EP/TP/...) vía `goToOptions()`. El **nombre** se muestra en
    `#userTag` arriba a la izquierda (persistente, también en opciones). El `#legajoInput`
    queda oculto (`display:none`) pero conserva el Legajo, así todo el código que lee
    `legajoInput.value` (~15 lugares: envíos, historial) sigue funcionando sin cambios.
    El `#legajoEntry` (saludo "Hola, {nombre}" + Continuar + Salir) queda como pantalla
    de "volver" (botón ← de opciones) y para el logout. **No** ve nada de supervisor.
  - **No autorizado** (ni supervisor ni en `Empleados`): `signOut()` inmediato +
    aviso "no autorizada". No se le da acceso usable.
  - **Gate de monitores:** `requireSupervisor()` protege `openMonitor/openFacturacion/
    openInconsistencias/openAnalisis` (vía `window.__isSupervisor`), así no se entra
    por la URL directa. El auto-open por URL (`?monitor=tv/fc/incons`) se difiere a
    `maybeAutoOpenMonitor()`, que el módulo de auth llama sólo si el email es supervisor.
  - **Modo kiosko (TV box / pantalla de pared, SIN login), con enrolamiento:** como el
    TV box no puede loguearse con Google (navegador viejo / webview bloqueado), se
    accede al monitor con una **URL + clave que se usa UNA sola vez**:
    `?monitor=tv&key=<MONITOR_TV_KEY>` (también `fc`, `incons`). Flujo:
    1. Primera vez en ese dispositivo: la clave válida marca el device como kiosko en
       `localStorage` (`vir_tv_kiosk=1`) y **borra la clave de la URL** con
       `history.replaceState` (queda `?monitor=tv` pelado, la clave no queda a la vista).
    2. De ahí en más, ese TV entra con `?monitor=tv` solo. Un dispositivo no enrolado
       que lea esa URL en la pantalla **no entra** (no tiene flag ni clave) → login.
    El main script setea `window.__tvKioskMode=true` + `window.__isSupervisor=true` y
    en `load` muestra el **panel "Administración"** (`showKioskAdminPanel()`: revela
    `#supervisorPanel` con los 4 botones, oculta login/operario y el botón Salir) **como
    fondo** y, desde **v2.51**, **auto-abre directo la vista que pide la URL**
    (`maybeAutoOpenMonitor()`: `?monitor=tv`→Monitor, `fc`→Facturación, `incons`→
    Inconsistencias) — la TV de pared va derecho al tablero en cada recarga; si se
    cierra esa vista, queda el panel detrás para elegir otra. Todo **sin Google y sin depender de
    `supabase.js`** (el módulo de auth detecta `__tvKioskMode` y no inicializa). `MONITOR_TV_KEY` es constante en
    `index.html` (hoy `"tv"`); cambiala para rotar la clave (los devices ya
    enrolados siguen hasta que se borren los datos del navegador). Para des-enrolar un
    device: borrar datos del navegador. El resto (celulares/PC) sigue con login Google.
  - **Duración de la sesión:** `supabase-js` la persiste en `localStorage` y dura
    **todo el día** (cerrar el navegador NO desloguea). Se cierra: (a) al cambiar de
    día — `applyAuthState` compara `vir_auth_day` (día BsAs guardado al loguear) con
    `getTodayKey()` y si difiere hace `signOut`; (b) al confirmar **Terminar Día**
    (`confirmarTerminarDia` llama `window.endDaySignOut()`). Así a la mañana siguiente
    o tras finalizar el día se vuelve a pedir login.
  - **supabase-js va SELF-HOSTED**: `supabase.js` (bundle UMD, ~200 KB) en la raíz del
    repo, cargado con `<script src="supabase.js">` (expone el global `supabase`). NO se
    usa CDN, así el login no depende de un tercero. El `redirectTo` preserva el query
    (`?monitor=tv`) para que la TV vuelva a la misma URL tras el login. (Para actualizar
    la lib: `npm pack @supabase/supabase-js@2` y copiar `dist/umd/supabase.js`.)
  - **Para autorizar a un operario nuevo:** cargar su `email` en `Empleados`. Para un
    supervisor nuevo: agregar el email a `SUPERVISOR_EMAILS` en `index.html`.
  - **Requisitos de config (fuera del código):** provider Google habilitado en
    Supabase Auth · la URL de GitHub Pages (`https://loekemeyer.github.io/Produccion-Virgilio/`)
    en la allowlist de *Redirect URLs* · consent screen de Google OAuth en
    producción (o el operario como test user) · el `email` del empleado cargado
    en `Empleados` (hoy sólo ~9 de 58 lo tienen).
  - La allowlist es a nivel app (chequeo contra `Empleados`/`SUPERVISOR_EMAILS` +
    `signOut`). Una cuenta de Google ajena que complete el OAuth igual crea una fila
    transitoria en `auth.users`, pero queda deslogueada y sin acceso. El login es una
    **puerta de UI**, no el candado de los datos (la app lee/escribe con la clave
    pública anon igual que antes; el blindaje real de datos sería RLS).
  - El límite de "sólo 2 mails" del otro programa que usa el mismo proyecto Auth
    es lógica de *esa* app, **no** una restricción de Supabase (no hay hook ni
    trigger en el esquema `auth`): no afecta a esta app.
- **Pantalla de opciones** (`#optionsScreen`): la grilla de botones de acción +
  botón rojo **"Terminar Día"** (dispara el `FJ`).
- **Botones flotantes**: 📅 historial de días anteriores · 📊 **monitor** del supervisor.
- **Monitor**: se abre con 📊 o automáticamente con `?monitor=tv` (o si la pantalla
  mide ≥1600 px). La URL `/Produccion-Virgilio/monitor` entra directo en modo TV
  (con **cache-buster** automático para no quedar pegada a una versión vieja, ver § 10).
  Tiene **dos pestañas**: **Monitor** (tablero de tandas) e **Inconsistencias**
  (hoja de alertas, ver § 12).

---

## 3. Modelo de datos (Supabase)

- Proyecto Supabase: **`Control Partes Talleristas`** · id **`hrxfctzncixxqmpfhskv`**
  · región `sa-east-1` · Postgres 17. (La base es **compartida** con otros
  sistemas: tiene ~90 tablas; abajo sólo las que usa esta app.)
- URL: `https://hrxfctzncixxqmpfhskv.supabase.co`
- Key en el cliente: `sb_publishable_BqpAgZH6ty-9wft10_YMhw_0rcIPuWT`
  (**publishable / pública por diseño**; RLS permite INSERT de producción/fichadas
  y los SELECT que el monitor necesita). La misma trinca está en `sw.js`,
  `fichada-config.js` y `fichadas-monitor.html`.
- Acceso desde Claude: usar la **herramienta MCP `execute_sql`** con
  `project_id = hrxfctzncixxqmpfhskv` (no requiere red del sandbox).

### Tablas que usa la app

**`Registros_Produccion_Virgilio`** — el **log de eventos de producción** (la tabla
clave para casi todo). Cada fila = una acción de un operario:

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid | |
| `client_id` | text | id de la cola offline; en `FJ` es determinístico `fj_<legajo>_<YYYY-MM-DD>` |
| `legajo` | text | número de operario (texto) |
| `opcion` | text | **código de acción** (ver § 4) |
| `descripcion` | text | texto legible de la acción ("Empecé Picking", …) |
| `texto` | text | dato capturado: **código de tanda/pedido** o cantidad o (en FJ) un JSON de conteos. Siempre `.trim().toUpperCase()` |
| `ts_cliente` | timestamptz | momento del evento (cierre, si es un cierre) |
| `ts_inicio` | timestamptz | **sólo en eventos de cierre** = momento de apertura → `duración = ts_cliente − ts_inicio` |
| `created_at` | timestamptz | insert en servidor |

**`Fichadas_Virgilio`** — ingresos por QR: `legajo`, `email`, `tipo` (= `"ingreso"`),
`ts_cliente`, `client_id`, `user_agent`, `ip_hint`, `created_at`. (Hoy está
**muy poco usada** — pocos registros — porque el QR in-app está deshabilitado; ver § 9.)

**`Fichadas_Historico`** — espejo de marcas: `ts_evento`, `evento`
(`Entrada` / `Salida` / `Comida Inicia` / `Comida Termina`), `email`, `legajo`,
`empresa`, `imported_at`.

**`Empleados`** — maestro: `Legajo`, `Empleado` (nombre), `email`, `Num_Tel`,
`Activo`, `Sede`, `hora_entrada`, `hora_salida`, `tipo`. Sirve para resolver
legajo↔nombre y legajo↔email.

**`Auditoria_Produccion_Virgilio`** — auditoría de envíos (intentos, motivos,
user_agent, ts_inicio/ts_cliente).

**Tablas PPP (espejo de Google Sheets, v2.80 — opcionales: se leen sólo si
`PPP_SOURCE` ≠ `"sheets"`):** cada una con `id` autonumérico y carga por
**reemplazo total** (DELETE all + INSERT), igual que el `clearContents`+`setValues`
del Apps Script → se permiten filas repetidas, fiel a la hoja.
- **`PPP_Programacion_Diaria`** ← hoja "PPP Excel Programacion Diaria" (1 fila por
  N° NP). Cols: `np`, `tanda`, `tipo`, `fecha_recep`, `cod`, `razon_social`,
  `m3` (numeric), `v`, `direccion`, `barrio`, `op`, `fecha_entrega`, `fecha_fc`,
  `zona`, `observaciones`.
- **`PPP_Pedidos_Entregados`** ← hoja "PPP Excel Pedidos Entregados 2026" (m³
  histórico). Cols: `tanda`, `mt3` (numeric, col Mt3 — NO "Mt3 FC").
- **`PPP_Base_Pedidos`** ← hoja "PPP Excel Base Datos Pedidos". Una fila por línea.
  Cols: `pedido`, `articulo`, `cajas` (numeric).

Las escribe el **Apps Script** (`handleCargaPPPSync_`, el que ya escribe las hojas)
con la `service_role` key del proyecto Virgilio (bypassa RLS); ⚠ las props Supabase
que ya tiene ese script apuntan a OTRO proyecto (`kwkclwhmoygunqmlegrg`, la web), por
eso el hook usa props nuevas `SUPABASE_VIRGILIO_*`. La app sólo las **lee** (RLS
`select` para `anon`/`authenticated`). DDL en `sql/ppp_supabase.sql`; hook en
`apps-script/sync-ppp-supabase.gs`; diseño en `MIGRACION-SUPABASE-PPP.md`.

**`Entregas_Virgilio`** (v3.99) — **registro de lo entregado por pedido** (NO es una
vista; es una **tabla** persistente que **la app llena al dar TAP**, vía
`_compSaveEntregas`). Una fila por **NP × artículo** del pedido entero de la tanda:

| Columna | Tipo | Notas |
|---|---|---|
| `id` | bigint | autonumérico |
| `fecha_salida` | text | **fecha de ENTREGA** (`fecha_entrega` de `PPP_Programacion_Diaria`, no la de armado) |
| `cod_cliente` | text | código de cliente del NP |
| `np` | text | número de NP |
| `cod_art` | text | código de artículo |
| `cajas_pedidas` | numeric | lo que pedía el picking para esa NP/artículo |
| `cajas_entregadas` | numeric | `cajas_pedidas − cajas_falto` |
| `cajas_falto` | numeric | faltante asignado a esa NP en el reparto del Paso 2 del wizard (0 si no faltó) |
| `tanda` | text | código de tanda |
| `creado` | timestamptz | insert en servidor (default `now()`) |

RLS: `ent_insert`/`ent_select` para `anon`+`authenticated` (la app escribe con la
publishable key). **No duplica la base**: la fila guarda el pedido tal como estaba al
entregar (no se re-lee la efímera `PPP_Base_Pedidos`). **Offline-safe**: si el POST
falla por red, las filas quedan en `localStorage` `vir_entregas_pend` y se reintentan
al volver online / al cargar (`_compFlushEntregas`). La consume el **programa externo**
de seguimiento de entregas. (Reemplaza a las vistas `Entregas_Virgilio`/`Faltantes_Virgilio`
y a los eventos `FAL` de v3.97/v3.98, ya eliminados.)

---

## 4. Códigos de acción (`opcion`)

Definidos en `index.html` (objeto `desc`, ~línea 1531). Los botones se arman en
3 filas:

| Código | Descripción | Grupo | ¿Captura `texto`? |
|---|---|---|---|
| `EP` | Empecé Picking | CORE (inicio) | Sí — código de tanda (ej. `A12B`) |
| `TP` | Fin Picking | CORE (cierre) | Sí — código de tanda |
| `AP` | Empecé Armado Pedido | CORE (inicio) | Sí — código de pedido |
| `TAP` | Terminé Armado Pedido | CORE (cierre) | Sí — código de pedido |
| `CR` | Control Remitos | TOGGLE | Sí — abre **popup de control de facturados** (`showControlRemitosCR`, v3.69): lista de facturados del reparto + Líos + tic **Controlado** → `CCR` por NP + cierra el toggle. (Fue toggle plano sin popup en v3.43–v3.68.) |
| `RR` | Recepción Remitos | TOGGLE | Abre el popup de descarga (tabla NP cargados → tildar Controlado → «Terminé» = `CRN` por NP); desde v3.43 lleva la lógica que antes tenía `CR`. **v3.75+**: además hay un botón **"Recepción Remitos (RR)"** en Administración (`openRemitosAdmin` → `showControlRemitos("0", true)`) que abre la **MISMA lista** en modo admin (legajo `0`, sin cerrar toggle). Lo controlan operarios **y** admin. (v3.76 lo había sacado de los operarios; revertido en v3.77.) |
| `CC` | Inicio/Fin Carga Camión | TOGGLE | Sí, al cerrar (Nro) |
| `RT` | Recepción Mercadería | TOGGLE | Sí, al cerrar: `texto` = cantidad de cajas, **calculada sola** del Modo OP de Recepción (suma del día en `localStorage`, ver v2.61). Al abrir RT se lanza el Modo OP (`recepcion.js`). |
| `MG` | Guardado a Góndola | TOGGLE | No |
| `RI` | Recepción Insumos | TOGGLE | Sí, al cerrar (cantidad) |
| `EI` | Entrega Insumos | TOGGLE | Sí, al cerrar (cantidad) |
| `AT` | Atendí Timbre | TOGGLE / tiempo muerto | No |
| `PB` | Paré Baño | TOGGLE / tiempo muerto | No |
| `Limp` | Limpieza | TOGGLE / tiempo muerto | No |
| `Perm` | Permiso de Salida | TOGGLE | No |
| `PC` | Paré Comida | TOGGLE / tiempo muerto | No |
| `CT` | Conteo | TOGGLE / tiempo muerto | No |
| `FJ` | Fin de Jornada | (botón "Terminar Día") | `texto` = JSON con los conteos del día |
| `LT` | Llegada Tarde | (automático) | `texto` = minutos de demora; `ts_inicio` = inicio de jornada, `ts_cliente` = primer mensaje. **NO cuenta como trabajado** en el monitor |
| `PKC` | Picking artículo | (detalle de picking, v2.54) | `texto` = `TANDA\|CÓDIGO\|ESPERADAS\|REALES` (ej. `A15C\|502\|5\|3`). Un evento por artículo confirmado en el flujo de picking. El monitor lo ignora (no está en los grupos). |
| `CCN` | Carga Camión NP | (detalle de carga, v2.57) | `texto` = `NP\|TANDA` (ej. `97754\|C47B`). Un evento por NP marcada como cargada al camión. id determinístico `ccn_<legajo>_<np>_<día>` + upsert. El monitor lo ignora. |
| `PSP` | Picking sin planimetría | (automático, v2.60) | `texto` = `TANDA\|COD1,COD2` (códigos del picking que no están en `planimetria.js`). UNO por tanda/legajo/día (id `psp_<legajo>_<tanda>_<día>` + upsert). Dispara aviso Telegram vía trigger `trg_sin_planim_telegram` (solo INSERT → no spamea al reabrir). El monitor lo ignora. |
| `TAL` | Líos por NP (TAP) | (detalle de armado, v3.34) | `texto` = `NP\|LÍOS\|TANDA` (ej. `97754\|3\|C47B`). Un evento por NP de la tanda al terminar armado (popup obligatorio tras `TAP`; si no lleva, `0`). Lo lee Control Remitos para la columna Líos. id aleatorio (no upsert). El monitor lo ignora. |
| `CRN` | Control Remito NP | (detalle de control, v3.36) | `texto` = `NP\|TANDA` (ej. `97754\|C47B`). Un evento por NP marcada como **recibida/controlada** en Recepción Remitos (`RR`, antes `CR`). id determinístico `crn_<legajo>_<np>_<día>` + upsert. La PPP lo lee (`pppRefreshControlado`) y pasa el pedido a **Pedidos Entregados**. El monitor lo ignora. |
| `CRA` | Carga sin control (vencido) | (automático, v3.37) | `texto` = `NP\|TANDA\|RAZÓN`. Lo emite la PPP (`pppCheckCargaVencida`) cuando un pedido **cargado (CCN) sigue sin controlar (CRN/manual)** pasado el plazo (`crVencido`). id determinístico `cra_<np>_<día>` + upsert; legajo `0`. Dispara aviso Telegram vía trigger `trg_carga_sin_control_telegram` (**AFTER INSERT** → 1 vez por NP/día). El monitor lo ignora. |
| `CCR` | Control Remito CR NP | (detalle de control CR, v3.69) | `texto` = `NP\|TANDA` (ej. `97754\|C47B`). Un evento por NP marcada como **controlada** en **Control Remitos (CR)** — paso **independiente** de la Carga Camión. id determinístico `ccr_<legajo>_<np>_<día>` + upsert. El NP sale **sólo de CR** (`fetchCCRData` lo resta de los facturados). ⚠ **NO alimenta RR** (RR lee `CCN`, no `CCR`). El monitor y las inconsistencias lo ignoran. Con el tiempo del toggle CR + los m³ sirve para medir productividad de CR (m³/h). |
| `MGX` | Guardado fuera de lista | (automático, v4.24) | `texto` = `COD\|G<góndola>\|E<excedente>`. Lo emite el MG (`mgEmitFueraLista`) cuando se guarda un código que **NO estaba en "Mercadería a guardar"** (botón "Guardarlo igual"; típico error de tipeo en recepción). id `mgx_<cod>_<legajo>_<ts>`. Dispara aviso Telegram vía trigger `trg_mg_fuera_lista_telegram` (**AFTER INSERT** WHEN `opcion='MGX'`). El monitor lo ignora. |
| `SSG` | Picking sin stock en góndola | (automático, v4.24) | `texto` = `TANDA\|COD:pedido>habia,…`. Lo emite `stockBajaPicking` al **TP** cuando se sacó de góndola **más de lo que el sistema tenía** (saldo `terminado` quedaría negativo). id determinístico `ssg_<legajo>_<tanda>_<día>` + upsert (1 aviso/tanda/día). Dispara aviso Telegram vía trigger `trg_picking_sin_stock_telegram` (**AFTER INSERT** WHEN `opcion='SSG'`). El monitor lo ignora. |
| `CP` | Completar Pedido | (detalle, v5.05) | `texto` = `NP\|COD\|QTY\|GONDOLA\|AGUARDAR\|LÍO`. Lo emite el modal `showCPModal` al sumar cajas que llegaron tarde a una NP armada sin facturar (mueve stock origen→`a_facturar`, baja `cajas_falto` en `Entregas_Virgilio`, re-emite el TAL). El monitor lo ignora. |
| `EA` | Entrega Artículos para envasar | (detalle, v5.52) | `texto` = `COD\|QTY` (ej. `440E\|30`). Lo emite el modal `showEAModal` (botonera operario) al dar de baja stock del depósito **`para_envasar`**: `stockMove` `para_envasar −qty` (`tipo='entrega_envasar'`), un evento por código. `para_envasar` está **fuera de los 7 depósitos** de `stockComputeSaldos` (no entra en totales/OC). El monitor lo ignora. |
| `RC` | Pasar cajas a un pedido urgente | (detalle, v5.49) | `texto` = `NP_URGENTE\|NP<donor> o T<tanda>\|COD\|QTY`. Lo emite el modal `showRCModal` al sacarle cajas a un pedido que sale después (armado o pickeado) y dárselas a uno urgente. Al confirmar: RPC `reasignar_cajas` (faltantes), `stockMove` tipo `rc` (donante `a_facturar`/`separar_pedidos −`, urgente `a_facturar +`), líos (suma al urgente, resta al donante armado). El monitor lo ignora. |

**Grupos (constantes en `index.html`):**
- `CORE_CODES = [EP, TP, AP, TAP]` — el trabajo medible (picking / armado).
- `TOGGLE_CODES = [CR, RR, CC, RT, MG, RI, EI, AT, PB, Limp, PC, Perm, CT]` — abren y cierran.
- `DEAD_TIME_CODES = [AT, PB, Limp, PC, CT]` — mientras están abiertos **bloquean todo**.
- `ALWAYS_ALLOWED_CODES = [PB, PC]` — nunca se bloquean.
- `CLOSE_NEEDS_INPUT_CODES = [CC, RT, RI, EI]` — piden dato al cerrar.
- `SURVIVING_TOGGLES = [CR, RR, MG]` — sobreviven la medianoche; el resto se autocierra.
- `AUTO_CLOSE_CODES = [AT, PB, Limp, PC, CT, Perm, CC, RT, RI, EI]` — se autocierran a las **17:00** (`WORKDAY_END_HOUR_AR = 17`) del día si quedaron abiertos.

### Continuar tarea al día siguiente (v2.44)

Al **Terminar Día**, por cada tarea abierta que sobrevive (Picking, Armado,
`CR`, `RR`, `MG`) el operario elige **Continúa mañana** o **Finalizar ahora**:
- **Continúa** → se marca `st.continuar[<tipo>] = <YYYY-MM-DD>` y la tarea se
  arrastra. Al día siguiente, `renderPendingSuggestion()` muestra un botón verde
  **"▶ Continuar [tarea]"**; al tocarlo se borra la marca, se dispara la
  evaluación de `LT`, y el cierre real se hace luego con `TP`/`TAP`/toggle.
- **Finalizar ahora** → cierra en el acto (Picking/Armado piden el dato de
  cierre y emiten `TP`/`TAP`; `CR`/`RR`/`MG` cierran el toggle) y limpia el estado.

### Llegada Tarde (`LT`, v2.44)

`LT` = minutos entre `hora_entrada` del empleado (`Empleados`) y el **primer
mensaje del día** del operario. Se evalúa en la primera acción del día
(`maybeRegisterLateArrival`): el primer reporte que envía **o** el botón
**"▶ Continuar [tarea]"**. Se registra **una** `LT` por día por legajo
(`client_id = lt_<legajo>_<día>`). Si no hay `hora_entrada`, o el primer mensaje
fue sin conexión, no se marca. El **tiempo de LT es no trabajado**: el monitor
lo excluye de horas/productividad (guard `opcion==="LT"` en
`fetchMonitorDayStats`, `showDayBreakdown` y `fetchProductivityData`).

---

## 5. Cómo se registran los eventos (semántica clave)

- **`ts_cliente`** = momento del evento. **`ts_inicio`** se completa **sólo cuando
  el evento es un cierre**. Entonces: **una fila con `ts_inicio` no nulo ES el
  cierre de una acción pareada**, y su duración = `ts_cliente − ts_inicio`.
- **Picking**: `EP` (abre, `ts_inicio` nulo) → `TP` (cierra, `ts_inicio` = apertura).
  Uno abierto por vez por legajo.
- **Armado**: `AP` (abre) → `TAP` (cierra). En el monitor la columna de armado se
  rotula **"Pedido Separado"** ("separado" = armado completo).
- **Toggles** (CR, CC, …): 1er toque abre (`ts_inicio` nulo), 2do toque cierra
  (`ts_inicio` = apertura). Son **mismo código** las dos veces.
- **`FJ` (Fin de Jornada)**: una sola fila por legajo/día (upsert por
  `client_id = fj_<legajo>_<día>`); `texto` guarda el JSON de conteos del día.
- Verificado en datos: `EP`/`AP`/`FJ` nunca traen `ts_inicio`; `TP`/`TAP` y los
  toggles lo traen ~la mitad de las filas (= sus cierres). No hay duraciones
  negativas (`ts_cliente < ts_inicio` = 0 casos).

---

## 6. Flujo de negocio

- **Tanda**: unidad de trabajo, un código de lote que el operario tipea en `texto`
  (ej. `C10B`, `C15A`, `A57B`; a veces numérico como `46112`). Viene de la
  programación del Google Sheet (filas con `Op = SI`).
- **NP**: número de pedido. Una tanda agrupa **uno o más NP**, cada uno con Razón
  Social y **m³** propios (se ven en el modal de detalle de tanda).
- **Camión**: se deriva del código de tanda (`tandaCamion()`): `C03A` y `C03B`
  → camión "03". El monitor agrupa por camión en "Total por día".
- **Secuencia esperada de un pedido/tanda**: `EP→TP` (picking) y `AP→TAP`
  (armado/separado); `CC` es la carga de camión (evento aparte).

---

## 7. De dónde salen los metros cúbicos (m³)

> **CRÍTICO (por defecto): los m³ NO están en Supabase.** Salen de un **Google
> Sheet**, así que no se pueden calcular desde un entorno sin acceso a Google
> (p. ej. el sandbox de Claude, que tiene Google fuera de la allowlist). La **app
> sí** los muestra porque corre en el navegador.
>
> **v2.80** prepara moverlos a Supabase (tablas `PPP_*`, flag `PPP_SOURCE`): una
> vez que la macro las cargó y el flag está activo, **el m³ se consulta por SQL**
> (§ 11). Ver `MIGRACION-SUPABASE-PPP.md`.

- Documento Sheet: `1-16YXe0xq6x9i-Yhk5cm5V3VqvQ0PWZtcDbm8OeeKW0`.
- **Histórico** (todos los pedidos entregados): hoja "PPP Excel Pedidos Entregados
  2026", `gid=2146771217`. Se mapea **`Tanda` → m³ sumando la columna `Mt3` (col G)**.
- **Programación diaria**: `gid=1947169223` (cols `Tanda`, `M3`, `Op`, `Fecha
  Entrega`, `N° NP`, `Razon Social`).
- **⚠ NO usar la columna H "Mt3 FC"**: pese al nombre, NO son m³ — son códigos
  chicos (zonas) que inflan los totales. **Sólo col G "Mt3".**
- Para resolver los m³ de una tanda: primero el sheet de programación, si no está,
  el histórico, si no, 0. `monitorParseM3` entiende coma decimal (`"0,289"` → 0.289).
- El monitor ya calcula y muestra **m³ de picking / m³ de armado / total / m³ por
  hora por operario** en el modal **"Rendimiento del día"** (`showDayBreakdown`).
- **v2.80 — m³ migrables a Supabase:** si `PPP_SOURCE` ≠ `"sheets"`, el m³ sale de
  `PPP_Programacion_Diaria.m3` / `PPP_Pedidos_Entregados.mt3` (numérico) en vez del
  Sheet → **se puede calcular por SQL** (§ 11). Por defecto sigue saliendo del Sheet;
  la carga la hace la macro (ver `MIGRACION-SUPABASE-PPP.md`).

---

## 8. Cómo se calculan horas / jornada

En `showDayBreakdown` (monitor, por operario por día):

- **Jornada** = `(FJ − ingreso) − comida`, donde `ingreso` viene de
  `Fichadas_Virgilio (tipo=ingreso)`, `FJ` del evento `FJ`, y `comida` = suma de
  duraciones de `PC` (cap de sanidad: sólo si `0 < dur < 8 h`).
- Como hoy casi no hay fichadas de ingreso, la jornada suele quedar incompleta.
  La métrica robusta y usada para reportes es **horas trabajadas = primera acción
  → `FJ` (o última acción si no hay FJ), menos la comida (`PC`)**.
- Zona horaria: **`America/Argentina/Buenos_Aires`, UTC-3 fijo** (Argentina no
  tiene horario de verano). Los límites de día son `T00:00:00-03:00` /
  `T23:59:59-03:00`.

---

## 9. Fichada / QR

> ⚠ **Hay DOS sistemas de fichada distintos** en este repo. No confundirlos:
>
> 1. **Fichada TOTP propia (legacy)** — §9.a abajo. Tablas `Fichadas_Virgilio` /
>    `Fichadas_Historico` en el schema `public`, token TOTP (`fichada-*.js`,
>    `fichada.html`). El QR lo muestra el monitor/TV de Virgilio.
> 2. **FichadaQR (repo `FichadaQRUbic`)** — schema aislado **`FichadaQR`**
>    (`fichadas` con `UNIQUE(correo,fecha)`, `tokens_usados`, `config`), token
>    **HMAC firmado por Edge Function** (`fichada-qr-emitir-token` /
>    `fichada-qr-fichar`), whitelist en **`planify.employees`**. El QR **rotativo**
>    lo muestra una **pantalla fija en el puesto** (`pantalla.html`). Es el que
>    usa el **gate de ingreso (v5.53)**: `goToOptions` → `fichadaGate` → RPC
>    `public.fichadaqr_ficho_hoy(email)` (lectura, `anon`) para saber si ya fichó,
>    y el lector de cámara in-app (`openFichadaScanner`, `BarcodeDetector`/`jsQR`)
>    manda `{token,email}` a `fichada-qr-fichar`. Ver la Nota v5.53 arriba.
>    El `esta_habilitado` valida el correo contra `planify.employees` (con caída
>    de respaldo a `FichadaQR.empleados`); el secreto de firma vive **solo** en
>    `FichadaQR.config` / la Edge Function, nunca en el navegador.

### 9.a Fichada TOTP propia (legacy — `Fichadas_Virgilio`)

- `fichada-config.js`: `hmacSecret`, `tokenPeriodSec = 30`, `tokenTolerance = 1`
  (acepta el bucket actual ±1). El secreto está en JS público → "disuasivo, no
  barrera criptográfica".
- `fichada-totp.js`: token = `<bucket>.<sig16hex>` con HMAC-SHA256 sobre
  `floor(now/1000/30)`; `verifyToken` con comparación de tiempo constante.
- El QR in-app **está habilitado** (`QR_DISABLED = false`, desde v1.52). El monitor/TV
  muestra el QR rotativo abajo-derecha (sólo con el monitor abierto). El operario lo
  escanea → abre `fichada.html?t=<token>` → pone su email → registra el **ingreso** en
  `Fichadas_Virgilio` (`tipo:"ingreso"`) + espejo a `Fichadas_Historico`
  (`evento:"Entrada"`). El legajo se resuelve por email contra `Empleados`; si el email
  no está cargado, igual ficha con `legajo=null` y el monitor lo marca "sin legajo".
  Flujo verificado: RLS deja al rol `anon` insertar en ambas tablas.
- `PC` y `FJ` se mandan desde la app principal y se espejan a `Fichadas_Historico`
  (`FJ→"Salida"`, `PC` abre→`"Comida Inicia"`, `PC` cierra→`"Comida Termina"`).

---

## 10. Versionado y cache

- `index.html`: `APP_VERSION = "v3.51"`. Badge en pantalla `#versionBadge`:
  `"v3.51 ✓"` (sin cola), `"v3.51 ⏳ N"` (pendientes), `"v3.51 ⚠ N"` (error).
  **Sirve para confirmar qué versión cargó cada pantalla** (mirá el badge en la TV
  para saber si está al día).
- `sw.js`: `SW_VERSION = "v3.47-vir"`. **No precachea nada**; el handler de `fetch`
  está vacío. Usa `skipWaiting()` + `clients.claim()`. La página hace
  `reg.update()` cada 60 s con `updateViaCache:"none"` (esto **sólo actualiza el
  SW**; NO recarga la app ni cambia lo que se ve en pantalla).
- Por eso, el problema de "la TV muestra una versión vieja" es **cache HTTP del
  navegador/TV**, no del SW: la TV vieja se queda pegada al `index.html` cacheado
  hasta que se la fuerza a bajar uno nuevo.
- **Cache-buster para refrescar una TV pegada (v2.47+):**
  - *Manual* (tipeado en el control remoto): agregar `?v=N` (o `&v=N`) a la URL —
    ej. `?monitor=tv&v=1`; la próxima vez subir el número (`v=2`, …). Otra URL =
    otra entrada de caché → baja el HTML fresco. La app **lee sólo `monitor`/`key`**,
    ignora `v`/`cb`, y tras cargar los **borra de la URL** con `history.replaceState`
    (`stripCacheBuster()` en `index.html`), así queda `?monitor=tv` limpio para el
    siguiente refresco. También se acepta `cb` por compatibilidad.
  - *Automático*: la ruta corta **`/monitor`** (`monitor/index.html`) redirige con
    `?monitor=tv&v=<timestamp>`, así esa entrada baja **siempre** el HTML fresco sin
    tipear nada. (Ojo: si `/monitor` ya quedó cacheado viejo en esa TV, forzarlo una
    vez con `/monitor?z` para bajar el redirect nuevo.)

---

## 11. Cómo responder preguntas con SQL (recetas validadas)

Usar MCP `execute_sql` con `project_id = hrxfctzncixxqmpfhskv`. Ventana de día en
hora Argentina: `ts_cliente >= 'YYYY-MM-DD 00:00:00-03'`.

**Horas trabajadas + pedidos por legajo (rango de días):**
```sql
with ev as (
  select nullif(trim(legajo),'') legajo,
         (ts_cliente at time zone 'America/Argentina/Buenos_Aires')::date dia,
         opcion, upper(trim(coalesce(texto,''))) tanda, ts_cliente, ts_inicio
  from "Registros_Produccion_Virgilio"
  where ts_cliente >= '2026-05-22 00:00:00-03' and ts_cliente < '2026-05-27 00:00:00-03'),
perday as (
  select legajo, dia, min(ts_cliente) first_ts, max(ts_cliente) last_ts,
    max(ts_cliente) filter (where opcion='FJ') fj_ts,
    coalesce(sum(extract(epoch from (ts_cliente-ts_inicio)))
      filter (where opcion='PC' and ts_inicio is not null and ts_cliente>ts_inicio
              and (ts_cliente-ts_inicio) < interval '8 hours'),0) comida_seg
  from ev where legajo is not null group by legajo, dia)
select legajo, count(*) dias,
  round(sum(extract(epoch from (coalesce(fj_ts,last_ts)-first_ts)) - comida_seg)/3600.0,2) horas
from perday group by legajo order by horas desc;
```

**Pedidos completados por día** (picking = `TP`, armado = `TAP`, distintos):
```sql
select (ts_cliente at time zone 'America/Argentina/Buenos_Aires')::date dia,
  count(distinct upper(trim(texto))) filter (where opcion='TP'  and trim(coalesce(texto,''))<>'') pickeados,
  count(distinct upper(trim(texto))) filter (where opcion='TAP' and trim(coalesce(texto,''))<>'') armados
from "Registros_Produccion_Virgilio"
where ts_cliente >= now() - interval '7 days' group by 1 order by 1;
```

**m³ por SQL:** por defecto **no** se puede (viven en el Sheet, § 7) → mirar el
monitor o exportar. **Desde v2.80**, si la macro ya cargó las tablas `PPP_*`, el m³
**sí** sale por SQL:
```sql
-- m³ por tanda (programación del día) — requiere PPP_Programacion_Diaria cargada
select upper(tanda) tanda, round(sum(m3)::numeric,3) m3
from "PPP_Programacion_Diaria" where coalesce(tanda,'')<>''
group by upper(tanda) order by 1;
-- m³ histórico por tanda
select upper(tanda) tanda, round(sum(mt3)::numeric,3) m3
from "PPP_Pedidos_Entregados" group by upper(tanda) order by 1;
```

**Notas de datos:** legajos `1` (= "Pruebas") y `0` son test/basura, excluirlos.
Operarios reales vistos recientemente: 104 (Jhonny Moncayo), 237 (Franco Ortiz),
8 (Farias Juan Hilario), 270 (Matias Insaurralde), 260 (Tomas Valdes), 94 (Isidro Tevez).

---

## 12. Reglas de inconsistencia (qué es "correcto" vs anómalo)

Una inconsistencia = lo que el operario registró no condice con cómo debería
operar el sistema. **Implementado (v1.47)** como la pestaña **Inconsistencias**
del monitor: selector de día (hoy + 6 anteriores), severidad **ALTA** (rojo) /
**media** (ámbar), badge con el conteo y auto-refresco cada 20 s. Excluye los
legajos test `0` y `1`. Reglas y umbrales (en `index.html`, sección "HOJA DE
INCONSISTENCIAS"):

**A. Tareas sin cerrar / duración absurda**
- `EP` sin su `TP` (mismo legajo/tanda/día) → picking sin cerrar.
- `AP` sin su `TAP` → armado sin cerrar.
- Toggle abierto sin cerrar al fin del día.
- Cierre con duración disparatada (visto: `TP` hasta ~65 h, `TAP` hasta ~121 h →
  se olvidaron de cerrar). Umbral sugerido: picking/armado > ~6–8 h.

**B. Secuencia inválida**
- `TP` sin `EP` previo / `TAP` sin `AP` previo (mismo legajo/tanda/día).
- Evento de producción con `ts_cliente` posterior al `FJ` del día.
- `FJ` duplicado en el día (no debería: usa upsert determinístico).
- Jornada con actividad pero **sin `FJ`** (día ya cerrado).

**C. Pedido inválido o duplicado**
- Código de tanda/pedido (`texto` de EP/TP/AP/TAP) que **no está en la planilla PPP**
  (la app ya lo detecta: banner "Tandas trabajadas que NO están en PPP — alguien se
  equivocó").
- Misma tanda completada (`TP` o `TAP`) por **dos legajos** distintos el mismo día.

**D. Tiempos anómalos**
- `PC` (comida) muy larga (> ~75 min) o **más de una** por día.
- Hueco de inactividad largo entre eventos (> ~60 min) dentro de la jornada.
- Jornada excesiva (> ~12 h).

---

## 12b. Sistema de alertas (tablero **Agentes** + **Telegram**)

> Construido principalmente 2026-06-27/28 (v4.57→v4.65). **Regla del usuario: todo lo que va por
> Telegram también aparece en Agentes** (Agentes = vista única de "qué mirar").

**Cómo funciona**
- **Telegram (inmediato)**: triggers/cron llaman `tg_enqueue(text, dedup, chat)` → tabla `telegram_outbox`
  → `tg_outbox_flush()` (lee el token de **Vault**, secreto `telegram_bot_token`; envía con pg_net). Chat
  default `-1004379879565`.
- **Agentes (panel, cada 2 h)**: cron jobid 14 corre `generar_reporte_agentes()` +
  `reporte_agentes_recepcion_absurda()` + `reporte_agentes_faltante_articulo()` → llena la tabla
  `reporte_agentes` (DELETE+INSERT). El front (`openAgentesAdmin`/`agtRender`, botón 🤖) la lee; arriba
  muestra el **briefing "📅 Hoy"** (nudge del día + to-do) y el **termómetro de estabilidad** (cuenta
  errores de operario en 7 días: error_envio/picking_sin_stock/carga_sin_control/mg_fuera_lista/error_app).
  Solo se muestran las categorías **con datos** (las vacías no aparecen).

**Las 19 categorías de `reporte_agentes`** (cada una = `categoria`; las con ⚡ también van a Telegram):

| categoría | qué | fuente | Telegram |
|---|---|---|---|
| `stock_negativo` | saldo imposible | `vista_saldos_stock` | ⚡ `check_stock_anomalias` (cron) |
| `excedente` | guardado a excedente (góndola llena) | `Movimientos_Stock` exc | ⚡ `trg_excedente_telegram` |
| `carga_sin_control` | CCN cargado al camión sin CRN >30 h | `Registros` CCN/CRN | ⚡ `trg_carga_sin_control` (evento CRA) |
| `mg_fuera_lista` | guardó código fuera de "a guardar" | `Registros` MGX | ⚡ `trg_mg_fuera_lista` |
| `picking_sin_stock` | sacó cajas sin stock | `Registros` SSG | ⚡ `trg_picking_sin_stock` |
| `sin_planimetria` | códigos sin sector (picking PSP + recepción RSP) | `Registros` PSP/RSP | ⚡ `trg_sin_planim` / `trg_recepcion_sin_planim` |
| `ppp_error` | errores de la PPP | `Registros` PPE | ⚡ `trg_ppp_error` |
| `falta_facturacion` | TAP sin facturar, entrega hoy/mañana | PPP+TAP+Facturacion_NP | ⚡ `notificar_falta_facturacion` (cron) |
| `recepcion_absurda` | recepción ≤0 o ≫ normal | `Movimientos_Stock` recep | ⚡ `trg_recepcion_absurda` |
| `faltante` | faltantes picking por tanda (7 d, rea<esp) | `Registros` PKC | ⚡ `trg_faltante` |
| `faltante_articulo` | qué artículos faltan más (30 d) — reposición | `Registros` PKC | — |
| `mg_pendiente` | mercadería en a_guardar sin subir a góndola >8 h | `Movimientos_Stock` | — |
| `armado_sin_terminar` | AP sin TAP >24 h | `Registros` AP/TAP | — |
| `pipeline_atascado` | separar_pedidos/a_facturar >2 d (*future*) | `Movimientos_Stock` | — |
| `excedente_estancado` | excedente sin mover >5 d (*future*) | `Movimientos_Stock` | — |
| `oc_baja` | OC <50% recibido | `Ordenes_Compra` | — |
| `error_app` | crashes JS de operarios (7 d) | `errores_cliente` | — |
| `error_envio` | envíos de operarios que fallaron (7 d) | `Auditoria_*` | — |
| `outbox` | Telegram trabado >15 min | `telegram_outbox` | ⚡ `notificar_outbox_salud` (cron) |

**Para agregar una alerta nueva**: (1) si la detecta el cliente → emitir un evento `Registros` con un
`opcion` nuevo + trigger `notificar_*` que llame `tg_enqueue`; (2) sumar la categoría a
`generar_reporte_agentes` (o a una función auxiliar encadenada en el cron 14 para no re-tipear la grande);
(3) agregar el `key` al array `CATS` de `agtRender` + su CSS `.stk-rep-cat.<key>`. **Siempre las dos vías**.

**Servicio Productividad / "Rendimiento de operarios"** (botón 📊, `openProductividad`/`prodRender`,
v4.67): dashboard de ingeniería industrial 100% Supabase. Lee `vista_productividad_semanal` (ver
`sql/productividad_operario.sql`) + `getEmpleadosNombres`. **KPI = m³/h por rol** (armador/picker, toggle
min/m³ con `_prodToggle`/`prodToggleVista`) sobre **tiempo efectivo** (unión de intervalos), tendencia,
sparkline, y **desglose de la jornada** (motivos de la ociosidad: productivo + secundarias + esperas). No
es alerta; es analítica de equipo. El módulo 📈 Análisis (que usa el Sheet) es OTRA cosa y sigue vivo.
**Premios (v4.82, solo esta pantalla admin)**: cada área tiene una **meta m³/h** editable (default Picking
1.6 · Armado 0.7, en `localStorage 'prod_metas'`); el premio % de cada operario = `(ritmo ÷ meta − 1) × 100`
con signo (badges verde/rojo en tarjetas + tabla). No se manda por Telegram. Nota técnica del motor: las
**interrupciones en el medio del envase** (carga, movimiento, comida, etc.) se **restan** del tiempo de la
tanda — se guardan como par open/close y el motor descuenta el `close` (la duración real).

---

## 13. Mantenimiento de esta guía

- **Actualizar este archivo cuando cambie el proyecto**: nuevos códigos de
  `opcion`, cambios de flujo, nuevas tablas/columnas, cambios en el origen de los
  m³, nueva versión, etc.
- Al subir una versión, actualizar `APP_VERSION` y `SW_VERSION` y la línea de
  versión del encabezado de esta guía.
- Si se agrega una pantalla/pestaña (p. ej. la **hoja de inconsistencias**),
  documentarla en § 2 y sus reglas en § 12.
