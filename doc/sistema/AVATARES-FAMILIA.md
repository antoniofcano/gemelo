# Avatares para toda la familia

**Estado:** decidida (decisiones 127-135 y 141, 2026-10-30); **AV3 hecha** (los 12 cuerpos base, §13); **AV4 hecha en código** (creador por piezas, §14; el acabado de las piezas, por revisar a ojo). Parte de la pregunta «¿tenemos biblioteca de avatares?» y de la petición de que sean **sobrios**, pensados como un **juego familiar** (madres y padres, abuelas y abuelos, nietas y nietos), **inclusivos** y **nada heteropatriarcales**. Maqueta: [../../prototipos/avatares/index.html](../../prototipos/avatares/index.html) (un solo fichero, datos ficticios, figuras planas en SVG).

Encaja con: [ADR-0020](../adr/0020-avatares-vrm.md) (VRM cerca, muñeco lejos), el contrato [avatares](../../contratos/avatares.md) (catálogo cerrado con `sha256`), el motor `apps/web/motor/26b_avatares.js` y `apps/web/motor/26_presencia.js`, y las decisiones 45 (sin cuentas de menores), 73 (sobrios, propios), 74 (CC0 provisionales), 75 (sin subida propia) y 76 (paseante = avatar) de [DECISIONS-PENDING](../rumbo/DECISIONS-PENDING.md).

