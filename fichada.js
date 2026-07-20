/* =========================================================
   fichada.js — Ingreso Virgilio (Supabase)
   El QR es solo para ingreso. La fichada se manda a la tabla
   "Fichadas_Virgilio" en Supabase. Después, el monitor de Virgilio
   cruza el email contra la tabla "Empleados" para resolver legajo
   y calcular la jornada combinando con PC (Paré Comida) y FJ (Fin
   Jornada) que se envían desde la app principal.
   ========================================================= */
(function () {
  const cfg = window.FICHADA_CONFIG;
  const { verifyToken } = window.FichadaToken;

  const form = document.getElementById("fichada-form");
  const emailInput = document.getElementById("email-input");
  const rememberCb = document.getElementById("remember-email");
  const userEmailLbl = document.getElementById("user-email");
  const changeAccountBtn = document.getElementById("change-account");
  const submitBtn = document.getElementById("submit-btn");
  const clearBtn = document.getElementById("clear-btn");
  const statusEl = document.getElementById("form-status");
  const emailErr = document.getElementById("email-error");

  const params = new URLSearchParams(location.search);
  const token = params.get("t");

  const SUPABASE_URL = cfg.supabaseUrl;
  const SUPABASE_KEY = cfg.supabaseKey;
  const FICHADAS_ENDPOINT  = SUPABASE_URL + "/rest/v1/Fichadas_Virgilio";
  const HISTORICO_ENDPOINT = SUPABASE_URL + "/rest/v1/Fichadas_Historico";
  const EMPLEADOS_ENDPOINT = SUPABASE_URL + "/rest/v1/Empleados";

  init();

  async function init() {
    const ok =
      token &&
      (await verifyToken(
        token,
        cfg.hmacSecret,
        cfg.tokenPeriodSec,
        cfg.tokenTolerance
      ));
    if (!ok) {
      showInvalidToken();
      return;
    }
    setupEmailMemory();
    wireUp();
  }

  function showInvalidToken() {
    form.hidden = true;
    statusEl.dataset.state = "error";
    statusEl.classList.add("form-status--banner");
    statusEl.textContent = token
      ? "El código QR expiró. Volvé a escanear el QR de la pantalla de fichada."
      : "Esta página solo es accesible escaneando el QR de fichada de la sede.";
  }

  function setupEmailMemory() {
    const saved = localStorage.getItem("fichada.email");
    if (saved) {
      emailInput.value = saved;
      userEmailLbl.textContent = saved;
      rememberCb.checked = true;
    } else {
      userEmailLbl.textContent = "(sin correo)";
    }
    emailInput.addEventListener("input", () => {
      const v = emailInput.value.trim();
      userEmailLbl.textContent = v || "(sin correo)";
    });
    changeAccountBtn.addEventListener("click", () => {
      localStorage.removeItem("fichada.email");
      emailInput.value = "";
      userEmailLbl.textContent = "(sin correo)";
      rememberCb.checked = false;
      emailInput.focus();
    });
  }

  function wireUp() {
    form.addEventListener("submit", onSubmit);
    clearBtn.addEventListener("click", () => {
      form.reset();
      emailErr.hidden = true;
      statusEl.textContent = "";
      statusEl.removeAttribute("data-state");
    });
  }

  async function onSubmit(e) {
    e.preventDefault();
    emailErr.hidden = true;

    const email = emailInput.value.trim().toLowerCase();

    if (!isEmail(email)) {
      emailErr.hidden = false;
      emailInput.focus();
      return;
    }

    const stillValid = await verifyToken(
      token,
      cfg.hmacSecret,
      cfg.tokenPeriodSec,
      cfg.tokenTolerance
    );
    if (!stillValid) {
      statusEl.dataset.state = "error";
      statusEl.textContent =
        "El código QR expiró mientras llenabas el formulario. Escaneá uno nuevo.";
      return;
    }

    if (rememberCb.checked) {
      localStorage.setItem("fichada.email", email);
    } else {
      localStorage.removeItem("fichada.email");
    }

    submitBtn.disabled = true;
    statusEl.removeAttribute("data-state");
    statusEl.textContent = "Registrando ingreso...";

    try {
      // Antes de insertar, intento cruzar email -> legajo para que
      // quede guardado directamente en la fila de fichada. Si no
      // encuentra, igual registra el ingreso con legajo=null y el
      // monitor avisa al supervisor.
      let legajo = null;
      try {
        legajo = await lookupLegajoByEmail(email);
      } catch (_) {
        // Si falla el lookup (red flaky), seguimos igual y dejamos
        // legajo=null. Lo importante es no perder el ingreso.
        legajo = null;
      }

      // Doble write: Fichadas_Virgilio (tabla nativa del QR) +
      // Fichadas_Historico (tabla consolidada que mergea los eventos de
      // los operarios Virgilio con los del Google Form de las otras sedes).
      // Si falla el primero, fallamos toda la fichada (Supabase es la
      // fuente de verdad). El segundo es best-effort: si falla, igual
      // sigue, ya que el primero asegura el registro principal.
      const tsEvento = new Date();
      await submitFichadaToSupabase(email, legajo, tsEvento);
      submitToHistorico(email, legajo, "Entrada", tsEvento)
        .catch((e) => console.warn("[historico] entrada fallo:", e && e.message));

      statusEl.dataset.state = "ok";
      statusEl.textContent = legajo
        ? "Ingreso registrado (legajo " + legajo + ")."
        : "Ingreso registrado. Avisale al encargado si tu email no aparece linkeado.";
      resetAfterSuccess();
    } catch (err) {
      statusEl.dataset.state = "error";
      statusEl.textContent =
        "No se pudo registrar el ingreso. Reintenta en unos segundos.";
    } finally {
      submitBtn.disabled = false;
    }
  }

  async function lookupLegajoByEmail(email) {
    // Empleados tiene columna email y Legajo. Usamos ilike (case-insensitive)
    // para tolerar que el supervisor haya cargado el email con mayúsculas
    // diferentes a las que escribe el operario. ilike sin wildcards = match
    // exacto pero case-insensitive.
    const url =
      EMPLEADOS_ENDPOINT +
      "?email=ilike." +
      encodeURIComponent(email) +
      "&select=Legajo&limit=1";
    const res = await fetch(url, {
      method: "GET",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: "Bearer " + SUPABASE_KEY,
      },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return null;
    const leg = data[0].Legajo;
    return leg != null ? String(leg) : null;
  }

  async function submitFichadaToSupabase(email, legajo, tsEvento) {
    const clientId = makeClientId();
    const body = {
      client_id: clientId,
      email: email,
      legajo: legajo, // puede ser null si no se encontró
      tipo: "ingreso",
      ts_cliente: (tsEvento || new Date()).toISOString(),
      user_agent: navigator.userAgent || null,
    };

    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 12000);

    try {
      const res = await fetch(FICHADAS_ENDPOINT, {
        method: "POST",
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: "Bearer " + SUPABASE_KEY,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      clearTimeout(t);
      if (!res.ok && res.status !== 409) {
        throw new Error("server_" + res.status);
      }
    } catch (e) {
      clearTimeout(t);
      throw e;
    }
  }

  function makeClientId() {
    // Mismo formato que usa la app principal: ts + random base36.
    return (
      Date.now().toString(36) +
      "-" +
      Math.random().toString(36).slice(2, 10)
    );
  }

  // Mirror a la tabla consolidada Fichadas_Historico. Esa tabla concentra:
  //   - Eventos de los operarios Virgilio (insertados desde acá y desde la
  //     app principal: PC=Comida Inicia/Termina, FJ=Salida).
  //   - Importados del Google Sheet legacy (Pellegrini, Esnaola, Home
  //     Office, etc — históricamente y a futuro via sync).
  // De acá lee el monitor de fichadas. Por eso es importante que cada
  // evento del QR se replique acá ademas de Fichadas_Virgilio.
  //
  // El UNIQUE constraint (ts_evento, email, evento) en la tabla impide
  // duplicados si se reintenta — usamos Prefer: resolution=ignore-duplicates
  // para que sea idempotente (la 2da no falla, simplemente no inserta).
  async function submitToHistorico(email, legajo, evento, tsEvento) {
    const body = {
      ts_evento: (tsEvento || new Date()).toISOString(),
      evento:    evento,
      email:     email,
      legajo:    legajo
    };
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    try {
      const res = await fetch(HISTORICO_ENDPOINT, {
        method: "POST",
        headers: {
          apikey:          SUPABASE_KEY,
          Authorization:  "Bearer " + SUPABASE_KEY,
          "Content-Type": "application/json",
          Prefer:         "return=minimal,resolution=ignore-duplicates"
        },
        body: JSON.stringify(body),
        signal: ctrl.signal
      });
      clearTimeout(t);
      if (!res.ok && res.status !== 409) {
        throw new Error("historico_server_" + res.status);
      }
    } catch (e) {
      clearTimeout(t);
      throw e;
    }
  }

  function resetAfterSuccess() {
    form.reset();
    const saved = localStorage.getItem("fichada.email");
    if (saved) {
      emailInput.value = saved;
      rememberCb.checked = true;
      userEmailLbl.textContent = saved;
    } else {
      userEmailLbl.textContent = "(sin correo)";
    }
  }

  function isEmail(s) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
  }
})();
