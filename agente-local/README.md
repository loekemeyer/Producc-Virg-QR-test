# Agente local — ingesta de NC de devoluciones (#31)

Corre en el **desktop** (el que tiene acceso a la carpeta de documentos). Vigila los
PDF, parsea los comprobantes (NC) y los sube a Supabase como **pendientes**; Marianela
después los confirma en la app.

## ⚠ Seguridad (importante)
- Usa una **secret key** de Supabase (`sb_secret_…`, acceso total → saltea RLS). Va
  **SOLO acá**, en una **variable de entorno**. **Nunca** en el repo, en `index.html`,
  ni pegada en ningún chat.
- **Crearla / rotarla** (dashboard nuevo): *Project Settings → API Keys → pestaña
  "Publishable and secret API keys" → Create new secret key* (se muestra UNA sola vez).
  Si se expone: crear una nueva, actualizar la variable de entorno y borrar la
  comprometida desde esa misma pestaña.
- La vieja `service_role` **legacy** (JWT `eyJ…`) quedó **deshabilitada** (pestaña
  *"Legacy anon, service_role API keys" → Disable JWT-based API keys*) — no usarla.
  ⚠ NO tocar "generate a new JWT secret": desloguea a todos los usuarios del proyecto.
- El archivo de estado (`nc_procesados.json`) y cualquier config local **no se commitean**
  (ver `.gitignore`).

## Instalación (una vez)
```bat
pip install pypdf requests
```

## Configurar y correr
```bat
set SUPABASE_URL=https://hrxfctzncixxqmpfhskv.supabase.co
set SUPABASE_SERVICE_KEY=<pegá acá la secret key sb_secret_...>
:: opcional, si los PDF están en Documentos compartidos/públicos:
:: set NC_BASE_DIR=C:\Users\Public\Documents
python nc_ingest.py
```
Por defecto mira la carpeta **Documentos del usuario que lo corre** (automático y por
usuario — resuelve la carpeta real del sistema vía el registro de Windows, maneja
OneDrive/redirección): `Documentos\PDF_ISIS` (Loeke) y `Documentos\PDF_ISISCHEF` (Chef).
Revisá cada 30 s; `Ctrl+C` para parar. Para que arranque solo, programalo con el
**Programador de tareas** de Windows (al iniciar sesión).

## Qué hace
1. Lista los `.pdf` de cada carpeta. Salta los que ya procesó (estado local).
2. Extrae el texto (`pypdf`) y parsea: tipo (compra/venta), número, fecha, contraparte,
   total e items (código + cajas). Normaliza el código (venta: saca la `L`; sin ceros
   a la izquierda).
3. **Upsert** a Supabase por REST con la service key, dedup por `huella`
   (`division|tipo|numero`) → re-procesar el mismo PDF **no duplica**.

## Ajuste fino
Las **regex de los items** dependen del layout exacto del PDF de ISIS. En `parse_nc()`
dejé el patrón para los 2 formatos vistos (Compra y Venta/Electrónica). Si algún campo
no cae, ajustá esas regex con tus PDF reales — el resto del agente (carpeta, dedup,
subida) no cambia. La estructura de campos está documentada en `../sql/nc_devoluciones.sql`.
