# CLAUDE.md — Producción Virgilio

App web (PWA, sin framework) para registrar producción de depósito (picking,
armado, carga de camión, recepción). La usan operarios desde el celular y
supervisores desde un monitor. Se sirve por GitHub Pages desde `main`.

## ⚠ REGLA: preguntar QUIÉN habla y dejar cada pedido como tarea en su Planify

**Vale para TODOS los repos** (LK, Gestión Virgilio, Planify y cualquiera nuevo: copiar este
bloque al `CLAUDE.md` del repo nuevo). Objetivo del dueño: que ninguna tarea quede a medio
hacer sin figurar en la agenda de alguien.

1. **Al empezar la sesión, preguntar quién está hablando** (antes de hacer nada):
   *"¿Quién sos? (Thomas, Marianela, Luis, Gastón, …)"*. Si el mensaje ya lo dice, no repreguntar.
2. **Cada pedido de trabajo se registra como tarea en el Planify de esa persona**, apenas se
   empieza, con nombre MUY resumido (≤ 60 caracteres) y una nota de 1–3 líneas con el
   contexto. Queda `done=false` hasta que se cierre (punto 4). Si la sesión termina sin
   cerrar, la tarea queda en la agenda: ése es el objetivo.
3. **Excepción del dueño:** Thomas Loekemeyer NO usa Planify. Sus pedidos se cargan en el
   Planify de **Tomás Beviglia (employee_id 20)** con el nombre antepuesto por **`Th `**
   (ej. `Th Fecha estimada de entrega por zona`).

**Dónde:** proyecto Supabase de Gestión Virgilio `hrxfctzncixxqmpfhskv`, schema `planify`.
Empleados activos con Planify (`planify.employees`): Marianela Becker **38**, Luis Rial Otero
**52**, Gastón Dalponte **61**, Tomás Beviglia **20**, Gonzalez Tomas 16, Elías Irace 1,
Nazareno Rodríguez 27, Angely Asuaje 22, Viviana Gauna 4, Alan Gonzalez 5, Diego Mollo 44,
Nora Heredia 33, Juan Cruz Karaygan 51, Pablo Martos 6, Martín Cornejo 34, Martín Pregelj 15,
Romina Maturano 55, Iván Meta 58, Jhonny Cartaya 46. Si el nombre no está, buscar:
`select id, nombre from planify.employees where activo and nombre ilike '%<apellido>%'`.

```sql
-- alta (al empezar el pedido)
insert into planify.tasks (name, type, prio, time, date, note, rec, done, assignment_type,
  employee_id, department_id, system_generated, broadcast, created_at, updated_at)
values ('<resumen ≤60>', 'tarea', 'normal', '09:00', to_char(now() at time zone
  'America/Argentina/Buenos_Aires', 'YYYY-MM-DD'), '<contexto 1-3 líneas> — cargado desde
  sesión de Claude', 'none', false, 'employee', <employee_id>, null, false, false, now(), now())
returning id;
-- cierre (cuando la persona la da por terminada)
update planify.tasks set done = true, updated_at = now() where id = <id>;
```

Avisar en el chat el `id` al crearla y al cerrarla. No crear tareas para preguntas o consultas
que se responden en el momento; sólo para pedidos que implican hacer algo.

4. **Cierre por criterio propio, no sólo por "listo".** Claude evalúa si el objetivo del
   pedido se cumplió (lo entregado funciona, está commiteado/aplicado, y no quedó ninguna
   parte del pedido sin hacer). Cuando lo considere cumplido, pregunta **"¿Falta algo más
   para dar por cerrada la tarea?"** — si la persona dice que no (o no pide nada más
   dentro de esa tarea), `done=true`. Si dice "listo" antes, también se cierra. Lo que se
   pidió y quedó a medias NO se cierra: se deja abierta con la nota actualizada
   ("queda pendiente: …").

