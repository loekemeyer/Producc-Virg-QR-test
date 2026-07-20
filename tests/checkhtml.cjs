/* Chequea la sintaxis de TODOS los <script> inline de index.html (lo que más
   rompe al editar un archivo de ~15k líneas). Sale con código 1 si hay errores. */
const fs = require("fs");
const vm = require("vm");
const path = require("path");
const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
let m, i = 0, bad = 0;
while ((m = re.exec(html))) {
  i++;
  try {
    new vm.Script(m[1], { filename: "inline-" + i + ".js" });
  } catch (e) {
    bad++;
    const before = html.slice(0, m.index).split("\n").length;
    console.log("SYNTAX ERROR en inline script #" + i + " (~línea " + before + "): " + e.message);
  }
}
console.log("checkhtml: " + i + " bloques <script> inline, " + bad + " con errores.");
process.exit(bad ? 1 : 0);
