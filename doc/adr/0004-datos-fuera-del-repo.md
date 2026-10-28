# ADR-0004 — Los datos no se versionan

- **Estado:** Aceptado
- **Fecha:** 2026-10-28

## Contexto
Teselas, nubes, ortofoto y marcas pesan cientos de MB; parte son de uso interno de la explotación; las fuentes del IGN hay que descargarlas. El repo es público.

## Decisión
El repo contiene el motor, los exportadores y la documentación; **no** contiene datos, claves, rutas locales ni datos de la explotación (`.gitignore` excluye `salida/`, `publicar/`, `*.laz`, `*.tif`, `*.npz`, `t/`, `*.jpg`, `*.html`…). Las fuentes se documentan con licencia y atribución. Las pruebas usan un **fixture sintético** versionado.

## Alternativas consideradas
- **Git LFS / repo privado de datos** — coste y complejidad sin necesidad actual.
- **Versionar solo Cerro** — contiene marcas de OlivarTrack (uso interno).

## Consecuencias
- **Positivas:** repo ligero y publicable; sin fugas de datos de la explotación.
- **Negativas / coste:** reproducir una finca exige descargar y procesar; un intermedio de Cerro (`datos_cerro_embebido.json`) no tiene script de origen en el repo (D5); las pruebas reales necesitan datos locales.
- **Debilidad conocida:** `doc/historico/DISENO-2026-10.md` contiene cifras reales de las fincas (decisión de Antonio abierta).

## Comprobación
`secretos.test.js` escanea ficheros versionados (claves, rutas, correos, ids de artefactos, extensiones pesadas).
