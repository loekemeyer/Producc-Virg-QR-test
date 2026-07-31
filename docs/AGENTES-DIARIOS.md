# Agentes diarios de Producción Virgilio

Loop autónomo en tres etapas. Todos los agentes del repo proponen desde su
especialidad, las ideas se **pre-desarrollan solas en su rama**, un curador decide
qué te llega, y vos confirmás por Telegram / chat con un **código de 4 dígitos**.

## Etapas

### 1. Cada 2 h — proponer + desarrollar en rama (`Ideas + ramas agentes Virgilio`)
Corren **todos** los agentes, cada uno en su especialidad:
`mejoras-virgilio`, `revisor-logica`, `auditor-consistencia`, `auditor-supabase`,
`guardian-stock`, `guardian-tests`, `revisor-render`, `keeper-guia`.

- Cada idea nueva → fila en `agente_propuestas` (`estado='pendiente'`).
- Hasta **5 ideas por corrida** se implementan y verifican (`node --check` + smoke
  headless) en su rama **`idea/<código>`** → quedan `estado='lista'` con `rama` seteada.
- **Nunca** se toca `main`. Si una idea no verifica, queda `pendiente` sin rama.

### 2. A las 8:00 AR — curar y avisar (`Curador Virgilio → Telegram`)
El `curador-telegram`, parado sobre el repo y sobre todo la **`GUIA-PROYECTO.md`**
(lo que pediste), revisa lo acumulado sin enviar:
- Descarta ruido, duplicados y lo que contradice la guía (`estado='descartada'` +
  `curador_nota`).
- Arma **una lista definitiva** (prioriza las `lista`, ya mergeables) y la manda por
  Telegram a tu **privado** con el bot `@Faltantes_Virgilio_bot`. Marca `enviado_en`.

### 3. Vos confirmás — merge directo a main
En **cualquier chat** de Claude sobre este repo:
- Escribís **`:`** → te muestra **todas las ideas creadas** como **checklist, de a 5**.
  Tildás las que querés.
- O decís el **número** (`hacé el 4837`).
- Cada idea aceptada se **mergea a `main` directamente** desde su rama `idea/<código>`
  (sin mostrar diff, salvo que lo pidas). Si todavía no tenía rama, se desarrolla en
  el momento y se mergea. Queda `estado='hecha'`.

## Tabla `agente_propuestas` (Supabase `hrxfctzncixxqmpfhskv`)
`codigo` (4 díg, PK) · `agente` · `titulo` · `detalle` · `impacto` · `esfuerzo` ·
`ubicacion` · `estado` (`pendiente`|`lista`|`aprobada`|`hecha`|`descartada`) ·
`rama` · `creado_en` · `desarrollada_en` · `enviado_en` · `curador_nota`.
RLS activa, sin acceso anon. Código libre: `select public.nuevo_codigo_propuesta();`

## Telegram
Reusa el bot `@Faltantes_Virgilio_bot` (token en Vault), manda al **privado**:
`select public.tg_enqueue('<msg>','<dedup>','<CHAT_ID_PRIVADO>','HTML');`
`select public.tg_outbox_flush();`

## Tareas programadas (Routines)
- `30 */2 * * *` (cada 2 h) → proponer + desarrollar en ramas. Sin Telegram.
- `0 11 * * *` (08:00 AR) → curador + envío de la lista definitiva.

## Mantenimiento
- Cambiar cadencia / horario: editar el cron de la Routine.
- Pausar: deshabilitar la/s Routine/s.
- Cambiar chat destino: actualizar `CHAT_ID_PRIVADO` en el prompt de la Routine de
  las 8:00 (el `chat_id` no es secreto; el token vive en el Vault).
- Limpiar ramas de ideas descartadas: `git push origin --delete idea/<código>`.
