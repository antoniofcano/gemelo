# Maqueta de UX · Cuarenta hazas

Maqueta interactiva de cómo se entra en el mundo y cómo se usa la web multiusuario. El diseño completo y sus razones están en [doc/sistema/UX.md](../../doc/sistema/UX.md).

**Es una maqueta:** no hay servidor, correo, voz, vídeo, WebXR ni permisos reales. **Todos los datos son ficticios** (alias, hazas, cifras, correos). La escena del mundo es un dibujo SVG, no el gemelo.

## Cómo abrirla
Un solo fichero, sin dependencias ni red: abre `prototipos/ux/index.html` con doble clic (o arrástralo a Chrome, Edge, Firefox o Safari). También funciona servido: `python -m http.server 8000` y `http://localhost:8000/prototipos/ux/`. Se puede entrar directo a una pantalla con `#nombre` (p. ej. `index.html#mundo`).

## Qué simula
Arriba hay una barra rayada, **«Simulador»**, que no es parte del producto:

| Control | Qué cambia |
|---|---|
| Dispositivo | Escritorio · móvil del hogar (marco de teléfono, barra inferior, cruceta) · Meta Quest (texto y botones más grandes, «Vincular», «Entrar en VR») · móvil corresponsal (pone el rol corresponsal) |
| Rol | Hogar · guía (abre la visita, modera) · corresponsal · administración (panel) |
| Ir a la pantalla | Salta a cualquiera de las 19 pantallas |
| Tema | Sistema · claro · oscuro |
| Enlace del correo | Válido · caducado · ya usado |
| Peticiones de enlace | Dentro del límite · límite superado |
| Cuenta | Primer acceso (normas, alias, avatar) · ya registrada |
| Micrófono | Se concede · se deniega · no hay |
| WebXR | Según dispositivo · disponible · no |
| Carga del mundo | Normal · falla una tesela · red lenta |
| Visitas guiadas | Hay · ninguna (estado vacío) |
| Sucesos | El guía cierra/abre los micros · empieza/para el vídeo de campo · llega un mensaje · se corta la conexión · reiniciar |

Flujo típico: **Portada → Entrar → correo de prueba (cualquiera con formato válido, p. ej. `prueba@example.com`) → «Entrar en Cuarenta hazas» en el correo simulado → normas → alias («Mirlo» está ocupado a propósito) → avatar → dispositivo → sonido y micro → visita → (sala de espera) → carga → mundo**.

En el mundo: **W A S D / flechas** para moverte (la cruceta en móvil), **H** haza, **T** chat, **P** gente, **V** hablar (en guiadas), **Esc** menú. Clic en una haza abre su ficha. La configuración de tamaño de texto, alto contraste y movimiento reducido se aplica de verdad a la maqueta.

## Qué no simula
- Ni el motor 3D ni su rendimiento; la escena es un SVG ilustrativo.
- Permisos reales del navegador (`getUserMedia`, `geolocation`, `wakeLock`) ni WebXR: los avisos del navegador son dibujos rotulados «simulación».
- Envío de correo, sesiones, límites, moderación en servidor, LiveKit, guardado de nada: al recargar se pierde todo.
- La lista definitiva de campos de una haza ajena, los textos legales ni la marca (decisiones abiertas en UX.md).

## Cómo se comprobó
Con Chrome headless (playwright-core del repo), un script recorre las 19 pantallas a 1280 × 800 y 390 × 844 y varios flujos (errores de correo, enlace caducado y usado, límite, alias ocupado, sin WebXR, micro denegado, aviso de vídeo, tutorial, voz, silencio del guía, chat, pausa, ajustes al 150 %, expulsión, carga con error en Quest, corresponsal): **0 errores de consola**, sin desbordamiento horizontal, todos los controles con nombre accesible. El script vive fuera del repo (no forma parte de la puerta). **No probado:** lectores de pantalla reales, auditor automático de accesibilidad, iPhone, Android y Meta Quest.
