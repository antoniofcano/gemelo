# ADR-0025 — Avatares por piezas: contrato `avatares` v2 y receta

- **Estado:** Aceptado (decisiones 127-135 y 141 de Antonio, 2026-10-30)
- **Fecha:** 2026-10-30

## Contexto
[ADR-0020](0020-avatares-vrm.md) §2 decidió un **catálogo cerrado de 6-12 avatares VRM** ya hechos: cada persona elige uno y su id viaja en los metadatos de presencia (`avatar.vrm`). Para la familia ([AVATARES-FAMILIA](../sistema/AVATARES-FAMILIA.md)) eso no basta: 12 personajes cerrados empujan a elegir «el chico» o «la chica» (criterio C8) y nadie se hace a sí mismo. Antonio decidió (2026-10-30):
- **127** muñeco teñido ya (AV2, hecho) y **creador por piezas** después;
- **128** las piezas se montan **en la tubería**, con un repertorio fijo; **el color (piel, pelo, ropa) en el motor**;
- **129-130** cuerpo base MakeHuman/MPFB (CC0) generado por un agente con Blender (AV3, hecho: 12 cuerpos, 4 edades × 3 complexiones, sin parámetro de sexo);
- **132** los peques se diseñan y **no se ofrecen** hasta reabrir la decisión 45;
- **135** ADR y contrato `avatares` v2 al empezar el creador (este);
- **141** visto bueno a los cuerpos, con dos arreglos (costura del cuello, «mayor» que se distinga de «adulta»).

Restricciones: la pose v1 no cambia (contrato [presencia](../../contratos/presencia.md)); los metadatos viajan una vez por participante en el token de LiveKit (cuanto más cortos, mejor); el motor no hace `fetch` a otros hosts; un cliente de antes no puede romperse; el Quest dibuja 3 VRM a la vez como mucho (ADR-0020 §5).

## Decisión
**El catálogo pasa a v2: `cuerpos[]` (edad, complexión, `ofrecer`), `piezas[]` (pelo, vello, ropa, accesorio) y `paletas` (piel 10, ropa 10, pelo). Cada cuerpo es UN VRM que ya trae dentro todas sus piezas, ajustadas a él y con su mismo esqueleto; el motor enseña solo las de la receta y tiñe por nombre de material. La elección de cada persona es una receta corta (< 200 bytes) en el `avatar` de los metadatos de presencia.**

1. **Un VRM por cuerpo con las piezas dentro** (el «repertorio fijo» de la decisión 128 llevado al extremo: la combinación se elige con la visibilidad, no con ficheros). Cada pieza es una malla con nombre propio (`pieza.<id>`) pesada al esqueleto del cuerpo, hecha por el mismo guion que el cuerpo (`tuberia/avatares/creador/cuerpos.py`) y por tanto ajustada a esa cabeza y ese tronco. El motor oculta las mallas de las piezas que no lleva la receta: lo oculto **no se dibuja ni se sube a la GPU** (three sube la geometría al primer dibujo).
2. **Tinte por nombre de material**, sin texturas: `piel` ← tono, `ropa_base` (y la parte de arriba de la ropa) ← color de arriba, `ropa_abajo` ← color de abajo, `pelo` (pelo y vello) ← color de pelo. Paletas iguales a las del muñeco (`Aspecto` de `26_presencia.js`): de lejos y de cerca, los mismos colores (C13).
3. **Receta** = campos opcionales del `avatar` de los metadatos (el contrato `presencia` sigue en v1): los de AV2 (`tono`, `arriba`, `abajo`, `altura`, `complexion`, `movilidad`) más `cuerpo`, `pelo`, `pelo_color`, `vello`, `ropa` y `acc` (ids del catálogo y enteros). La api valida solo la forma y el tamaño (≤ 200 bytes de JSON), no el catálogo; el cliente trata lo que no conoce como ausente.
4. **Compatibilidad:** un cliente con el lector v1 ve `v: 2` como «sin catálogo» y dibuja el muñeco (que ya se tiñe con la receta: AV2). El v2 admite aún `avatares[]` (los provisionales de v1, decisión 134) y `avatar.vrm` sigue funcionando. Sin `cuerpo` válido (o con un cuerpo de `ofrecer: false`), manda `vrm`; sin ninguno, el muñeco.
5. **Supera en parte el §2 de ADR-0020:** el catálogo deja de ser «6-12 avatares cerrados» (ahora: cuerpos + piezas + paletas, y los cerrados opcionales); el resto de ADR-0020 (three-vrm, N por aparato, fundido, animación sin clips, licencias leídas del `meta`, sin subida propia) sigue igual.

