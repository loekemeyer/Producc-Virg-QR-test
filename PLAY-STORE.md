# Publicar Producción Virgilio en Google Play

Esta app es una **PWA** servida por GitHub Pages. Para subirla a Play Store la
empaquetamos como **TWA (Trusted Web Activity)**: una app Android mínima que
abre la PWA a pantalla completa, sin barra de navegador. No se reescribe nada;
la lógica sigue viviendo en la web y se actualiza sola al pushear a `main`.

Este repo ya quedó **listo para empaquetar**:

- `manifest.json` con íconos **PNG** 192/512 + maskable (Play los exige; el SVG
  solo no alcanza).
- `icons/` — íconos generados (incluye `play-store-icon-512.png` para la ficha).
- `twa-manifest.json` — configuración para **Bubblewrap** (nombre, colores,
  package id, URLs).
- `.well-known/assetlinks.json` — plantilla de Digital Asset Links (falta pegar
  la huella SHA-256, ver paso 4).
- `.gitignore` — evita subir el keystore (`*.keystore`) y los `.aab/.apk`.

Datos del empaquetado (definidos en `twa-manifest.json`):

| Campo | Valor |
|---|---|
| Package id (applicationId) | `io.github.loekemeyer.virgilio` |
| URL de inicio | `https://loekemeyer.github.io/Produccion-Virgilio/` |
| Host (origen) | `loekemeyer.github.io` |
| Nombre / launcher | Producción Virgilio / Virgilio |

> El **package id es para siempre**: una vez publicado en Play no se puede
> cambiar. Si preferís otro (p. ej. `com.tuempresa.virgilio`), cambialo en
> `twa-manifest.json` **y** en `.well-known/assetlinks.json` antes de empezar.

---

## Resumen del proceso

1. Generar el paquete Android (`.aab`) — **PWABuilder** (fácil) o **Bubblewrap** (CLI).
2. Crear la app en **Google Play Console** y subir el `.aab`.
3. Activar **Play App Signing** y copiar la huella **SHA-256**.
4. Pegar esa huella en `assetlinks.json` y **publicarlo en la raíz del origen**.
5. Completar la ficha (capturas, ícono, política de privacidad) y publicar.

El paso 4 es el más fácil de olvidar y, si falla, la app abre **con la barra del
navegador visible** en lugar de pantalla completa. Leelo con atención.

---

## 1) Generar el `.aab`

### Opción A — PWABuilder (recomendada, sin instalar nada)

1. Entrá a <https://www.pwabuilder.com>.
2. Pegá la URL: `https://loekemeyer.github.io/Produccion-Virgilio/` y dale
   analizar. Debería detectar manifest, service worker e íconos en verde.
3. **Package For Stores → Android → Google Play**.
4. En las opciones, asegurate de que coincidan con `twa-manifest.json`:
   - Package ID: `io.github.loekemeyer.virgilio`
   - App name: `Producción Virgilio`
   - Launcher name: `Virgilio`
   - Theme/Background color: `#1e6bd6` / `#ffffff`
5. Descargá el `.zip`. Adentro vienen:
   - `app-release-signed.aab` → esto subís a Play.
   - `signing.keystore` + `signing-key-info.txt` → **GUARDALOS Y NO LOS PIERDAS**
     (son tu clave de subida). Hacé backup fuera del repo.
   - `assetlinks.json` ya con tu huella → usalo en el paso 4.

### Opción B — Bubblewrap (CLI, control total)

Necesita Node 18+ y un JDK (el repo del entorno ya tiene Node 22 y JDK 21).

```bash
npm install -g @bubblewrap/cli

# Inicializar desde el manifest publicado (toma íconos, nombre, colores)
bubblewrap init --manifest https://loekemeyer.github.io/Produccion-Virgilio/manifest.json

# (o reusar la config ya versionada de este repo: copiá twa-manifest.json
#  al directorio del proyecto que crea Bubblewrap)

# Compilar el .aab (Bubblewrap baja el Android SDK la primera vez)
bubblewrap build
```

Si no tenés keystore, `bubblewrap build` te lo crea y te pide una contraseña.
**Guardá el `android.keystore` y la contraseña fuera del repo** — sin eso no
podés volver a publicar actualizaciones firmadas con la misma clave.

El resultado es `app-release-signed.aab`.

> El `.aab`, el `.keystore` y `node_modules/` están en `.gitignore`: no se
> commitean. La clave de firma es secreta y personal.

---

## 2) Crear la app en Play Console y subir el `.aab`

1. <https://play.google.com/console> (cuenta de desarrollador **ThomasLoke** —
   este nombre es el **editor** que se muestra en la ficha, no el package id) →
   **Crear app**.
   - Nombre: `Producción Virgilio`
   - Idioma: Español (Argentina)
   - App / Gratis.
2. Menú **Pruebas → Pruebas internas** → crear una versión → subí el `.aab`.
   (Conviene empezar por pruebas internas antes de Producción.)
