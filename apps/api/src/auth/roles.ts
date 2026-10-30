// Guardas de sesión y de rol para las rutas (preHandler). Viven en oficina/acceso.ts desde OF1 (ADR-0024: la sesión de oficina
// exige además un aparato aprobado); aquí se reexportan para no cambiar los import de las rutas de siempre.
export { requiereConfirmacionReciente, requiereRol, requiereSesion } from "../oficina/acceso.ts";
