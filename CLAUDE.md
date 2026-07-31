# CLAUDE.md — Producción Virgilio

App web (PWA, sin framework) para registrar producción de depósito (picking,
armado, carga de camión, recepción). La usan operarios desde el celular y
supervisores desde un monitor. Se sirve por GitHub Pages desde `main`.

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