3. Agregá tu mail como tester y probá la instalación en un celular real.

---

## 3) Activar Play App Signing y copiar la huella SHA-256

Al subir el primer `.aab`, Google activa **Play App Signing**: Google guarda la
clave real de firma y vos firmás con la "clave de subida". La huella que va en
`assetlinks.json` es la de **Google** (no la de tu keystore local).

1. Play Console → tu app → **Configuración → Integridad de la app**
   (*App integrity → App signing*).
2. Copiá la **huella del certificado SHA-256** de la *clave de firma de la app*.
   Es algo como `AB:CD:12:...` (32 bytes en hex).

---

## 4) Publicar `assetlinks.json` en la RAÍZ del origen ⚠️

Este es el paso crítico y tiene una particularidad por usar GitHub Pages de
proyecto.

El navegador busca el archivo **siempre en la raíz del dominio**:

```
https://loekemeyer.github.io/.well-known/assetlinks.json
```

**NO** en `…/Produccion-Virgilio/.well-known/…`. Como este repo se sirve bajo
`/Produccion-Virgilio/`, el archivo de este repo **no se publica en la raíz**.
Tenés que ponerlo en el sitio de usuario de GitHub Pages:

1. Si no existe, creá el repo **`loekemeyer.github.io`** (sitio de usuario, se
   sirve desde la raíz del dominio).
2. Dentro, creá el archivo `.well-known/assetlinks.json` con este contenido,
   pegando la huella del paso 3:

   ```json
   [
     {
       "relation": ["delegate_permission/common.handle_all_urls"],
       "target": {
         "namespace": "android_app",
         "package_name": "io.github.loekemeyer.virgilio",
         "sha256_cert_fingerprints": [
           "AB:CD:12:...:TU_HUELLA_SHA256"
         ]
       }
     }
   ]
   ```
3. Verificá que cargue en `https://loekemeyer.github.io/.well-known/assetlinks.json`.

> Alternativa: si en el futuro usás un **dominio propio** (CNAME) apuntando solo
> a esta app, el origen sería ese dominio y entonces el `.well-known/` de **este**
> repo (ya incluido) sí quedaría en la raíz. Con GitHub Pages de proyecto, usá
> el sitio de usuario como arriba.

La plantilla en `.well-known/assetlinks.json` de este repo queda como referencia
(y como respaldo para el caso del dominio propio); reemplazá
`REEMPLAZAR_CON_SHA256_DE_PLAY_APP_SIGNING` por la huella real.

Cómo comprobar que quedó bien: instalá la app desde Play (pruebas internas) y
abrila. Si abre **a pantalla completa sin barra de URL**, la verificación
funcionó. Si ves la barra del navegador, el `assetlinks.json` no está bien
publicado o la huella no coincide.

---

## 5) Completar la ficha y publicar

En **Crece → Presencia en la tienda → Ficha de Play Store principal**:

- **Ícono** (512×512): usá `icons/play-store-icon-512.png`.
- **Gráfico de funciones** (1024×500): hay que crearlo (banner simple con el logo).
- **Capturas de teléfono**: mínimo 2 (teléfono). Sacalas de la app corriendo.
- **Descripción corta y completa**: ej. "Registro de producción de depósito
  (picking, armado, carga y recepción) para operarios y supervisores."

Además, en **Política → Contenido de la app**, completá lo obligatorio:

- **Política de privacidad** (URL pública obligatoria). Si no tenés, hay que
  crear una página simple. La app guarda legajo y eventos de producción en
  Supabase y usa login de Google.
- **Seguridad de los datos** (Data safety): declarar que se recopilan datos de
  actividad de la app / identificador de usuario (legajo, email de Google) y que
  van cifrados en tránsito (HTTPS).
- **Clasificación de contenido**, **público objetivo**, **anuncios** (no tiene).

Cuando esté todo en verde: **Producción → crear versión → subir el `.aab` →
enviar a revisión**.

---

## Notas específicas de esta app

- **Internet obligatorio**: la app vive en GitHub Pages + Supabase. No es offline
  más allá de la cola de envíos (Background Sync) del Service Worker.
- **Login de Google**: funciona dentro del TWA porque corre sobre Chrome real.
- **Claves de Supabase**: las que están en `index.html`/`sw.js` son *publishable*
  (pensadas para el cliente), no hay secreto que exponer al empaquetar.
- **Versión**: mantené sincronizados `APP_VERSION` (en `index.html`),
  `SW_VERSION` (en `sw.js`) y `appVersionName/appVersionCode` en
  `twa-manifest.json`. Cada subida a Play necesita un `appVersionCode` **mayor**
  al anterior.
- **Actualizaciones de contenido**: como la UI es web, los cambios que pushees a
  `main` aparecen sin re-subir a Play. Solo volvés a generar y subir el `.aab`
  cuando cambian cosas del contenedor (nombre, ícono, package, permisos).
```
