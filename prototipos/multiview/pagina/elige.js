// Carga la build del modo pedido (?modo=clasico|super|nuevo; por defecto clasico). Cada build trae su propio three: nunca dos en la misma página.
// Un módulo aparte (y no un <script> en línea) para que valga con una CSP que no deja scripts en línea, como la del servidor del gemelo.
const MODOS = ["clasico", "super", "nuevo"];
const m = /[?&]modo=([a-z]+)/.exec(location.search);
const modo = m && MODOS.includes(m[1]) ? m[1] : "clasico";
import("./" + modo + "/humo.js").catch(function (e) {
  document.getElementById("estado").textContent = "No se pudo cargar la build «" + modo + "»: " + e.message;
  console.error(e);
});
