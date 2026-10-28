---
name: release
description: Saca una versión del gemelo (sube versión, baja el CHANGELOG, pasa la puerta, monta las dos fincas, comprueba a ojo, prepara el tag). Se activa con «sacar una release», «subir versión» o «etiquetar». NUNCA etiqueta, hace push ni publica sin confirmación explícita de Antonio.
---

# Release

Ejecuta el ritual de [CLAUDE.md §4](../../../CLAUDE.md); no lo redefine (si cambian, cambian a la vez). No hay despliegue de hosting: «publicar» es un artefacto de claude.ai o HTML estático ([PUBLICACION.md](../../../doc/operacion/PUBLICACION.md)) y es otra confirmación aparte.

## Pasos
0. **Prerrequisitos.** Árbol limpio en `main` (o en la rama de release), versión pedida por Antonio (SemVer; mientras sea prototipo 0.x). Pasar la skill `documentalista`. La puerta entera en verde en local: `npm run puerta` (lista en [ONBOARDING](../../../doc/operacion/ONBOARDING.md#la-puerta)); anotar cuánto tarda.
1. **Subir la versión** en `VERSION`, `package.json` y la línea «**Versión: vX.Y.Z**» de `CLAUDE.md`, `README.md` y `doc/ESTADO.md` (el guardián `version` falla si alguna difiere).
2. **CHANGELOG.** «[No publicado]» pasa a «[X.Y.Z] — AAAA-MM-DD» y se abre un «[No publicado]» nuevo y vacío.
3. **ESTADO.** Solo si cambia el estado (qué hay publicado, pendientes, riesgos); «Al día a» a hoy.
4. **Comprobación visual.** Montar las dos fincas con datos reales si están (`python tuberia/salida_artefacto/montar_v2.py --finca cerro`; `python tuberia/finca_8_teselas.py --finca hituelo` + `python tuberia/salida_artefacto/montar_v2.py --finca hituelo --modo ficheros`) y mirarlas con `?debug` a ojo: sin errores de consola, modos Nube/Gemelo/Ortofoto, paseo, minimapa. Medir con la skill `medir` si hubo cambios gráficos. **Lo que no se ha visto en iPhone o Quest se escribe como no probado.**
5. **Commit y tag.** `git add` con lista concreta de ficheros (nunca `git add -A`); commit `chore(release): X.Y.Z` con `Co-Authored-By`. **El tag (`git tag -a vX.Y.Z`) solo con confirmación.**
6. **Publicar (opcional y aparte).** Skill `publicar-artefacto`, con lista de ficheros y confirmación.
7. **`git push origin main --tags`** solo cuando Antonio lo diga.
8. **Verificar** que lo publicado es lo nuevo (versión/tamaño del artefacto leído de vuelta) y anotarlo en ESTADO.

## Nunca
Etiquetar, subir o publicar sin confirmación; saltarse la puerta; marcar «probado» lo que solo corrió en SwiftShader.
