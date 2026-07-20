#!/usr/bin/env python3
# =====================================================================
#  nc_ingest.py — Agente LOCAL de ingesta de NC de devoluciones (#31)
#
#  Corre en el DESKTOP (tiene acceso al X:\). Cada POLL_SEG:
#    1) Lista los PDF de la(s) carpeta(s) compartida(s).
#    2) De cada PDF NUEVO: extrae el texto y parsea el comprobante (NC).
#    3) Lo sube a Supabase por REST con la SERVICE KEY (upsert por huella →
#       re-procesar el mismo PDF NO duplica).
#
#  "Nuevo" = doble candado: (a) archivo no visto antes (estado local
#  nc_procesados.json) y (b) upsert on_conflict=huella en Supabase.
#
#  ⚠ SEGURIDAD: la SERVICE KEY saltea RLS (acceso total). Va SOLO acá, en una
#  variable de entorno. NUNCA en el repo, ni en index.html, ni en el navegador.
#
#  Requisitos:  pip install pypdf requests
#  Correr:      set SUPABASE_URL=https://hrxfctzncixxqmpfhskv.supabase.co
#               set SUPABASE_SERVICE_KEY=<service_role key de Supabase>
#               python nc_ingest.py
#  (En Supabase la service_role key está en: Project Settings → API → service_role.)
# =====================================================================
import os, re, time, json, sys
import requests
from pypdf import PdfReader

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://hrxfctzncixxqmpfhskv.supabase.co").rstrip("/")
SERVICE_KEY  = os.environ.get("SUPABASE_SERVICE_KEY", "")
if not SERVICE_KEY:
    sys.exit("Falta SUPABASE_SERVICE_KEY (variable de entorno con la service_role key).")

# Carpeta "Documentos" del usuario que corre el agente — automático y POR USUARIO.
# Resuelve la carpeta REAL del sistema (maneja redirección / OneDrive) vía el registro
# de Windows (HKCU, así cada usuario usa la suya). Para forzar otra ruta, antes de
# correr poné:  set NC_BASE_DIR=D:\loQueSea
def documentos_dir():
    d = os.environ.get("NC_BASE_DIR")
    if d:
        return d
    if os.name == "nt":
        try:
            import winreg
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER,
                    r"Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders") as k:
                val, _ = winreg.QueryValueEx(k, "Personal")   # "Personal" = Documentos
                return os.path.expandvars(val)                # expande %USERPROFILE% etc.
        except Exception:
            pass
    return os.path.join(os.path.expanduser("~"), "Documents")

BASE_DIR = documentos_dir()
CARPETAS = [
    (os.path.join(BASE_DIR, "PDF_ISIS"),     "loeke"),
    (os.path.join(BASE_DIR, "PDF_ISISCHEF"), "chef"),
]
POLL_SEG   = 30
STATE_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "nc_procesados.json")
H = {"apikey": SERVICE_KEY, "Authorization": "Bearer " + SERVICE_KEY, "Content-Type": "application/json"}

# ---------- estado local (archivos ya procesados) ----------
def cargar_estado():
    try: return set(json.load(open(STATE_FILE, encoding="utf-8")))
    except Exception: return set()
def guardar_estado(s):
    json.dump(sorted(s), open(STATE_FILE, "w", encoding="utf-8"), ensure_ascii=False)

# ---------- texto del PDF ----------
def texto_pdf(path):
    txt = "\n".join((p.extract_text() or "") for p in PdfReader(path).pages)
    # Si vino vacío, el PDF puede ser una imagen escaneada → haría falta OCR
    # (pytesseract + pdf2image). La mayoría de las NC de ISIS traen texto.
    return txt

# ---------- normalización de código para stock ----------
def norm_cod(c, venta):
    c = str(c).upper().strip()
    if venta and c.endswith("L"): c = c[:-1]      # venta: 585EL -> 585E
    c = re.sub(r"^0+(?=.)", "", c)                # sin ceros a la izquierda
    return c

def _num(s):
    try: return float(str(s).replace(".", "").replace(",", ".")) if "," in str(s) else float(s)
    except Exception: return None