5. **Alerta de inactividad (1 hora).** Si hay tareas abiertas de esta sesión y pasa una
   hora sin mensajes, Claude escribe: *"Te estoy registrando estas tareas pendientes:
   … ¿Querés continuar alguna o damos por cerrada la charla?"* Cómo: al terminar un turno
   con tareas abiertas, si la sesión tiene `send_later` (Claude Code web/remoto) o
   `ScheduleWakeup`, armar UN recordatorio a 60 min (borrar el anterior si existía); al
   dispararse, si sigue habiendo tareas abiertas, mandar la alerta; si no, no decir nada.
   En una sesión local sin esas herramientas no hay forma de despertarse sola: en ese
   caso, al cerrar cada turno con tareas abiertas, dejar la lista escrita en el chat.

6. **Propagar la regla a todo repo nuevo.** Si en una charla se agrega o se toca por
   primera vez un repo que NO tiene este bloque en su `CLAUDE.md` (se lo trae de referencia,
   se lo crea, o se le hace un cambio), copiarle este bloque entero (creando el `CLAUDE.md`
   si no existe) y commitearlo en ese repo, avisando en el chat. Así el dueño no tiene que
   pedirlo cada vez. Fuente canónica del bloque: `CLAUDE.md` de `loekemeyer/pagina-LK-copia`.

## ⚠ Antes de responder preguntas sobre datos o funcionamiento

**Leé `GUIA-PROYECTO.md`** (en la raíz del repo). Es la guía viva del proyecto:
modelo de datos, códigos de acción, flujo, de dónde salen los m³, cómo se calculan
las horas, recetas de SQL y reglas de inconsistencia. Respondé **basado en eso, no
inventes**.

**Mantené `GUIA-PROYECTO.md` actualizada** cuando cambie el código o los datos
(nuevos códigos `opcion`, tablas, flujo, versión, etc.).

## Quick-ref

- **Datos**: Supabase, proyecto `Control Partes Talleristas`, id
  `hrxfctzncixxqmpfhskv`. Consultar con la herramienta MCP `execute_sql`
  (`project_id = hrxfctzncixxqmpfhskv`).
- **Tabla central**: `Registros_Produccion_Virgilio` (log de eventos; `opcion` =
  código de acción, `texto` = código de tanda/pedido, `ts_inicio` no nulo = cierre).
- **m³ SÍ están en Supabase** (desde v5.33): `PPP_Programacion_Diaria.m3`,
  `PPP_Pedidos_Entregados.mt3` y la vista `vista_tanda_m3` — se calculan por SQL
  desde el sandbox. El **origen upstream** sigue siendo el Google Sheet
  "PPP Pedidos Entregados 2026" (col `Mt3`, NO col H ni "Mt3 FC"), que se espeja
  vía Apps Script (`sync-ppp-supabase.gs`).
- **Zona horaria**: `America/Argentina/Buenos_Aires`, UTC-3 fijo.
- **Versión**: `APP_VERSION` en `index.html` y `SW_VERSION` en `sw.js`.
- Legajos `0` y `1` (Pruebas) son test/basura: excluir de reportes.

## Estructura: dos apps en un repo (Virgilio + Cervantes + selector)

Este repo junta **las dos plantas** (reemplaza al viejo repo `App-Produccion`, que se
borró). Layout:

- **Raíz** → app **Virgilio** (sin cambios; la usa también la app de Play Store/TWA).
- **`/cervantes/`** → **copia** de la app Cervantes (repo fuente `Registro-Produccion-2.0`).
- **`/selector/`** → pantalla **"¿Dónde vas a trabajar hoy?"** que linkea a ambas:
  Virgilio `../` y Cervantes `../cervantes/`. Recuerda la última planta usada
  (`localStorage` `appprod_ultima_planta`, marca "Última vez"), **no redirige solo**.
- Botón **"← Cambiar planta"** en la pantalla inicial de cada app → va al `selector/`.
- `selector/sw.js` y `cervantes/sw.js` no cachean (mismo patrón que Virgilio). Las dos
  apps conviven sin pisarse: tablas Supabase distintas (`Registros_Produccion_Virgilio`
  vs `Registros Produccion Cervantes`), IndexedDB y claves `localStorage` con prefijos
  distintos. Cervantes usa rutas relativas y SW con scope `/cervantes/`.