## Alternativas consideradas
- **Un VRM por combinación** (cuerpo + pelo + ropa ya fundidos, lo que proponía AVATARES-FAMILIA §6): 9 cuerpos ofrecidos × 5 peinados × 2 ropas × vello = cientos de ficheros de ≈ 0,5 MB; la tubería los genera todos o bajo demanda (servidor que genera, decisión 128 lo descarta). Dibuja 1-2 llamadas menos por avatar. Descartada por volumen y por tiempo de Blender.
- **Piezas sueltas montadas en el cliente** (un `.glb` por pieza, reenganchado al esqueleto del cuerpo al cargar, como CharacterStudio): flexible, pero cada pieza tiene que ajustarse a cada cuerpo igualmente (la cabeza de un peque no es la de un mayor), multiplica las descargas y las comprobaciones de `sha256`, y reenganchar esqueletos al vuelo es código propio delicado. Queda como camino si el repertorio crece mucho (más de ≈ 30 piezas por cuerpo).
- **Textura por tono o por color**: 10 × 10 × 8 texturas o atlas; memoria de GPU y bytes por nada. El tinte por material es gratis (decisión 128).
- **Receta con nombres largos o un objeto anidado** (`{pelo: {estilo, color}}`): más legible, pero más bytes por persona en cada token; plana y con ids cortos basta.

## Consecuencias
- **Positivas:** se combinan cuerpo, pelo, vello, ropa y colores sin un fichero más; las piezas encajan con su cuerpo porque salen del mismo guion; la red no cambia (la pose sigue en v1; la receta, una vez, en el token); los clientes de antes no se rompen; el tinte no cuesta texturas.
- **Negativas / coste:** cada cuerpo pesa más (lleva todas sus piezas: ≈ +40-60 %) y se baja entero aunque se use una pieza; **más materiales por fichero** que el tope de ADR-0020 (4): la tubería de cuerpos usa `topes` propios para el fichero y el presupuesto que importa es el de **lo que se dibuja** (`topes_combinacion`), que se mide en el motor; 1 primitiva por material y pieza visible (≈ 5-6 llamadas por avatar completo frente a 1-3 de los provisionales); añadir un peinado obliga a regenerar los 12 cuerpos (≈ 3-5 min de Blender por el banco).
- **Implicaciones futuras:** con muchas más piezas, pasar a piezas sueltas en el cliente (arriba); los accesorios rígidos (sombrero, gafas, audífono) entran como piezas más del mismo fichero; las cuentas de peques (decisión 45) solo tienen que poner `ofrecer: true`.

## Comprobación
- **Lo vigilan:** `pruebas/guardianes/avatares.test.js` (esquema v1 y v2, ejemplo sintético v2, receta < 200 bytes, sin campos de sexo/género, nombres sin la lista negra de C9, paletas iguales a las del motor, peques sin ofrecer); `avatares_motor.test.js` (lector v2, elección cuerpo/vrm/muñeco, tinte por nombre de material, piezas visibles, postura sentada); `muneco_aspecto.test.js` (receta en `Aspecto`); `apps/api/pruebas/unidad` (la receta en `PUT /api/yo/avatar` y en los metadatos); `tuberia/avatares/creador/comprueba.mjs` (cada cuerpo con sus piezas pasa la tubería y three-vrm lo carga); Chrome por el banco (elegir y guardar en la portada, y verlo con `?presencia=sim`).
- **No probado:** iPhone, Quest y una GPU de verdad (el coste en el Quest es de recuento); el acabado de pelo y ropa lo revisa una persona con las capturas (decisión 130); el tirón de compilar al cambiar de pieza en la portada.
