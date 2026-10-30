# Eventos del motor (`Bus`, versión 1)

Los componentes del motor ([ADR-0023](../doc/adr/0023-componentes-del-mundo.md), [COMPONENTES](../doc/sistema/COMPONENTES.md)) no se llaman por su nombre: se hablan por el **bus de eventos** del núcleo (`apps/web/motor/02c_componentes.js`). Catálogo: [`eventos.json`](eventos.json); su forma: [`eventos.schema.json`](eventos.schema.json).

## Cómo se usa

- `Bus.emite("dominio:accion", datos)` avisa a quien escuche (devuelve cuántos); `Bus.on("dominio:accion", fn)` escucha y devuelve la función para dejar de escuchar; `Bus.hay(evento)` dice si alguien escucha (para no enseñar un botón que nadie atiende).
- Dentro de un componente, `n.on(evento, fn)` (el contexto que recibe `monta`) escucha y **se suelta solo** al liberarlo; `n.emite` es `Bus.emite`.
- Un oyente que falla no rompe a los demás (se dice en la consola).
- Nombres `dominio:accion`, en minúsculas. Los datos, si los hay, cumplen el esquema `datos` del catálogo.

## Reglas (las vigila `pruebas/guardianes/componentes.test.js`)

1. Todo evento que el código emite o escucha (`Bus.emite`, `Bus.on`, `n.emite`, `n.on`) está en el catálogo, con quién lo emite y quién lo escucha **exactamente** como en el código.
2. Ningún evento se escucha sin que nadie lo emita.
3. El manifiesto de cada componente (`eventos: { escucha, emite }`) dice lo mismo que su código.

## Catálogo de hoy

| Evento | Datos | Emite | Escucha |
|---|---|---|---|
| `audio:desbloquea` | — | `29_vr` (al pulsar «Entrar en VR»: el gesto que deja arrancar el audio) | `20_sonido` |
| `componentes:cambia` | `{ id, activo }` | `02c_componentes` (al montar o liberar un componente) | `15_tiempo` (esconde «Ver la previsión en el mundo» si nadie la atiende) |
| `juego:ofrece` | `{ id, titulo, descripcion?, ayuda?, vr?, crea }` (`vr: { botones, palanca, ayuda? }` si sabe jugarse en VR, C9b) | `41_cae_la_cosecha` (al montarse y al oír `juego:pide`) | `40_juegos` (el anfitrión: lo pone en la ventana Juegos) |
| `juego:pide` | — | `40_juegos` (al montarse) | `41_cae_la_cosecha` |
| `juego:retira` | `{ id }` | `41_cae_la_cosecha` (al liberarse) | `40_juegos` (lo quita y, si estaba abierto, lo cierra) |
| `mundo:pausa` | `{ activa }` | `02c_componentes` (`Pausa.pon` / `Pausa.quita`) | (nadie todavía) |
| `prevision:alterna` | `{ abre? }` | `15_tiempo` (botón de la ventana Tiempo) | `35_fichas_tiempo` (la lámina de la previsión) |
| `sonido:baliza` | `{ completa? }` | `19_balizas` (al llegar a una baliza) | `20_sonido` (campanilla o arpegio) |
| `sonido:golpe` | — | `24_pantalla` (el aterrizaje del paseo) | `20_sonido` |
| `sonido:juego` | `{ que, cadena? }` | `41_cae_la_cosecha` | `20_sonido` (notas cortas sintetizadas) |
| `sonido:ladrido` | `{ grave? }` | `25_perros` | `20_sonido` |
| `usable:cerca` | `{ id \| null }` | `02e_entidades` (`Usables.actualiza`, al pasear: cambia lo más cercano dentro de su radio) | (nadie todavía: `19_balizas` lo lee con `Usables.cercano()`) |
| `usable:elige` | `{ id, tipo, como }` | `02e_entidades` (toque, clic, rayo y gatillo, tecla) | (nadie todavía) |
| `usable:suelta` | `{ id, motivo }` | `02e_entidades` | (nadie todavía) |
| `usable:usa` | `{ id, accion }` | `02e_entidades` (una acción de la ficha: «Ir a esta baliza», «Ir con») | (nadie todavía) |
| `vr:entra` | — | `29_vr` | `40_juegos` (cierra el juego abierto: en VR no hay juegos hasta C9b) |
| `vr:sale` | — | `29_vr` | `02d_laminas` (cierra las láminas de VR), `40_juegos` (cierra el juego en lámina) |

Lo que aún va por `CustomEvent` en `document` (`gemelo:chat` de `31_hud.js`, que hoy no escucha ningún módulo del motor) pasará al bus cuando se migre la presencia (C5).