- **Entrada por defecto = Virgilio (raíz)**, no el selector (para no romper la URL
  actual ni la app de Play Store). Si se quisiera el selector como entrada, mover el
  selector a la raíz y Virgilio a `/virgilio/` (revisar TWA).
- ⚠ **`/cervantes/` es una copia**: si Cervantes cambia en `Registro-Produccion-2.0`,
  hay que **re-traer** los archivos (`app.js`, `index.html`, `manifest.json`,
  `styles.css`, `sw.js`) y volver a poner el botón "Cambiar planta" **y el gate de
  sesión** (`cervGate`). Último sync desde `Registro-Produccion-2.0` **v1.8.64**
  (incluye el gate de fichada de ingreso; rama `claude/qr-fichada-virgilio-ccrq9m`).

## Agentes diarios + código de 4 dígitos (Telegram)

Loop de tres etapas (tareas programadas, sesión nueva). Detalle en `docs/AGENTES-DIARIOS.md`.

- **Cada 2 h — TODOS los agentes proponen (cada uno en su especialidad) y las
  ideas se desarrollan solas en su rama.** Participan `mejoras-virgilio`,
  `revisor-logica`, `auditor-consistencia`, `auditor-supabase`, `guardian-stock`,
  `guardian-tests`, `revisor-render` y `keeper-guia`. Cada idea nueva entra a
  `agente_propuestas` (`estado='pendiente'`) y, hasta 5 por corrida, se implementa
  y verifica en su rama **`idea/<código>`** (queda `estado='lista'`, `rama` seteada).
  **Nunca** se toca `main`.
- **A las 8:00 AR — el `curador-telegram` decide qué te llega.** Parado sobre el
  repo y sobre todo la `GUIA-PROYECTO.md` (lo que pidió el usuario), revisa lo
  acumulado sin enviar, **descarta ruido/duplicados/lo que contradice la guía**,
  arma **una lista definitiva** y la manda por Telegram al privado del usuario
  (bot `@Faltantes_Virgilio_bot`). Marca enviadas (`enviado_en=now()`) y
  descartadas (`estado='descartada'` + `curador_nota`).

Cada propuesta tiene un **código de 4 dígitos** único.

### ⚠ Reglas para CUALQUIER chat sobre este repo

**Comando `:`** — si el usuario escribe un mensaje que es (o empieza con) `:`,
mostrale **todas las ideas creadas** como **checklist, de a 5** (paginá de 5 en 5),
para que marque cuáles confirma. Traelas así:

```sql
select codigo, estado, agente, impacto, titulo, rama
from public.agente_propuestas
where estado in ('pendiente','lista') order by creado_en desc;
```

Mostralas como `[ ] 4837 · [logica·alto] Título (rama idea/4837)`. El usuario
tilda las que quiere → tratá cada tildada como "idea aceptada" (regla de abajo).

**Idea escrita por el usuario** — cuando el usuario escriba una idea/mejora/pedido
en el chat (aunque no dé ningún número), **registrala para que no se pierda**:

1. `select public.nuevo_codigo_propuesta();` para el código.
2. `insert into public.agente_propuestas (codigo, agente, titulo, detalle, estado)
   values ('<cod>','usuario','<título corto>','<lo que pidió, textual>','pendiente');`
3. Agregá una línea ARRIBA en `docs/IDEAS-USUARIO.md`:
   `- [ ] **<cod>** (AAAA-MM-DD) — <idea> — _pendiente_`, y commiteá/pusheá a `main`.
4. Confirmale al usuario: "Anotada como **<cod>**" (así puede activarla después por número).

Las ideas del usuario tienen **prioridad**: el loop de cada 2 h las desarrolla primero
y el curador de las 8 las **incluye todos los días hasta que el usuario las active o
descarte** (no se marcan como enviadas de forma permanente).

