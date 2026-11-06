// El tipo común de los componentes «de todo mundo» (A3-6c, MU5-n): la VR y la locomoción (29_vr, 36_mandos, 09_camara, 12_paseo, 12b_llegada, 12c_ir_a, 34_movibles y 34b_palanca).
// No son del exterior: tienen que seguir al entrar en un interior (MUNDOS §3, «la locomoción es de todo mundo»). Viven en apps/web/src/mundos/comun/ y no en nucleo/ porque
// reciben del legado cosas de los mundos (el gestor gm, el panel de la finca, el DOM de la página) y nucleo/ es maquinaria sin nada de eso (MUNDOS §1); el legado los ve por
// el mismo alias que el exterior, «@gemelo/mundos» (Mundos.<x>). Un mundo (mundos/exterior/) no importa de aquí: dependency-cruiser trata comun/ como un paquete más.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type T = any;
