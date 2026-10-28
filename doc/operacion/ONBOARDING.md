# Alta desde cero y la puerta

## 1. Requisitos
- Node ≥ 24 (`.nvmrc`), Python ≥ 3.10 (probado con 3.14), Chrome (ruta por defecto `C:/Program Files/Google/Chrome/Application/chrome.exe`; otra con la variable `CHROME`).
- `npm i` (solo `playwright-core`) y `cd apps/web && npm i` (Vite y three 0.128.0). Para **regenerar datos reales** además `pip install -r requirements.txt` y las fuentes descargadas ([DATOS.md](DATOS.md)); para la puerta no hace falta.

## 2. Primer vistazo
1. Lee [CLAUDE.md](../../CLAUDE.md) (reglas de oro) y [ESTADO.md](../ESTADO.md).
2. `npm run fixture` genera (si falta) el fixture sintético; `npm run puerta` debe salir en verde.
3. Mira una página montada: `python tuberia/salida_artefacto/montar_v2.py --datos pruebas/salida/fixture/cerro/embebido.json --salida pruebas/salida/cerro.html`, `python -m http.server 8000` y abre `http://localhost:8000/pruebas/salida/cerro.html?debug`.

## 3. La puerta
<a id="la-puerta"></a>

**Esta es la única lista de la puerta.** CLAUDE.md, CONTRIBUTING y las skills remiten aquí; no la copian. Comando: `npm run puerta` (equivale a `node --test "pruebas/guardianes/*.test.js"`).

| # | Comprobación | Guardián |
|---|---|---|
| 1 | Sintaxis: `node --check` del script montado (todos los `apps/web/motor/*.js` concatenados) y de cada módulo envuelto; `py_compile` de los `.py`; orden de montaje (`01_` primero, `99_` último) | `sintaxis.test.js` |
| 2 | Sin marcas de conflicto, sin CRLF, sin rutas locales ni correos en lo versionado | `higiene.test.js` |
| 3 | `VERSION`, `package.json`, CHANGELOG, CLAUDE.md, README y ESTADO dicen la misma versión | `version.test.js` |
| 4 | Documentación: enlaces relativos, índices (ADR, doc/README), techos, `historico/` con «foto» | `documentacion.test.js` |
| 5 | Contratos: el fixture cumple los esquemas, las interfaces devuelven los miembros declarados y las cabeceras «Expone / Consume» de `apps/web/motor/` están al día | `contratos.test.js` |
| 6 | Build de las dos fincas desde el fixture (Cerro embebido, Hituelo ficheros) y sus límites de publicación | `build.test.js` |
| 7 | Carga en Chrome headless: 0 errores de consola y presupuesto de dibujo bajo `pruebas/presupuesto.json` | `carga.test.js` |
| 8 | Sin secretos, ni datos de la explotación, ni ficheros pesados versionados | `secretos.test.js` |
| 9 | VR: sin WebXR no hay botón ni errores; con el mock, la prueba completa (**opcional**, `GEMELO_VR=1`) | `vr.test.js` |
| 10 | Cliente web: la entrada de Vite es la concatenación exacta, three 0.128.0, y la página empaquetada carga sin errores y dibuja lo mismo que la artefacto | `web.test.js` |
| 11 | Exportadores multiplataforma: ninguna ruta con separador `\` escrito a mano en `tuberia/**/*.py` (se arman con `os.path.join`) | `multiplataforma.test.js` |

En CI la misma puerta corre en GitHub Actions (`.github/workflows/puerta.yml`); no despliega nada.

**Duración medida (2026-10-28):** ≈ 2 min 30 s con `npm run puerta` (90 comprobaciones, 1 opcional saltada; las de navegador en serie, `--test-concurrency=1`, porque en paralelo se estorban; 2 fincas montadas y cargadas en Chrome 131 con SwiftShader; Windows 10, Node 24, Python 3.14). Casi todo es el arranque de Chrome y la carga del fixture; sin Chrome, esas dos comprobaciones se saltan con aviso y la puerta baja a unos segundos (pero entonces la carga **no** está comprobada).

Si falla una comprobación, [TESTING.md](TESTING.md) dice qué significa cada rojo y cómo se arregla. Una prueba que no se puede ejecutar (p. ej. sin Chrome) **se salta con aviso explícito, no pasa en silencio**.

## 4. Flujo de trabajo
Rama → cambio pequeño con su comprobación → puerta → documentación afectada → commit en español con `Co-Authored-By`. Publicar, etiquetar y `push` los decide la persona.
