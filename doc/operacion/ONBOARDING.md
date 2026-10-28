# Alta desde cero y la puerta

## 1. Requisitos
- Node ≥ 24 (`.nvmrc`), Python ≥ 3.10 (probado con 3.14), Chrome (ruta por defecto `C:/Program Files/Google/Chrome/Application/chrome.exe`; otra con la variable `CHROME`).
- `npm i` (solo `playwright-core`). Para **regenerar datos reales** además `pip install -r requirements.txt` y las fuentes descargadas ([DATOS.md](DATOS.md)); para la puerta no hace falta.

## 2. Primer vistazo
1. Lee [CLAUDE.md](../../CLAUDE.md) (reglas de oro) y [ESTADO.md](../ESTADO.md).
2. `npm run fixture` genera (si falta) el fixture sintético; `npm run puerta` debe salir en verde.
3. Mira una página montada: `python montar_v2.py --datos pruebas/fixture/cerro/embebido.json --salida pruebas/salida/cerro.html`, `python -m http.server 8000` y abre `http://localhost:8000/pruebas/salida/cerro.html?debug`.

## 3. La puerta
<a id="la-puerta"></a>

**Esta es la única lista de la puerta.** CLAUDE.md, CONTRIBUTING y las skills remiten aquí; no la copian. Comando: `npm run puerta` (equivale a `node --test pruebas/guardianes/`).

| # | Comprobación | Guardián |
|---|---|---|
| 1 | `node --check` de cada módulo de `src/` | `sintaxis.test.js` |
| 2 | Sin marcas de conflicto, sin CRLF, sin rutas locales ni correos en lo versionado | `higiene.test.js` |
| 3 | `VERSION`, `package.json`, CHANGELOG, CLAUDE.md, README y ESTADO dicen la misma versión | `version.test.js` |
| 4 | Documentación: enlaces relativos, índices (ADR, doc/README), techos, `historico/` con «foto» | `documentacion.test.js` |
| 5 | Contratos coinciden con el fixture y con lo que `src/` expone | `contratos.test.js` |
| 6 | Build de las dos fincas desde el fixture (Cerro embebido, Hituelo ficheros) | `build.test.js` |
| 7 | Carga en Chrome headless: 0 errores de consola y presupuesto de dibujo bajo `pruebas/presupuesto.json` | `carga.test.js` |
| 8 | Sin secretos, ni datos de la explotación, ni ficheros pesados versionados | `secretos.test.js` |

**Duración medida:** _pendiente de medir al cerrar el bloque de guardianes_ (se anota aquí, con fecha y máquina).

Si falla una comprobación, [TESTING.md](TESTING.md) dice qué significa cada rojo y cómo se arregla. Una prueba que no se puede ejecutar (p. ej. sin Chrome) **se salta con aviso explícito, no pasa en silencio**.

## 4. Flujo de trabajo
Rama → cambio pequeño con su comprobación → puerta → documentación afectada → commit en español con `Co-Authored-By`. Publicar, etiquetar y `push` los decide la persona.
