// Lo común de los componentes «de todo mundo» (A3-6c, MU5-n): la VR y la locomoción (29_vr, 36_mandos, 09_camara, 12_paseo, 12b_llegada, 12c_ir_a, 34_movibles y 34b_palanca).
// No son del exterior: tienen que seguir al entrar en un interior (MUNDOS §3, «la locomoción es de todo mundo»). Viven en apps/web/src/mundos/comun/ y no en nucleo/ porque
// reciben del legado cosas de los mundos (el gestor gm, el panel de la finca, el DOM de la página) y nucleo/ es maquinaria sin nada de eso (MUNDOS §1); el legado los ve por
// el mismo alias que el exterior, «@gemelo/mundos» (Mundos.<x>). Un mundo (mundos/exterior/) no importa de aquí: dependency-cruiser trata comun/ como un paquete más.
import { ComponentesPuro } from "../../nucleo/componentes.ts";
import type { IdMundo } from "../../nucleo/mundos.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type T = any;

/**
 * «De todo mundo» en el manifiesto de un componente: la lista de TODOS los mundos que conoce el núcleo (ComponentesPuro.MUNDOS). Así sus fases corren en cualquier mundo
 * activo, se monta en cuanto haya uno cargado y solo se libera con el último (COMPONENTES §3.2, el campo `mundos`). Es una forma provisional de A3-6c: la tarea A3-6a define
 * a la vez cómo se declara un componente de todo mundo en el manifiesto; quien fusione igualará las dos (si allí sale un valor propio, basta con cambiar esta constante).
 */
export const TODO_MUNDO: IdMundo[] = ComponentesPuro.MUNDOS.slice();