## Índice
1. [Respuesta corta](#1-respuesta-corta)
2. [Lo que hay hoy](#2-lo-que-hay-hoy)
3. [Fuentes investigadas](#3-fuentes-investigadas)
4. [Criterios de inclusión](#4-criterios-de-inclusión)
5. [Propuesta](#5-propuesta)
6. [Encaje con el contrato, el muñeco y el Quest](#6-encaje-con-el-contrato-el-muñeco-y-el-quest)
7. [Accesibilidad física: silla, andador, bastón](#7-accesibilidad-física-silla-andador-bastón)
8. [Peques y la decisión 45](#8-peques-y-la-decisión-45)
9. [La maqueta](#9-la-maqueta)
10. [Decisiones para Antonio](#10-decisiones-para-antonio)
11. [Lo que no está probado](#11-lo-que-no-está-probado)
13. [Fase AV3: los cuerpos base (hecho)](#13-fase-av3-los-cuerpos-base-hecho)
14. [Fase AV4: el creador por piezas](#14-fase-av4-el-creador-por-piezas)

## 1. Respuesta corta
**No tenemos biblioteca.** Hay 4 VRM CC0 **provisionales** de 100Avatars (fuera del repo, `tuberia/avatares/fuentes.json`) y el muñeco de bloque. Ninguna colección abierta que hayamos encontrado cumple a la vez «sobrio», «de campo», «todas las edades» y «licencia limpia para una empresa»; las que tienen licencia limpia (CC0) parten de cuerpos base **«male / female»** y de dos o tres edades, y las que tienen variedad son de estilo anime o fantasía.

**Recomendación (opción c, §5):** ya, **aplicar los criterios al muñeco** (casi gratis) y mantener los provisionales; después, un **creador propio por piezas hecho en la tubería** sobre un cuerpo base CC0 (MakeHuman/MPFB, que sí tiene edad y complexión continuas), que publique un catálogo de **cuerpos + piezas + paletas** en vez de 6-12 avatares cerrados. Coste estimado: 3-5 semanas de una persona con Blender **[SUPUESTO, sin presupuesto pedido]**; riesgo principal, el arte (que se vea sobrio y no «de plástico»).

## 2. Lo que hay hoy
| Pieza | Qué es | Variedad |
|---|---|---|
| Muñeco (`26_presencia.js`) | cajas instanciadas, 5 llamadas para todo el mundo, ≈ 98 triángulos/persona (medido) | camisa (6 colores), piel (**5 tonos**), sombrero (ninguno / paja / gorra); pantalón **fijo**; una sola altura y complexión |
| VRM (`26b_avatares.js`) | los N más cercanos (escritorio 6, móvil 3, Quest 3 → 0 según nivel VR), animados con la fórmula del muñeco sobre huesos | lo que traiga el catálogo: hoy 4 personajes de 100Avatars (Robert, Mikel, Rose, Polydancer), 3,5-6 k triángulos, 1 material, 1 textura |
| Portada (P7d) | radios con `nombre` y `descripcion` del catálogo + vista 3D | elegir uno de 4 |

Lo que falla frente a la petición: 4 personajes ya hechos, con nombre propio, **no son una familia** (su aspecto no se ha revisado a ojo: **[NO VERIFICADO]**); no hay mayores, ni peques, ni silla; el primer contacto con el selector es elegir «una persona ya hecha», que acaba siendo elegir género.

## 3. Fuentes investigadas
Comprobado el 2026-10-30 en la web; lo que no se pudo abrir va **[NO VERIFICADO]**. «Quest» = cabe en los topes de la tubería (≤ 20 k triángulos, ≤ 4 materiales, ≤ 3 texturas de 1024, ≤ 2 MB; `contratos/avatares.md` §6).

### 3.1 Colecciones ya hechas
| Fuente | Licencia | Formato y peso | Variedad para la familia | ¿Viva? | ¿Quest? |
|---|---|---|---|---|---|
| **100Avatars** R1-R3 (Polygonal Mind) vía el registro [Open Source Avatars](https://github.com/ToxSam/open-source-avatars) | CC0 (registro y `meta` leído en los 4 provisionales; el `meta` de otros puede no coincidir: se comprueba uno a uno) | VRM 0.x, 3,5-6 k tri, 1 material (medido en los 4) | Baja: personajes de dibujo, muchos de fantasía; **[NO VERIFICADO]** cuántos mayores, peques o tonos oscuros hay en los 300 | Registro con 9 colecciones (`data/avatars/`: 100avatars r1-r3, NeonGlitch86, grifters-squaddies, halloween-rising, toxsam, vipe-heroes-genesis, xmas-chibis); su web dice «All avatars CC0» | Sí, con holgura |
| **Quaternius — Universal Base Characters** ([ficha](https://quaternius.com/packs/universalbasecharacters.html)) | CC0 («free to use in personal, educational and commercial projects»); la versión «Source» (.blend, sombreadores de piel) es de pago | glTF/FBX, ≈ 13 k tri de media, esqueleto humanoide | 6 cuerpos: proporciones «Superhero», «Regular» y «Teen», **en versión male y female**; 20 peinados; tono de piel por sombreador en la versión Source. Sin mayores ni peques | Agosto de 2025 | Sí, pero hay que pasarlo a VRM |
| **Quaternius — Modular Character Outfits / Ultimate Modular** | CC0 según la ficha y guías de terceros **[NO VERIFICADO pack a pack]** | glTF; esqueleto común con el anterior (65 huesos, según una fuente secundaria **[NO VERIFICADO]**) | Ropa por piezas intercambiables; estética de videojuego, no de campo | Sí | Sí |
| **Kenney — Animated Characters 1-3, Mini/Blocky Characters** ([itch.io](https://kenney-assets.itch.io/animated-characters-3)) | CC0 | FBX/glTF **[NO VERIFICADO glTF]**, muy pocos polígonos; 4 «skins» por pack | Un solo cuerpo de juguete; las pieles son texturas | Sí | Sí, de sobra |
| **VRoid Hub** | Cada modelo con sus condiciones (VRM `meta`); **[NO VERIFICADO]** que haya modelos con uso corporativo y redistribución | VRM, a menudo 30-80 k tri **[NO VERIFICADO]** | Mucha, en estilo anime (descartado por la decisión 73) | Sí | Muchos no |
| **Ready Player Me** | — | — | — | **Cerrado** el 31-1-2026 (ADR-0020) | — |

### 3.2 Creadores de personajes abiertos
| Herramienta | Licencia | Qué hace | Encaje |
|---|---|---|---|
| **MakeHuman / MPFB 2** (complemento de Blender; [FAQ](https://static.makehumancommunity.org/mpfb/faq/use_in_closed_source.html), [¿es gratis?](https://static.makehumancommunity.org/mpfb/faq/is_it_really_free.html), [CG Channel, 2025](https://www.cgchannel.com/2025/03/check-out-open-source-blender-character-generation-plugin-mpfb-2)) | Código GPLv3; **activos del núcleo (malla base, «targets», pieles) CC0**, y lo exportado con ellos también. Pelo y ropa de la comunidad: **licencia de cada uno** (hay CC BY, p. ej. `hair02_ccby`) | Cuerpo humano paramétrico con **edad, peso, musculatura, altura y proporciones continuas** (de peque a mayor), pieles, pelo y ropa; esqueleto propio y exportación a glTF | **El mejor cuerpo base para la familia.** Realista de serie: hay que estilizarlo (texturas planas, menos polígonos) para que sea sobrio y quepa en el Quest |
| **VRM Add-on for Blender** ([repo](https://github.com/saturday06/VRM-Addon-for-Blender)) | MIT; vivo (último empuje 2026-10-29), «Blender 2.93 to 5.2» | Importa/exporta VRM 0.x y 1.0, asigna huesos humanoides, `meta` con licencia | La pieza que convierte lo hecho en Blender (MPFB, Quaternius) en VRM para el catálogo |
| **CharacterStudio** (M3; [repo](https://github.com/M3-org/CharacterStudio)) | Código MIT (vivo: 2026-08, 370 estrellas); **paquetes de piezas sin licencia declarada** (`loot-assets`: `license: null`, último empuje 2024-10) | Creador web de VRM por piezas, en local (`npm run dev`), con un **optimizador que funde mallas y hace atlas** («a single draw call») y exporta VRM | La idea es justo la del §5 (b), pero sus piezas no se pueden usar sin licencia. **Su código sí**, como herramienta de la oficina o como referencia para fundir y atlas |
| **VRoid Studio** (pixiv) | Gratis; el autor fija las condiciones del modelo; **[NO VERIFICADO]** el uso corporativo de las piezas de serie (la ayuda de pixiv no se leyó) | Creador de VRM de estilo anime | Descartado por estilo (decisión 73) |

**Conclusión de las fuentes:** con licencia limpia hay **cuerpos base** (MPFB, Quaternius) y **herramientas** (VRM Add-on, CharacterStudio), pero **no un catálogo** que cumpla el §4. La variedad hay que hacerla nosotros; lo bueno es que el cuerpo base CC0 de MPFB ya trae la edad y la complexión, y que el tono de piel y el color de la ropa se pueden **teñir en el motor** sin texturas nuevas.

## 4. Criterios de inclusión
Comprobables: cada uno dice **cómo se mira**. Valen para el catálogo, para el creador y para el muñeco; el guardián del catálogo puede comprobar los marcados con ⚙ (los demás, la persona que da de alta, con una lista firmada en el PR).

| # | Criterio | Cómo se comprueba |
|---|---|---|
| C1 | **Todas las edades con su proporción**: peque (cabeza grande respecto al cuerpo, ≈ 0,6 de la altura adulta), joven, adulta, mayor (algo más baja, leve curvatura, arrugas sobrias) | ⚙ el catálogo declara `edad` en cada cuerpo y hay al menos uno de cada; a ojo, la silueta |
| C2 | **Tonos de piel en una escala amplia de ≥ 10**, de muy claro a muy oscuro, con el mismo número de pasos en cada mitad; **ninguno es «el de serie»**: sin elección previa la portada empieza al azar o pide elegir | ⚙ `paletas.piel` tiene ≥ 10 entradas que cubren la luminancia L* de ≈ 90 a ≈ 20 sin huecos > 10; ⚙ la portada no marca ninguno por defecto (prueba de la portada) |
| C3 | **Cuerpos diversos**: ≥ 3 alturas y ≥ 3 complexiones por edad (delgada, media, ancha), sin que «ancha» se dibuje como chiste | ⚙ los ejes `altura` y `complexion` existen; a ojo |
| C4 | **Pelo variado**: rapado, corto, rizado, afro, media melena, largo, trenzas, moño, coleta, sin pelo; colores con **canas y blanco**; vello facial opcional **disponible para cualquier cuerpo** | ⚙ las piezas de pelo incluyen esos 10 estilos; ⚙ el pelo y el vello no tienen restricción por cuerpo |
| C5 | **Ropa sin codificar género**: camisa, camiseta, jersey, chaqueta de faena; pantalón, corto, falda, peto. **Cualquier cuerpo puede llevar cualquier prenda** y cualquier color; los colores se nombran por el campo (verde olivo, tierra, almagra, trigo, cielo, adelfa, cal…), **nada de «azul chico / rosa chica»**; nada ceñido de más, escote, tacón ni ropa sexualizada; ningún uniforme de rol (nadie «la que cocina» ni «el que conduce») | ⚙ ninguna pieza tiene un campo de compatibilidad por sexo o cuerpo (solo por edad, por la talla); a ojo, la ropa |
| C6 | **Accesorios de campo**: sombrero de paja, gorra, pañuelo, gafas, gafas de sol, audífono, chaleco de campo, espuerta; bastón y andador | ⚙ existen; a ojo |
| C7 | **Accesibilidad física representada con dignidad**: silla de ruedas, andador y bastón como **piezas más**, no como «modo especial»; misma velocidad, mismos caminos, sin animación lastimera (§7) | ⚙ la pieza `movilidad` existe; prueba del motor (postura sentada con silla) |
| C8 | **Sin selector «hombre/mujer» como primer paso** (ni en ningún paso): se empieza por piezas o por «parecido a…», descrito por lo que se ve | ⚙ ni el catálogo ni la api tienen campo `sexo`/`genero`; prueba de la portada |
| C9 | **Nombres de opciones neutros**: «Persona mayor con sombrero», no «Abuelo»; «Adulta» como edad, no «Señora»; los puntos de partida no llevan nombre propio de persona | a ojo; el guardián busca palabras de la lista negra (abuelo/abuela, chico/chica, hombre/mujer, señor/señora) en `nombre` y `descripcion` del catálogo ⚙ |
| C10 | **Cultura del campo andaluz/mediterráneo sin caricatura**: ropa de faena real, sombrero de paja, pañuelo; **nada** de traje de flamenca, sombrero cordobés, botijo ni gitanería de postal | a ojo, con alguien del campo en la revisión |
| C11 | **Caras sobrias y amables**: rasgos sencillos, sin exagerar rasgos étnicos ni de edad; boca y ojos preparados para parpadeo y voz (ADR-0020 §4) | a ojo; ⚙ el VRM trae `blink` y `aa` |
| C12 | **La familia se reconoce a la vez**: con el catálogo se puede hacer una abuela, un padre y una nieta (o cualquier otra combinación) que se parezcan a quienes son, en la misma escala y el mismo estilo | prueba de aceptación con 3 personas reales de edades distintas (👤) |
| C13 | **De lejos se sigue reconociendo**: el muñeco lleva piel, ropa de arriba y de abajo, sombrero, altura y silla de la persona | ⚙ prueba de `colores_muneco` / `muneco` en el catálogo; prueba del motor |
| C14 | **Licencia limpia**: CC0 o CC BY, uso corporativo y redistribución; nada de piezas sin licencia | ⚙ ya lo hace `tuberia/avatares/vrm.mjs`; se extiende a cada pieza |

## 5. Propuesta

### Las tres opciones
| | (a) Curar N avatares CC0 existentes | (b) Creador propio por piezas | (c) Mezcla: criterios al muñeco y provisionales ya, creador después |
|---|---|---|---|
| Qué es | Elegir 6-12 VRM de 100Avatars, Quaternius o Kenney que pasen el §4 | Cuerpos base por edad × complexión (MPFB CC0) + piel teñida + pelo + ropa + accesorios, ensamblados en la **tubería** y elegidos por piezas en la portada | (1) muñeco con 10 tonos, pantalón, altura, complexión y silla; (2) los 4 provisionales siguen; (3) el creador (b) por fases |
| Cumple el §4 | **No**: no hay mayores ni peques ni silla en esas colecciones; 6-12 avatares cerrados son un «elige a alguien», no «hazte a ti» | Sí, por diseño | Sí al final; el muñeco cumple C2, C3, C7, C13 desde la primera semana |
| Coste | Bajo (días) | Alto: 3-5 semanas de arte con Blender + 1-2 de tubería y motor **[SUPUESTO]** | El de (b), repartido; la fase 1 son 2-3 días de motor |
| Riesgos | Que nadie se vea en ellos; estilo mezclado | Arte (que se vea sobrio); tiempo; memoria si cada combinación es un VRM distinto (§6) | Los de (b), más tarde y con algo útil ya en pantalla |
| Licencias | CC0 comprobado uno a uno (como hoy) | Limpias: MPFB núcleo CC0, piezas propias (nuestras) o CC0 comprobadas; nada de CharacterStudio `loot-assets` | Igual |

**Recomendación: (c).** La (a) no resuelve la petición: un catálogo cerrado de personajes ya hechos empuja a elegir «el chico» o «la chica». La (b) sí, pero no hay que esperarla para que la familia se vea distinta: el muñeco es lo que más se ve (todo el que no está entre los N más cercanos) y teñirlo es casi gratis.

### Cómo sería el creador (b), en concreto
- **Cuerpos base** (en Blender, desde MPFB con sus «targets» CC0, estilizados a texturas planas y ≤ 12 k triángulos): 4 edades × 3 complexiones = **12 cuerpos**, más la altura como **escala** en el motor (±7 %, sin malla nueva). Todos con **el mismo esqueleto humanoide VRM** por edad (los peques tienen otras longitudes), exportados con el VRM Add-on (MIT).
- **Tono de piel, color de pelo y de ropa: teñidos en el motor** (color del material o de vértice, sobre una textura en gris), **no** una textura por tono: 10 tonos × 7 colores de pelo × 10 colores de ropa no cuestan ni un byte más ni una textura más en la GPU.
- **Pelo, ropa y accesorios: piezas glTF pequeñas con piel (skinned) al mismo esqueleto**, una por estilo, de 300-2.000 triángulos; los accesorios rígidos (sombrero, gafas, audífono, espuerta, bastón) **colgados de un hueso** (`head`, `rightHand`).
- **Ensamblado:** en el **cliente**, al cargar (cuerpo + 3-6 piezas que comparten esqueleto), fundiendo por material como hace el optimizador de CharacterStudio (referencia MIT) **o** —más sencillo y lo recomendado— **en la tubería**, que deja un VRM por **cuerpo + pelo + ropa** con el color aparte. Ver el coste en §6.
- **Arte:** líneas de un estilo «de ilustración sobria» (ni anime ni realista): paleta mate, sin brillos, cara con rasgos simples. Antes de modelar 12 cuerpos, **un cuerpo de cada edad** para que Antonio y la familia digan si se reconocen (C12).

## 6. Encaje con el contrato, el muñeco y el Quest

### El contrato `avatares` (v = 1 → v = 2)
Hoy: `avatares[]` cerrados (1-12), cada uno con su fichero, `sha256` y `colores_muneco {camisa, piel, sombrero}`; en presencia viaja `avatar.vrm` = id. Propuesta de **v = 2** (cambio de contrato, esquema, ejemplo y guardián en el mismo commit, regla 3; **no** se hace en este commit):

```
{ v: 2, compresion, topes,
  paletas: { piel: ["#rrggbb" ×10], pelo: [{id, nombre, color}], ropa: [{id, nombre, color}] },
  cuerpos: [{ id, edad: "peque"|"joven"|"adulta"|"mayor", complexion, fichero, sha256, bytes, triangulos, materiales, texturas, licencia, autor, fuente }],
  piezas:  [{ id, tipo: "pelo"|"vello"|"arriba"|"abajo"|"cabeza"|"cara"|"oreja"|"cuello"|"mano"|"movilidad", edades: [...], hueso?, fichero, sha256, …, licencia }],
  avatares?: [ … los de v1, para los provisionales … ] }
```

- La elección de cada persona pasa a ser **una receta** pequeña en `avatar` de los metadatos de presencia: `{cuerpo, altura, piel, pelo, peloColor, vello, arriba, arribaColor, abajo, abajoColor, acc: [...], movilidad}` (ids y números, < 200 bytes); la pose v1 **no cambia**. La api guarda la receta y valida solo su forma (como hoy, no conoce el catálogo); el cliente trata lo que no esté en su catálogo como ausente.
- **Sigue siendo un catálogo cerrado** (decisión 75): nadie sube nada; se combinan piezas que la oficina publicó con su `sha256`. La tubería lee la licencia de **cada pieza**.
- Los v1 (100Avatars) caben como `avatares[]` durante la transición.

### El muñeco lejano (fase 1, ya)
`26_presencia.js` colorea por instancia (`setColorAt`) el cuerpo, la cabeza, el sombrero y las manos; el pantalón es una constante (`PANTALON`). Propuesta, **sin llamadas nuevas** (siguen 5) salvo la silla:
- `PIELES`: de **5 a 10 tonos** (los de `paletas.piel`), y la portada sin tono por defecto (C2).
- **Pantalón por persona** (las piezas de pierna ya son instancias con color propio: se cambia la constante por el color de la receta).
- **Altura y complexión** en la matriz de cada instancia (escala Y por altura y edad, X/Z por complexión). Coste cero en llamadas y triángulos.
- **Silla**: una malla instanciada más (ruedas y asiento, ≈ 60-100 triángulos) = **+1 llamada** para todo el mundo, solo si alguien la lleva; postura sentada (la del quad). **Bastón y andador** en el muñeco: no (de lejos no se ven); sí en el VRM.
- `colores_muneco` del catálogo v1 se mantiene para los provisionales; con recetas, el muñeco se tiñe de la receta.

Coste a medir con el banco (regla 6): debería ser 0 triángulos y 0 llamadas salvo la silla; se mide antes y después.

### El Quest (presupuesto de `26b_avatares.js`)
- N VRM a la vez por aparato (escritorio 6, móvil 3, Quest 3 → 0) **no cambia**. Lo que cambia es el coste de **cada** VRM:
  - **Ensamblado en la tubería** (recomendado): cada combinación «cuerpo + pelo + ropa» es un VRM; las piezas fundidas por material dan **2-3 llamadas** y ≤ 15 k triángulos, como hoy. Pero las combinaciones son muchas (12 cuerpos × 10 pelos × 16 ropas ≈ 1.900): la tubería **no** las genera todas, sino las que la gente elige (bajo demanda, en la oficina) **o** se limita a combinaciones comunes. Esto choca con «sin servidor que genere»: **decisión 2** (§10).
  - **Ensamblado en el cliente**: cuerpo + 3-6 piezas con esqueleto = **4-8 llamadas por avatar** sin fundir (el doble que el tope de la tubería); con 3 VRM en el Quest, 12-24 llamadas, **a medir**. Fundir en el cliente (como CharacterStudio) cuesta un tirón de CPU al cargar, malo en el Quest.
  - **Tinte**: un material por zona (piel, pelo, ropa arriba, ropa abajo) = 4 materiales, en el tope de la tubería; con textura en gris compartida, la memoria de GPU **baja** frente a hoy (1 textura de 1024 por cuerpo en vez de 1-3 por avatar).
- En VR uno mismo solo ve **sus manos**: que lleven su tono de piel (ADR-0020 §7 ya lo prevé) y el puño de su manga.

## 7. Accesibilidad física: silla, andador, bastón
- **Silla de ruedas — viable con la animación de 26b.** `AvataresPuro.huesos` ya tiene la postura **sentada del quad** (piernas 1,15 rad, brazos 1,05). La silla es esa postura con los brazos a las ruedas, **sin el paso** (las piernas no se mueven) y un leve vaivén de brazos con la velocidad en vez del bote de cadera. La silla es una pieza rígida colgada de `hips`. La **cabeza baja a ≈ 1,2 m**: el VRM se escala igual pero la altura del nombre se ajusta. La pose v1 no cambia: quién va en silla lo dice la receta (metadatos), no la pose, y lo calcula quien mira, como el paso.
  - **En primera persona** (quien va en silla en la vida real): opción en Configuración «altura de mi vista» (sentada / de pie), independiente del avatar; en VR la altura la da el visor. **No** se impone por llevar silla en el avatar.
  - **Dignidad:** misma velocidad que el resto, mismos caminos, nada de iconos ni rampas «especiales» en el mundo; el quad y el dron siguen disponibles (la silla se queda donde se bajó, como el paseante).
- **Bastón y andador:** el paso de siempre con la mano derecha (bastón) o las dos (andador) **fijas** al apoyo (el IK de dos huesos que 26b ya usa para las manos de Quest). Pieza rígida en `rightHand`; el andador, delante, en `hips`.
- **Audífono y gafas:** piezas de cabeza, sin efecto en la animación.
- **No probado:** nada de esto tiene código; la postura sentada del quad **sí** está probada en el muñeco.

## 8. Peques y la decisión 45
La decisión 45 dice **no a perfiles de menores** (se reabre con asesoría y la EIPD de F3). La petición habla de nietas y nietos. Opciones:
1. **Diseñar ya los cuerpos de peque y no ofrecerlos** hasta que se reabra la 45 (recomendado): el arte se hace una vez y el día que se abran las cuentas de menores (o la «visita acompañada») están listos. En la maqueta salen marcados «sin cuenta aún».
2. **Ofrecerlos a cuentas adultas** (una persona adulta de cuerpo pequeño, o quien juega «de peque» con su nieto delante): posible, pero mezcla la idea; **no** se recomienda sin hablarlo.
3. **«Acompañante sin cuenta»**: una figura de peque que va junto a una persona adulta en la misma pantalla, sin voz ni datos. Toca la 45 (dice que hay un menor): **solo con asesoría**.

## 9. La maqueta
[`prototipos/avatares/index.html`](../../prototipos/avatares/index.html): un solo fichero, sin red, figuras SVG planas (no son los VRM). Enseña: el **hogar** (5 personas ficticias de edades, tonos, cuerpos y apoyos distintos); **piezas** en desplegables (cuerpo, piel, pelo y cara, ropa, accesorios de campo, cómo te mueves) con radios y casillas de ≥ 44 px, foco visible y nombres accesibles; **«Empieza por algo parecido»** con descripciones neutras; **«Al azar»** (que no sortea la edad ni el apoyo, porque son de la persona); y cuatro vistas: **de cerca**, **de lejos (muñeco)** con piel, ropa, sombrero, altura y silla, **con gafas de VR** (solo manos con el tono de piel) y **el hogar junto**. Una descripción en texto se actualiza con cada cambio (`aria-live`): es la alternativa accesible que la portada ya ofrece al 3D.

## 10. Decisiones para Antonio
| # | Decisión | Opciones | Recomendación |
|---|---|---|---|
| A1 | **Rumbo** | (a) catálogo curado CC0 / (b) creador propio / (c) muñeco ya + creador después | **(c)** |
| A2 | **Dónde se ensamblan las piezas** | en la tubería, combinaciones elegidas por la oficina / en la tubería, bajo demanda de cada persona (un trabajo en el servidor) / en el cliente | **En la tubería, con un repertorio de combinaciones** (p. ej. 12 cuerpos × 10 pelos × 6 conjuntos de ropa) y **el color en el motor**; medir el cliente antes de descartarlo |
| A3 | **Cuerpo base** | MPFB (CC0, edades continuas, hay que estilizar) / Quaternius (CC0, «male/female», sin mayores ni peques) / modelado desde cero | **MPFB** |
| A4 | **Quién hace el arte** | la oficina con Blender / encargo a ilustrador 3D (licencia cedida a Cano & Damas, con `meta` CC BY o propia) | **Encargo** de un cuerpo por edad como prueba, luego decidir |
| A5 | **Muñeco con 10 tonos, pantalón, altura, complexión y silla** (fase 1) | sí / no | **Sí** (2-3 días; se mide con el banco) |
| A6 | **Peques** (decisión 45) | diseñar y no ofrecer / ofrecer a adultos / acompañante sin cuenta | **Diseñar y no ofrecer** hasta reabrir la 45 |
| A7 | **Altura de la vista en primera persona** | opción en Configuración (sentada / de pie) / ligada al avatar / nada | **Opción en Configuración**, independiente del avatar |
| A8 | **Los 4 provisionales** | seguir hasta el creador / retirarlos ya (solo muñeco) | **Seguir**, describiéndolos por lo que se ve (no por nombre propio: «Robert» → «Persona adulta con camisa azul») |
| A9 | **Contrato `avatares` v = 2** con paletas, cuerpos, piezas y receta | sí, cuando empiece el creador / no | **Sí**, con su ADR (supera en parte a ADR-0020 §2) |

## 11. Lo que no está probado
- **Nada de esta propuesta tiene código** fuera de la maqueta. Las cifras de llamadas, triángulos y memoria del §6 son **estimadas**.
- ~~Los cuerpos MPFB no se han hecho~~: hechos en AV3 (§12), ≈ 11,8 k triángulos; el estilizado (que se vea sobrio y no «de plástico») está **por revisar a ojo**.
- La variedad real de los 300 de 100Avatars no se ha revisado uno a uno **[NO VERIFICADO]**.
- La licencia pack a pack de Quaternius (fuera de Universal Base Characters), el formato glTF de Kenney y el uso corporativo de las piezas de serie de VRoid Studio **[NO VERIFICADO]**.
- La silla, el bastón y el andador en el VRM; el tinte por material en three-vrm (MToon) **no probados**. Nada en iPhone ni en Quest.
- C12 (que una abuela, un padre y una nieta se reconozcan) solo lo puede decir una prueba con personas (👤).

## 12. Hecho: el muñeco teñido (AV2, 2026-10-30, decisiones 131 y 133)
Lo de la fase 1 del §6 ya tiene código: `Aspecto` en `apps/web/motor/26_presencia.js` (trozo puro, probado en Node por `pruebas/guardianes/muneco_aspecto.test.js`) y los campos opcionales del avatar en la api ([presencia](../../contratos/presencia.md), «Aspecto del muñeco»).
- **Piel (C2):** 10 tonos (los de la maqueta; L* de 89 a 16 sin huecos de más de 10 (el mayor, 9); lo comprueba el guardián). Ninguno es «el de serie»: quien no ha elegido (`tono` ausente) ve su muñeco con un tono repartido por el alias. Mientras la portada (AV4) no deje elegir, la api sigue mandando `piel` de antes (0-4, equivalencia en `PIEL_ANTES`).
- **Ropa (C5):** color de arriba y de abajo por persona, de 10 colores con nombre del campo, para cualquier cuerpo; el pantalón deja de ser fijo. Sin campos de género en la api (400) ni en el motor (el guardián lo vigila).
- **Cuerpo (C3):** altura ×0,93 / ×1 / ×1,07 (todo el muñeco) y complexión ×0,84 / ×1 / ×1,24 (ancho y fondo de las piezas). Coste cero en llamadas y triángulos.
- **Apoyos (C7):** silla de ruedas = la postura sentada del quad sin paso (misma velocidad y caminos), asiento y respaldo como cajas del instanciado del sombrero y **dos ruedas en una malla instanciada más (+1 llamada, solo si alguien la lleva)**; bastón (1 caja) y andador (3 cajas) sin llamadas nuevas. Ilustrativo (regla 5); la rueda no gira.
- **VRM (C13):** el VRM de cerca no cambia. El muñeco lejano de quien lleva VRM sigue tomando `colores_muneco` del catálogo, salvo que la persona eligiera `tono` o `arriba`: manda lo suyo. De momento, **con VRM no se dibuja la silla** (la silla en el VRM, con AV3).
- **Altura de la vista (decisión 133):** ajuste `vista.altura` en la pestaña «Vista» de Configuración (de pie, ojos a 1,62 m; sentado, a 1,20 m). Al pasear en primera persona cambia la cámara (`12_paseo.js`); en VR baja el rig 0,42 m sumado al suelo de la sesión (`29_vr.js`, `vrBaseY()`). Sustituye al `vr.postura`, que existía sin ningún efecto. Independiente del avatar: llevar silla no cambia la vista.

**Medida (regla 6)**, `?presencia=sim` sobre el Cerro del fixture, escenario `cerca`, Chrome con SwiftShader por el banco, una pasada (recuentos, no fps). «Antes» = `&aspecto=0` (el muñeco de siempre: 988 y 3.904 triángulos, 5 llamadas, idénticos a los medidos en P5); «después» = el aspecto repartido por la simulación (≈ 12 % en silla, 10 % bastón, 6 % andador):

| Simulados | Llamadas de la presencia (antes → después) | Triángulos añadidos (antes → después) | Por persona | Cajas / ruedas |
|---|---|---|---|---|
| 10 | 5 → **6** | 988 → 1.152 | 98,8 → 115,2 | 15 / 2 (1 silla, 2 bastones, 1 andador) |
| 40 | 5 → **6** | 3.904 → 4.684 | 97,6 → 117,1 | 55 / 12 (6 sillas, 4 bastones, 3 andadores) |

La llamada extra es la de las ruedas y solo existe si alguien lleva silla (sin ella, 5 como antes). Sin presencia no cambia nada. `pruebas/presupuesto.json` no se toca (la presencia no tiene tope propio ahí; el de `presencia.test.js`, 120 triángulos por persona, se cumple: 117,1). **En iPhone y Quest, no medido.**

**Nota de comodidad (regla 11).** Probado: la lógica en Node (paletas, escalas, silla, validación de la api) y la presencia simulada en Chrome sin pantalla (SwiftShader), sin errores. **No probado: iPhone, Quest ni a ojo en una pantalla real** (el aspecto de las ruedas de 10 lados, del andador como tres cajas, del bastón y de la complexión ancha de lejos está sin juzgar por una persona; criterio C12 sin hacer). Altura de la vista: de pie es el valor de siempre; «sentado» en las gafas **baja el mundo 0,42 m respecto al visor**, así que quien ya juega sentado y tiene bien puesto el suelo del visor debe dejarlo en «De pie» (si no, la vista queda por debajo de lo natural). No está en el panel VR (solo en Configuración), y el cambio se aplica con suavidad (el rig sigue al suelo a 12 s⁻¹) pero **no se ha probado en unas Quest** que no marée.

## 13. Fase AV3: los cuerpos base (hecho)
**Hecho el 2026-10-30** (decisiones 128-132). Doce cuerpos base generados por un agente con Blender sobre MPFB, exportados a VRM 1.0, que pasan la tubería de siempre y cargan en three-vrm. **Ninguno se ofrece todavía**: el acabado lo revisa Antonio a ojo (decisión 130) con las capturas, y el contrato v2 y la pantalla son de AV4.

### Herramientas (fuera del repo, versiones fijadas)
| Pieza | Versión | Licencia | De dónde | Comprobación |
|---|---|---|---|---|
| Blender | **5.2.3 LTS** (la LTS vigente; 4.5 LTS sigue con soporte) | GPL-3.0-or-later | zip portable de download.blender.org (winget pedía elevación y se quedó esperando la confirmación de UAC) | SHA-256 `723f08a4…5dc2fb`, igual al publicado en `blender-5.2.3.sha256` |
| MPFB (MakeHuman) | **2.0.18** | código GPL-3.0-or-later; **activos del núcleo (malla base, targets, esqueletos, poses) CC0** | extensions.blender.org | SHA-256 `c075b3e9…8a2dad` (el de la URL de descarga) |
| VRM Add-on for Blender | **4.10.3** (Blender 4.2-5.3) | MIT o GPL-3.0-or-later (elegimos MIT) | extensions.blender.org | SHA-256 `cbcc06d6…47bf9f5` |

Blender va como carpeta portable (con su `portable/` al lado, así que los complementos y preferencias no tocan el perfil del usuario); en el repo **solo** van los guiones. Las rutas de este equipo no se escriben en el repo (regla 4); cada cual pone las suyas.

### Cómo se regenera
```
# una vez: los dos complementos en el Blender portable
blender --background --command extension install-file -r user_default -e add-on-mpfb-v2.0.18.zip
blender --background --command extension install-file -r user_default -e add-on-vrm-v4.10.3.zip
# los 12 cuerpos (≈ 2 min) y las capturas, por el banco (espera 1,5 GB libres y el turno; no coincide con Chrome ni Docker)
node pruebas/banco/proceso.js --que "AV3 cuerpos" -- blender --background --python-exit-code 1 --python tuberia/avatares/creador/cuerpos.py -- --salida <fuera del repo>
node pruebas/banco/proceso.js --que "AV3 capturas" -- blender --background --python-exit-code 1 --python tuberia/avatares/creador/capturas.py -- --origen <la misma> --salida pruebas/salida/capturas-avatares-cuerpos
# comprobación: tubería (licencia, optimización, topes) + three-vrm 3.5.5 en Node + tabla
node tuberia/avatares/creador/comprueba.mjs --origen <la misma>
```
`cuerpos.py` deja `<id>.vrm`, `<id>.avatar.json` (lo que lee `construye.mjs`, más `cuerpo: {edad, complexion, ofrecer, mpfb}`) y `cuerpos.json` (versiones y medidas). Es determinista: la reducción «collapse» no usa azar. `pruebas/guardianes/avatares_creador.test.js` vigila el guion sin Blender y, con `GEMELO_AVATARES_CUERPOS=<carpeta>`, pasa `comprueba.mjs`.

### Qué hace el guion y por qué
- **Deslizadores de MPFB** (de 0 a 1; la edad va de 1 a 90 años por tramos):

  | Edad | `age` | ≈ años | ¿Se ofrece? |
  |---|---|---|---|
  | peque | 0,13 | 8 | **no** (decisión 132, hasta reabrir la 45) |
  | joven | 0,32 | 17 | sí, tras la revisión a ojo |
  | adulta | 0,62 | 40 | ídem |
  | mayor | 0,88 | 75 | ídem |

  | Complexión | `weight` | `muscle` |
  |---|---|---|
  | delgada | 0 | 0,35 |
  | media | 0,5 | 0,5 |
  | ancha | 1 | 0,65 |

  En la primera tanda se usó 0,25/0,5/0,85 de peso: la cintura cambiaba un 6 % de delgada a ancha (medido sobre el VRM) y a ojo no se distinguían, así que se usa el recorrido entero. **Sin sexo como parámetro:** `gender` = 0,5 en los doce (el valor central de MPFB), y `cupsize`, `firmness`, `proportions` y `height` en su centro; la altura la escala el motor (±7 %). `race` = ⅓ africana, ⅓ asiática, ⅓ europea (el valor por defecto de MPFB): ningún rasgo étnico marcado; el tono lo pone el motor. Lo que distingue a cada cual (pelo, vello, ropa, accesorios, para cualquier cuerpo) es AV4. **A revisar a ojo:** el valor central de `gender` deja un pecho leve en los cuerpos adultos; si se prefiere otra figura común (o variar la silueta sin etiquetarla), es un cambio de un número.
- **Expresiones:** `blink` (párpados) y `aa` (boca abierta) salen de los targets de expresión de MPFB (CC0), promediando sus tres variantes (`african`, `asian`, `caucasian`) para no elegir una.
- **Esqueleto:** el `game_engine` de MPFB con sus pesos, llevado a la **pose en T** de MPFB y aplicado como reposo; mapa explícito a los huesos humanoides de VRM 1.0 (los 15 obligatorios, hombros, pecho superior, dedos de pie y los 30 de los dedos). No tiene huesos de ojos: la mirada va por expresión (`lookAt.type = expression`, vacía), así que `VRMLookAt` de 26b no mueve los ojos de estos cuerpos.
- **Malla:** fuera dientes, lengua, pestañas y ayudas; ojos en malla aparte, al hueso `head`. Reducción Decimate «collapse» simétrica en X hasta 10.000 triángulos (la malla entera de MPFB tiene 26.756; los cortes de la ropa suben a ≈ 11.800) y `blink`/`aa` reconstruidos con los 3 vecinos más cercanos de la malla entera.
- **Materiales lisos, sin texturas (decisión 128):** `piel` y `ropa_base` en blanco para que el motor multiplique por el color elegido (tono de piel, color de ropa), y `ojos` oscuro. **`ropa_base`** es una camiseta de manga corta y un pantalón hasta encima de la rodilla, con cortes rectos sacados del esqueleto (`RODILLA`, `CUELLO`, `MANGA`, `ESCOTE`): ningún cuerpo va desnudo mientras no haya ropa de verdad (AV4), y deja ver la complexión.
- **Meta VRM 1.0:** CC0-1.0, `avatarPermission = everyone`, `commercialUsage = corporation`, redistribución y modificación permitidas, crédito no necesario; autor «Cano & Damas Oleicultores (gemelo; generado con MakeHuman/MPFB)». `construye.mjs` lo acepta sin excepciones.

### Cifras (medidas el 2026-10-30)
Con `comprueba.mjs` (tubería con cuantización, como el catálogo; three-vrm 3.5.5 + three 0.186.1 en Node). Los doce **pasan la licencia y los topes** y **three-vrm los carga** (meta 1.0, los 15 huesos obligatorios, `blink` y `aa` mueven su morph, el brazo baja desde la T).

| Edad | Complexión | ¿Se ofrece? | Altura | Triángulos | Primitivas | Materiales | Texturas | Peso | Tras gzip |
|---|---|---|---|---|---|---|---|---|---|
| peque | delgada / media / ancha | **no** (132) | 1,11 m | 11.814 / 11.824 / 11.864 | 3 | 3 | 0 | 461-463 kB | 166-167 kB |
| joven | delgada / media / ancha | tras revisión | 1,46 m | 11.744 / 11.696 / 11.780 | 3 | 3 | 0 | 458-461 kB | 164-165 kB |
| adulta | delgada / media / ancha | tras revisión | 1,66 m | 11.722 / 11.774 / 11.842 | 3 | 3 | 0 | 460-464 kB | 164-166 kB |
| mayor | delgada / media / ancha | tras revisión | 1,65 m | 11.824 / 11.832 / 11.896 | 3 | 3 | 0 | 462-465 kB | 166-167 kB |

- **Presupuesto:** ≤ 12.000 triángulos, 3 materiales y 0 texturas por cuerpo (`PRESUPUESTO_CUERPO` de `comprueba.mjs`), por debajo del objetivo de la tubería (15.000) para dejar sitio a pelo y ropa. Con los 3 VRM del Quest de 26b: ≈ 36 k triángulos y 9 primitivas, sin memoria de texturas. **Holgura justa:** la reducción deja 10.000 y los cortes rectos de la ropa añaden ≈ 1.700; con pelo y ropa (AV4) habrá que bajar el cuerpo o fundir piezas.
- **Complexión:** media anchura de la cintura del adulto 0,124 / 0,141 / 0,152 m (delgada / media / ancha; +23 % de punta a punta).
- **Edad:** la altura sale de MPFB (1,11 / 1,46 / 1,66 / 1,65 m). La de «mayor» apenas se distingue de «adulta» a ojo (C1 pide algo más baja y una leve curvatura): **a revisar**; se puede subir `age` o añadir un target de postura.

**Medida en Chrome por el banco** (SwiftShader, recuentos y no fps; `avatares_piezas.test.js` con `GEMELO_AVATARES_CUERPOS`): `?presencia=sim&n=20&vrm=1&yo=no` sobre el Cerro del fixture, cámara a 9 m. Solo muñeco: 24 llamadas y 73.822 triángulos en toda la escena; con los cuerpos (6 VRM, el cupo de escritorio): **61 llamadas y 140.052 triángulos** (82 geometrías, 51 texturas de la escena). Por avatar completo, lo que cuenta 26b: **6-7 llamadas y 10.545-11.573 triángulos**; uno de los seis, sentado en su silla. Capturas en `pruebas/salida/capturas-avatares-piezas/` (`piezas20.png`, `muneco20.png`, `portada-cerca-*.png`, `portada-lejos-*.png`, `medida.json`).

**Nota de comodidad (regla 11).** Probado: la pantalla de elección en Chrome sin pantalla a 1280 y 390 px (sin desbordar, radios de ≥ 44 px dentro de su `<label>`, foco visible, descripción en texto `aria-live`, guardado y lectura de vuelta con una api de mentira que valida con `limpiaAspecto` de la api de verdad), y la presencia simulada con los cuerpos. **No probado:** iPhone, Quest, una pantalla real a ojo, ni la portada con lector de pantalla; la vista previa 3D es pequeña (160 × 200 px) y en el Quest su coste de compilar MToon/PBR al cambiar de cuerpo no se ha medido; el cambio de pieza en la vista previa no recarga el fichero (solo se ocultan y tiñen mallas), pero cambiar de edad o complexión sí baja otro VRM (≈ 260 kB con gzip). En VR uno mismo sigue viendo solo sus manos (ADR-0020 §7).

### Capturas
En `pruebas/salida/capturas-avatares-cuerpos/` (no se versionan): `frente.png` (los 12 en fila, peque → mayor y delgada → ancha, con su altura), `tres-cuartos.png` y `cara-<edad>.png` (complexión media). Render de Workbench (luz de estudio, colores de material; los tonos más oscuros salen más apagados que en el motor, y la toma de tres cuartos corta al último); **tonos de piel y colores de ropa ilustrativos**: una escala de 10 tonos y siete colores con nombre de campo (verde olivo, tierra, almagra, trigo, cielo, cal, adelfa), no la paleta de AV4.

### Para AV4 (no es de cuerpos)
- ADR y contrato `avatares` v2 (decisión 135): `cuerpos[]` con `edad`, `complexion` y **`ofrecer`** (los peques, `false`), paletas y receta. Hoy los cuerpos solo caben en v1 como `avatares[]` (máximo 12, sin `ofrecer`): **no se publican así**.
- El tinte en el motor: `piel` y `ropa_base` por nombre de material (color del material de three-vrm); el muñeco lejano con los colores de la receta.
- Pelo, vello, ropa de faena y accesorios como piezas con el mismo esqueleto `game_engine` (y por edad: los peques tienen otras longitudes); repertorio de combinaciones en la tubería (decisión 128).
- Huesos de ojos (o expresiones `lookLeft/Right/Up/Down`) si se quiere mirada; más expresiones (`ih`, `ou`, `happy`…) desde los mismos targets.
- La pantalla de elección, sin peques (132) y sin «hombre/mujer» (C8).

### Lo que no está probado (AV3)
- **El acabado no lo ha revisado una persona** (decisión 130): las capturas están para eso.
- Nada en un navegador con GPU, iPhone ni Quest: three-vrm se probó en Node, sin dibujar. El coste en el Quest (3 VRM a la vez según 26b) es de recuento: ≈ 11,8 k triángulos y 3 primitivas por cuerpo, sin texturas.
- `blink` y `aa` reconstruidos tras la reducción: que cierren bien los ojos y abran la boca **no se ha visto animado**; three-vrm confirma que mueven su morph.
- Los pesos se recortan a 4 influencias por vértice al exportar (aviso del exportador de glTF); en las capturas en reposo no se ve nada raro, en movimiento **no probado**.

## 14. Fase AV4: el creador por piezas
**2026-10-30** (decisiones 128, 132, 135 y 141; [ADR-0025](../adr/0025-avatares-por-piezas-contrato-v2.md), contrato [avatares](../../contratos/avatares.md) §9).

### Qué hay
- **Contrato v2** (`contratos/avatares.schema.json`, `oneOf` v1/v2; ejemplo sintético `contratos/avatares-v2-ejemplo.json`): `cuerpos[]` (edad, complexión, **`ofrecer`**: los peques, `false`), `piezas[]` (pelo, vello, ropa, accesorio; `malla` = `pieza_<id>`), `paletas` (piel 10, ropa 10, pelo 8 con canoso y blanco), `topes_combinacion` y, opcionales, los avatares cerrados de v1. **Receta** = campos opcionales del `avatar` de presencia (`cuerpo`, `pelo`, `pelo_color`, `vello`, `ropa`, `acc`), ≤ 200 bytes (la api lo comprueba; sin migración: va en la columna `aspecto`). Un cliente v1 ve el v2 como «sin catálogo» y dibuja el muñeco.
- **Un VRM por cuerpo con todas sus piezas dentro**, hechas por `cuerpos.py` a partir de las ayudas de MakeHuman (CC0, del núcleo): `helper-hair` (pelo), `helper-tights` (ropa de faena), la piel copiada (vello) y primitivas de Blender (sombreros). Cada pieza, pesada al mismo esqueleto. Lo construye `tuberia/avatares/creador/catalogo.mjs` (tubería de siempre + medida del avatar completo).
- **Piezas mínimas:** peinados **rapado, corto, afro o rizado, recogido (moño) y largo** (canoso y blanco son colores); vello **barba corta y bigote** (para cualquier cuerpo); **ropa de faena** (camisa de manga larga y pantalón largo; tapa la ropa base, que entonces no se dibuja); **sombrero de paja y gorra** (el `sombrero` de siempre del muñeco enseña el suyo). Ninguna pieza tiene compatibilidad por sexo (C4, C5).
- **Motor** (`26b_avatares.js`): de cerca, el cuerpo de la receta con sus piezas, **teñido por nombre de material** (`piel`, `ropa_base`, `ropa_abajo`, `pelo`, `sombrero`) con los colores del muñeco, a su tamaño real × la altura; los peques no se dibujan; **con silla de ruedas, sentado** como en el quad, en la silla del muñeco. Sin receta válida, el `vrm` de antes; sin él, el muñeco.
- **Mirada:** los cuerpos **no tienen huesos de ojos** (el esqueleto `game_engine` de MPFB no los trae) y los ojos son una malla oscura de un solo color: girarlos no se vería. `mirada: "ninguna"` en el catálogo y 26b no gasta `VRMLookAt` con ellos; la mirada va con la cabeza (el giro de la pose). Para tenerla haría falta añadir dos huesos y ojos con blanco e iris (anotado, no hecho).
- **Portada:** pantalla por piezas (cuerpo: edad joven/adulta/mayor, complexión y altura; piel; pelo y cara; ropa; sombrero; cómo te mueves), **sin «hombre/mujer» en ningún paso** y sin peques; **«Empieza por algo parecido»** (seis puntos de partida descritos por lo que se ve, que no tocan el tono de piel); «Al azar» que no sortea edad, cuerpo ni apoyo; vista **de cerca** (el VRM real con three-vrm, con sus piezas y colores: `vista3d.js`) y **de lejos** (el muñeco en SVG, como te verán a distancia); descripción en texto (`aria-live`). Lo puro en `apps/web/portada/receta.js` (import() al abrir la pantalla). Guarda con `PUT /api/yo/avatar`.

### Arreglos de los cuerpos (decisión 141)
- **Cuello:** AV3 lo cortaba con planos rectos y clasificaba los triángulos del hombro por su centro: quedaba una escalera de cerca. Ahora el escote son **tres planos** (uno inclinado, más bajo delante, y dos laterales que suben hacia los hombros) y la malla se corta por los tres: el borde es limpio. Ver `cuello.png`.
- **«Mayor»:** edad de MPFB 0,97 (≈ 85 años; antes 0,88) y una **postura** leve fijada en el reposo (espalda alta 0,14 rad, cuello 0,12, cabeza −0,18 para mirar al frente): la cabeza va ≈ 7,6 cm más adelante y la altura baja de 1,66 a 1,62 m (adulta y mayor de complexión media). Ver `mayor-adulta.png`.

### Cifras (medidas el 2026-10-30, `comprueba.mjs`: tubería v2 con cuantización + three-vrm 3.5.5 en Node)
Los doce **pasan la tubería y three-vrm los carga** (huesos, `blink`/`aa`, brazo desde la T, cada pieza un nodo con piel).

| | Cuerpo solo | Avatar completo (peor caso) | Fichero | Tras gzip |
|---|---|---|---|---|
| 12 cuerpos | 10.098-10.406 triángulos, 4 primitivas (piel, ropa_base, ropa_abajo, ojos) | 11.422-11.782 triángulos, **7 primitivas** (cuerpo 4 + pelo + vello + sombrero; la ropa de faena sustituye a la base) | 633-652 kB, 6 materiales, 0 texturas | 259-268 kB |

| Pieza | Triángulos (máx.) | | Pieza | Triángulos (máx.) |
|---|---|---|---|---|
| pelo-rapado / corto / afro | 932 | | ropa-faena | 2.521 |
| pelo-recogido | 1.100 | | vello-barba | 427 |
| pelo-largo | 1.420 | | sombrero-paja / gorra | 136 / 124 |

- **Presupuesto (`topes_combinacion`): ≤ 15.000 triángulos y ≤ 7 primitivas por avatar completo.** En el Quest (26b, 3 VRM a la vez): ≤ 35 k triángulos y 21 llamadas, frente a los 61 k y 12 llamadas que estimaba ADR-0020 §5 para avatares cerrados de 4 materiales: **menos triángulos y más llamadas**. Sin texturas (memoria de GPU solo de geometría). Recuento, no fps: **en el Quest, no medido.**
- **El bigote no se ofrece:** sale de 18-82 triángulos y en las capturas apenas se ve. Va dentro del VRM pero `catalogo.mjs` lo retiene (`RETENIDAS`); queda por rehacer.
- **A revisar a ojo (decisión 130):** el afro sale con la silueta algo picuda en los bordes bajos; el largo, al despejar la frente, queda como dos mechones a los lados delante (detrás sí cae a media espalda); el corto y el rapado se parecen de frente (el corto es 1,2 cm más ancho); el sombrero de paja flota un poco sobre el pelo; con afro o moño el sombrero se cruza.

**Medida en Chrome por el banco** (SwiftShader, recuentos y no fps; `avatares_piezas.test.js` con `GEMELO_AVATARES_CUERPOS`): `?presencia=sim&n=20&vrm=1&yo=no` sobre el Cerro del fixture, cámara a 9 m. Solo muñeco: 24 llamadas y 73.822 triángulos en toda la escena; con los cuerpos (6 VRM, el cupo de escritorio): **61 llamadas y 140.052 triángulos** (82 geometrías, 51 texturas de la escena). Por avatar completo, lo que cuenta 26b: **6-7 llamadas y 10.545-11.573 triángulos**; uno de los seis, sentado en su silla. Capturas en `pruebas/salida/capturas-avatares-piezas/` (`piezas20.png`, `muneco20.png`, `portada-cerca-*.png`, `portada-lejos-*.png`, `medida.json`).

**Nota de comodidad (regla 11).** Probado: la pantalla de elección en Chrome sin pantalla a 1280 y 390 px (sin desbordar, radios de ≥ 44 px dentro de su `<label>`, foco visible, descripción en texto `aria-live`, guardado y lectura de vuelta con una api de mentira que valida con `limpiaAspecto` de la api de verdad), y la presencia simulada con los cuerpos. **No probado:** iPhone, Quest, una pantalla real a ojo, ni la portada con lector de pantalla; la vista previa 3D es pequeña (160 × 200 px) y en el Quest su coste de compilar MToon/PBR al cambiar de cuerpo no se ha medido; el cambio de pieza en la vista previa no recarga el fichero (solo se ocultan y tiñen mallas), pero cambiar de edad o complexión sí baja otro VRM (≈ 260 kB con gzip). En VR uno mismo sigue viendo solo sus manos (ADR-0020 §7).

### Capturas
En `pruebas/salida/capturas-avatares-cuerpos/` (no se versionan): `frente.png` y `tres-cuartos.png` (los 12 con recetas distintas), `peinados.png`, `peinados-detras.png`, `cabezas.png` (las diez piezas de cerca) y `cabeza-*.png`/`lado-*.png`, `cuello.png` y `cuello-tres-cuartos.png` (la costura), `mayor-adulta.png` y `mayor-adulta-cabeza.png` (de perfil) y `cara-<edad>.png`. Workbench, sin sombras (el brazo en T dejaba una raya).

### Cómo se regenera
```
node pruebas/banco/proceso.js --que "AV4 cuerpos" -- blender --background --python-exit-code 1 --python tuberia/avatares/creador/cuerpos.py -- --salida <fuera del repo>
node pruebas/banco/proceso.js --que "AV4 capturas" -- blender --background --python-exit-code 1 --python tuberia/avatares/creador/capturas.py -- --origen <la misma> --salida pruebas/salida/capturas-avatares-cuerpos
node tuberia/avatares/creador/comprueba.mjs --origen <la misma>            # tabla y three-vrm
node tuberia/avatares/creador/catalogo.mjs --origen <la misma> --salida <GEMELO_AVATARES> [--provisionales <los CC0>]
```

### Lo que no está probado (AV4)
- **El acabado no lo ha revisado una persona** (decisión 130): pelo, vello, ropa y sombreros, con las capturas.
- Nada en iPhone, Quest ni una GPU de verdad; el cuerpo sentado en la silla del muñeco solo se ha visto en recuento (no a ojo de cerca); el vello no sigue la boca al abrirse (`aa`); la portada con el VRM real, solo en Chrome sin pantalla.