**Idea aceptada (por número o tildada en el checklist)** — cuando el usuario diga
un **código de 4 dígitos** (`4837`, "hacé el 4837", "acepto 4837") o tilde ideas
en el checklist, por cada código aceptado **mergealo a `main` directamente**:

1. `select codigo, titulo, estado, rama from public.agente_propuestas where codigo='4837';`
2. Si `estado='lista'` y tiene `rama`: `git fetch origin && git checkout main &&
   git pull origin main && git merge --no-ff origin/idea/4837 && git push origin main`.
   Si hay conflicto por drift de main, resolvé o rebasá la rama sobre main y reintentá.
3. Si `estado='pendiente'` (todavía sin rama): desarrollala vos ahora en `idea/4837`,
   verificá (`node --check` + smoke headless), y mergeala a main igual.
4. Marcá `update public.agente_propuestas set estado='hecha', actualizado_en=now()
   where codigo='4837';`. Si el usuario la rechaza → `estado='descartada'`.
   Si es idea del usuario (`agente='usuario'`), además actualizá su línea en
   `docs/IDEAS-USUARIO.md` (`[x]` si hecha, `~~tachada~~` si descartada) y commiteá a `main`.

El merge a `main` es **directo, sin mostrar diff** (así lo pidió el usuario), salvo
que en el momento pida verlo.

## Git

- **Este es un repo de PRUEBA** (`tv-v`), espejo de Producción Virgilio. Trabajar
  **directo en `main`**: commitear y pushear ahí sin preguntar.
- Estilo de commits: `vX.YZ: descripción` cuando hay bump de versión.

## REGLA: auditar en Supabase cada problema del repo y su solucion

**Vale para TODOS los repos** (igual que la regla de Planify: copiar este bloque al `CLAUDE.md`
de cualquier repo nuevo). Objetivo: que cada error que tuvo un repositorio quede con su causa,
su correccion y el/los commits donde se arreglo, para no volver a pisar el mismo pozo.

**Donde:** proyecto Supabase `hrxfctzncixxqmpfhskv`, schema `github_repo_problemas`.
Se escribe con el MCP de Supabase (`execute_sql`), no con la anon key.

### Que se audita y que NO

Regla corta: **si ya estaba pusheado y andaba mal, se audita.** Si es trabajo nuevo, no.

| Se registra | NO se registra |
|---|---|
| Bug en codigo ya pusheado que llego al usuario | Feature nueva o pedido de cambio |
| Dato corrupto o mal migrado en la base | Refactor pedido por el usuario |
| Config o credencial rota o filtrada | Bug que introducis y arreglas antes de pushear |
| Performance degradada, query que no escala | Duda o consulta que se responde en el momento |
| Tabla derivada desincronizada de su madre | Ajuste de estilo o texto |

### Cuando

1. **Al detectar el problema** (antes de tocar nada): `registrar_problema` devuelve el id.
2. **Al pushear el fix**: `cerrar_problema` con el sha del commit.
3. **Si el fix necesita mas commits**: `agregar_commit` por cada uno. Un problema puede tener N
   commits; NO abrir un problema nuevo por el segundo pase del mismo fix.
4. Una sesion de Claude puede abarcar **varios** problemas: `sesion_id` no es unico.

### SQL