# ---------- parseo del comprobante ----------
# ⚠ Las regex de items dependen del layout exacto del PDF de ISIS. Dejé el patrón
#    para los 2 formatos que vi (Compra y Venta/Electrónica). Probá con tus PDF
#    reales y ajustá si algún campo no cae — el resto del agente NO cambia.
def parse_nc(texto, filename, division):
    up = (texto + " " + filename).upper()
    venta = ("ELECTR" in up) or ("NOTA DE CREDITO" in up and "COMPRA" not in up)
    tipo  = "venta" if venta else "compra"

    fecha = None
    m = re.search(r"Fecha[:\s]+(\d{2})/(\d{2})/(\d{4})", texto)
    if m: fecha = f"{m.group(3)}-{m.group(2)}-{m.group(1)}"

    # número del comprobante
    numero = ""
    if venta:
        m = re.search(r"N[º°]\s*([\d]{3,4}\s*-\s*[\d]{6,8})", texto)
        numero = re.sub(r"\s+", "", m.group(1)) if m else ""
    else:
        m = re.search(r"\b(\d{10,16})\b", texto)   # el nº largo de la NC de compra
        numero = m.group(1) if m else ""

    # contraparte (proveedor en compra, cliente en venta)
    contraparte = ""
    if venta:
        m = re.search(r"Cliente\s*N[º°]:\s*(\d+)", texto)
        m2 = re.search(r"\n\s*(\d{3,5}\s+[A-ZÁÉÍÓÚÑ][^\n]+)", texto)
        contraparte = (m.group(1) + " " if m else "") + (m2.group(1).strip() if m2 else "")
    else:
        m = re.search(r"(\d{3,5}\s+[A-ZÁÉÍÓÚÑ][^\n]+?)\s*Proveedor", texto)
        contraparte = m.group(1).strip() if m else ""

    total = None
    nums = re.findall(r"[\d.]+,\d{2}", texto)
    if nums: total = _num(nums[-1])   # heurística: el último importe grande = total

    items = []
    if venta:
        # "Descripción  Cant.Caja  ImporteTotal  $xUnidad  Cant.Unidad ... <COD>L"
        for ln in texto.splitlines():
            m = re.search(r"^(.+?)\s+(\d+)\s+([\d.]+,\d{2})\s+([\d.]+,\d{2})\s+([\d.]+)\s+[\d.]+\s+[\d.]+(\w+L)\s*$", ln.strip())
            if m:
                items.append({"cod_raw": m.group(6), "cod_art": norm_cod(m.group(6), True),
                              "descripcion": m.group(1).strip(), "cajas": _num(m.group(2)),
                              "unidades": _num(m.group(5)), "importe": _num(m.group(3))})
    else:
        # "caja <CANT.NN><COD> <desc>  <precio>  <importe>"
        for ln in texto.splitlines():
            m = re.search(r"caja\s+(\d+\.\d{2})([0-9]+[A-Z]*)\s+(.+?)\s+([\d.]+,\d{4})\s+([\d.]+,\d{2})\s*$", ln.strip())
            if m:
                items.append({"cod_raw": m.group(2), "cod_art": norm_cod(m.group(2), False),
                              "descripcion": m.group(3).strip(), "cajas": _num(m.group(1)),
                              "unidades": None, "importe": _num(m.group(5))})

    if not numero:   # sin número no hay huella confiable → no subir, avisar
        raise ValueError("no pude extraer el número del comprobante (revisar regex / layout)")
    header = {"division": division, "tipo": tipo, "numero": numero, "fecha": fecha,
              "contraparte": contraparte or None, "total": total,
              "stock_dir": "alta" if venta else "baja",   # default; Marianela confirma/ajusta
              "archivo": filename, "estado": "pendiente",
              "huella": "|".join([division, tipo, numero])}
    return header, items

# ---------- subida a Supabase (upsert header + reemplazo de items) ----------
def subir(header, items):
    r = requests.post(SUPABASE_URL + "/rest/v1/Comprobantes_NC?on_conflict=huella",
                      headers={**H, "Prefer": "resolution=merge-duplicates,return=representation"},
                      json=header, timeout=40)
    r.raise_for_status()
    nc_id = r.json()[0]["id"]
    requests.delete(SUPABASE_URL + f"/rest/v1/Comprobantes_NC_Items?nc_id=eq.{nc_id}", headers=H, timeout=40)
    if items:
        for it in items: it["nc_id"] = nc_id
        requests.post(SUPABASE_URL + "/rest/v1/Comprobantes_NC_Items",
                      headers={**H, "Prefer": "return=minimal"}, json=items, timeout=40).raise_for_status()
    return nc_id

def main():
    procesados = cargar_estado()
    print("nc_ingest: vigilando", [c[0] for c in CARPETAS], "cada", POLL_SEG, "s. Ctrl+C para parar.")
    while True:
        for carpeta, division in CARPETAS:
            if not os.path.isdir(carpeta): continue
            for f in sorted(os.listdir(carpeta)):
                if not f.lower().endswith(".pdf"): continue
                key = division + "/" + f
                if key in procesados: continue
                path = os.path.join(carpeta, f)
                try:
                    header, items = parse_nc(texto_pdf(path), f, division)
                    nc_id = subir(header, items)
                    procesados.add(key); guardar_estado(procesados)
                    print(f"  OK  {f}  →  NC #{nc_id}  ({header['tipo']}, {header['numero']}, {len(items)} items)")
                except Exception as e:
                    print(f"  ERR {f}: {e}")   # no lo marca como procesado → reintenta la próxima vuelta
        time.sleep(POLL_SEG)

if __name__ == "__main__":
    main()
