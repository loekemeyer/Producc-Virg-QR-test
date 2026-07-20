# Tests — Producción Virgilio

Smoke-tests para no romper el `index.html` (~15.000 líneas, todo en un archivo)
sin darse cuenta. **Correr antes de pushear** cambios a `index.html` / `sw.js`.

## Correr todo

```bash
bash tests/run.sh
```

Hace, en orden (corta al primer error):

1. **`node --check sw.js`** — sintaxis del service worker.
2. **`node tests/checkhtml.cjs`** — sintaxis de **todos** los `<script>` inline del
   `index.html` (es lo que más rompe: un paréntesis o coma de más tumba todo el
   script y deja la app en blanco). Sin dependencias, sólo Node.
3. **`node tests/smoke.cjs`** — abre el `index.html` headless con Playwright y
   verifica: (a) que las **funciones clave existen** (stock, picking, conteo,
   capacidad, % entregas, etc.), (b) que **no hay errores de página** al cargar,
   (c) un cálculo de `stockComputeSaldos`.

## Requisitos

- **Node 18+**.
- **Playwright** (sólo para el smoke):
  - En este entorno ya está en `/opt/node22/lib/node_modules/playwright` con
    `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers` (el runner lo setea solo).
  - En otra máquina: `npm i -D playwright && npx playwright install chromium`.
  - Si no está, el smoke sale con código 2 (los pasos 1 y 2 igual corren).

## Correr sueltos

```bash
node tests/checkhtml.cjs     # sólo sintaxis de los <script> inline (sin Playwright)
node --check sw.js           # sólo el service worker
node tests/smoke.cjs         # sólo el smoke (necesita Playwright)
```

> Nota: estos tests son para validar en el entorno de desarrollo. La app en sí se
> sirve por GitHub Pages (sin build ni runtime de Node).