```sql
-- 1) al detectar
select github_repo_problemas.registrar_problema(
  p_repo          => 'owner/repo',            -- en minuscula
  p_titulo        => '<sintoma en <=120 chars>',
  p_descripcion   => '<que se rompio y como se manifesto>',
  p_categoria     => 'bug',                   -- bug|datos|seguridad|performance|config|ux|deuda_tecnica|documentacion
  p_severidad     => 'alto',                  -- critico|alto|medio|bajo
  p_modulo        => 'Carpeta/Modulo',
  p_archivos      => array['ruta/relativa.html'],
  p_sesion_id     => '<id de la sesion de Claude>',
  p_detectado_por => '<usuario> (claude-remote)',
  p_detectado_en  => now()                    -- fecha REAL si es carga historica
);

-- 2) al pushear el fix
select github_repo_problemas.cerrar_problema(
  p_id            => <id>,
  p_correccion    => '<que se cambio>',
  p_commit_sha    => '<sha corto>',
  p_branch        => '<branch>',
  p_commit_url    => 'https://github.com/owner/repo/commit/<sha>',
  p_causa_raiz    => '<por que paso, no que paso>',
  p_corregido_por => '<usuario> (claude-remote)',
  p_mensaje       => '<subject del commit>'
);

-- 3) commits extra del mismo problema
select github_repo_problemas.agregar_commit(<id>, '<sha>', '<branch>', '<url>', '<mensaje>', '<autor>');

-- lectura
select * from github_repo_problemas.v_problemas order by detectado_en desc;
```

**Avisar en el chat el titulo del problema** al registrarlo y al cerrarlo, no el numero de id
(mismo criterio que Planify).

**Si el problema se detecta pero NO se arregla, queda en `estado='abierto'`.** Ese es el punto:
que quede anotado. Estados: `abierto` | `en_curso` | `corregido` | `no_corregible` | `descartado`.
Para pasar a `corregido` la base exige `correccion` y `corregido_en` cargados (constraint).

**La auditoria no se borra.** El rol `anon` tiene SELECT/INSERT/UPDATE pero NO DELETE ni
TRUNCATE en las tres tablas. Si una fila esta mal, se corrige o se pasa a `descartado`.

## REGLA: claves de Supabase - migrar a las nuevas, NO apagar las legacy todavia

Estado al 2026-09-11. Supabase cambio el sistema de claves. Conviven dos juegos y **los dos
funcionan a la vez**, asi que se migra cliente por cliente sin downtime.

| Sistema | Claves | Se rota de a una |
|---|---|---|
| Nuevo | `sb_publishable_...` (frontend) + `sb_secret_...` (backend) | si |
| Legacy (JWT) | `anon` + `service_role` | NO: las dos derivan del JWT secret del proyecto |

Doc: `supabase.com/docs/guides/getting-started/migrating-to-new-api-keys`. Textual: *"The
legacy anon and service_role keys are based on your project's JWT secret, which makes them
hard to rotate without downtime."* **No existe boton "Roll" para las legacy.**

### 1. Lo filtrado vive en el HISTORIAL de git, y el historial no se arregla

Una `service_role` legacy quedo expuesta en el historial de un repo publico (ver `LOCKS.txt`
de `GestionProductivaEntero`, entrada 2026-09-04). El arbol de trabajo ya esta limpio, pero
eso no alcanza: lo que estuvo en un repo publico pudo clonarlo cualquiera y reescribir el
historial NO lo des-filtra. **El unico arreglo real es invalidar la clave.**

Precision importante: lo que se filtro es la **`service_role` key** (un JWT firmado con el
secret), NO el JWT secret. De un HS256 no se deriva la clave, asi que **apagar las legacy
alcanza** para matar lo filtrado. Rotar el JWT secret es un paso extra, no el obligatorio.

### 2. Como se invalida (y por que todavia no)

Dashboard -> Settings -> API Keys -> pestana **"Legacy anon, service_role API keys"** ->
boton **`Disable JWT-based API keys`**. Apaga `anon` y `service_role` de una sola vez. Es
reversible. Es lo que la doc pide para este caso: *"Make sure you also switch to publishable
and secret API keys and disable the anon and service_role keys."*

**NO apretarlo todavia:** apaga TAMBIEN la `anon`, que es la que usa el frontend. Hoy eso
tira abajo la app entera.

### 3. EXCEPCION MEDIDA: Storage rechaza las claves nuevas al ESCRIBIR

Comprobado en vivo el 2026-09-11 contra los dos proyectos (hrxfctzncixxqmpfhskv y
kwkclwhmoygunqmlegrg). El Storage API de estos proyectos NO entiende el formato nuevo
cuando la operacion escribe:

| Operacion | Clave legacy (JWT) | Clave nueva (`sb_publishable_` / `sb_secret_`) |
|---|---|---|
| `GET /storage/v1/object/...` | anda | anda |
| `POST /storage/v1/object/...` (upload) | anda | **403 `Invalid Compact JWS` / AccessDenied** |
| `POST /rest/v1/rpc/...` (PostgREST) | anda | anda |
| Edge Functions con `verify_jwt` | anda | anda |

`Invalid Compact JWS` = el Storage intento parsear el token como JWT y no pudo. No es la
clave equivocada ni un permiso faltante: el servicio no soporta el formato. Repro exacta:

```sql
select r.status, r.content from public.http((
  'POST','https://<ref>.supabase.co/storage/v1/object/__no_existe__/x.txt',
  array[public.http_header('Authorization','Bearer <clave>')],
  'text/plain','x')::public.http_request) r;
```

**Consecuencia:** cualquier cosa que SUBA a Storage tiene que seguir con la
`service_role` legacy hasta que Supabase actualice el Storage de estos proyectos. Caso
real: el workflow `build-deploy.yml` de `loekemeyer/Planify` sube el `Planify.exe` a
`planify_updates`; al cambiarle el secret `SUPABASE_SERVICE_KEY` por una `sb_secret_`
empezo a fallar el paso "Upload to Supabase Storage" en 2 segundos, con el `.exe` ya
compilado (runs 112 a 115 del 2026-09-11).

**Antes de apagar las legacy, buscar todo lo que escriba en Storage** (`storage/v1/object`
con POST/PUT, `.storage.from(...).upload(`, `.upload(`) y confirmar que ese camino sigue
andando. Si no anda, NO se apagan las legacy todavia.

### Orden obligatorio

1. Contar donde esta escrita la clave legacy en este repo:
   ```
   grep -rl 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9' . --exclude-dir=.git | wc -l
   ```
   (Referencia: `GestionProductivaEntero` tenia 66 archivos y 0 con la clave nueva.)
2. Reemplazar esa cadena por la `sb_publishable_...` del proyecto Supabase de ESTE repo
   (cada proyecto tiene la suya; no mezclar).
3. Migrar todo backend que use `service_role` (Edge Functions, n8n, scripts) a `sb_secret_...`.
4. Inventariar lo que escribe en Storage (ver la excepcion de arriba) y dejarlo con la
   `service_role` legacy; si algo de eso ya se paso a `sb_secret_`, volverlo atras.
5. Recien con 1-4 hechos en TODOS los repos que peguen contra ese proyecto:
   `Disable JWT-based API keys`. Mientras exista un upload a Storage vivo, este paso
   queda bloqueado.

### Paso opcional: rotar el JWT secret

Sirve si ademas se sospecha del secret en si. Va en **Settings -> JWT Keys**
(`/dashboard/project/_/settings/jwt`), NO en la pagina de API Keys:

1. `Migrate JWT secret` - importa el secret viejo y crea una clave asimetrica standby. Sin downtime.
2. `Rotate keys` - la standby firma los JWT nuevos. NO desloguea a nadie: los tokens no
   vencidos se siguen aceptando.
3. Revocar el secret legacy, que queda en *Previously used*.

Dos avisos de la doc antes del paso 2:
- *"Make sure your app does not directly rely on the legacy JWT secret. If it's verifying every
  JWT against the legacy JWT secret (using a library like jose, jsonwebtoken or similar),
  continuing with the rotation might break those components."*
- *"If you're using Edge Functions that have the Verify JWT setting, continuing with the
  rotation might break your app. You will need to turn off this setting."*

Cuando revocar: esperar el tiempo de expiracion del access token + 15 min (1 h 15 min si es de
1 h) para no desloguear a nadie; en un incidente activo, revocar de inmediato.

**Al tocar cualquier archivo con una clave de Supabase, dejarlo en el sistema nuevo. Nunca
escribir codigo nuevo con la clave legacy.**
