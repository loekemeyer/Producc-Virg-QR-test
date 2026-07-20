// Configuracion del sistema de fichada con QR rotativo.
// El QR redirige a fichada.html con un token TOTP. El ingreso se
// registra en Supabase (tabla Fichadas_Virgilio). Las salidas y el
// almuerzo se reportan desde la app principal de Virgilio con los
// botones "Pare Comida" (PC) y "Finalizar Jornada" (FJ).
//
// Editar SOLO los valores marcados con TODO antes de desplegar.
window.FICHADA_CONFIG = {
  // ===== Supabase =====
  // Esta URL y key tienen que ser las mismas que usa index.html / sw.js.
  // La publishable key tiene permisos INSERT (RLS) sobre Fichadas_Virgilio
  // y SELECT sobre Empleados.
  supabaseUrl: "https://hrxfctzncixxqmpfhskv.supabase.co",
  supabaseKey: "sb_publishable_BqpAgZH6ty-9wft10_YMhw_0rcIPuWT",

  // ===== TOTP / QR =====
  // Secreto compartido entre index.html (genera el QR) y fichada.html
  // (verifica el token). ADVERTENCIA: este valor queda visible en el JS
  // publico de ambas paginas. Es disuasivo, no barrera criptografica.
  // Si lo cambias, las tokens generadas antes del deploy quedan
  // invalidadas durante la ventana de rotacion (30s default).
  hmacSecret: "5gzwxCtxT55dVUKV6y1nUpIsy3OnbpOaaha7DyLAlcGXNFzuBJHsRHTSklOSNj7",

  // Duracion de cada token en segundos. Mas corto = mas seguro, pero
  // exige relojes mas sincronizados entre TV y celulares.
  tokenPeriodSec: 30,

  // Cuantas ventanas hacia atras/adelante se aceptan (cubre desfasaje
  // chico de reloj). 1 = se acepta el bucket actual, el anterior y el
  // siguiente.
  tokenTolerance: 1,
};
