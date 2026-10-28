---
name: documentalista
description: Revisa el orden y la actualidad de la documentación del repo (ESTADO contra git, No publicado contra los commits, índices, contratos contra el código, informes por archivar) y arregla lo mecánico. Úsala antes de cada release, tras una tanda de trabajo, o cuando se pida ordenar la documentación.
---

# Documentalista

Aplica la regla 8 de [CLAUDE.md](../../../CLAUDE.md) (documentación en el mismo commit, solo la afectada). Si discrepa, manda CLAUDE.md. **Nunca afirmes estado de producción o de dispositivos sin medirlo**: el repo dice lo que se escribió, no lo que pasó en un iPhone o un Quest.

## El mapa (dónde va un documento nuevo)
Primero: ¿es vivo o es la foto de un día? Si es una foto → `doc/historico/` con la línea «foto, no se mantiene». Si es vivo, la carpeta se elige por la pregunta que contesta: `rumbo/` (¿hacia dónde?), `adr/` (¿qué se decidió?), `sistema/` (¿cómo es?), `operacion/` (¿cómo se opera?). En la raíz de `doc/` solo `README.md` y `ESTADO.md`. Todo fichero nuevo lleva su línea en `doc/README.md`.

## La revisión (en este orden)
1. **Guardianes:** `npm run puerta`. Un rojo es el primer hallazgo.
2. **ESTADO contra git:** `git log --oneline` desde el último cambio de ESTADO; ¿«Al día a» al día?, ¿versión coherente con `VERSION`?, ¿pendientes que ya se hicieron?, ¿riesgos resueltos? Lo hecho sale de ESTADO y se cuenta en el CHANGELOG.
3. **«No publicado» contra los commits:** cada commit con efecto visible tiene su línea; no hay líneas de cosas que no están.
4. **Índices:** `doc/adr/README.md` (una fila por ADR, estado coincidente), `doc/README.md` (todo lo vivo enlazado), tabla de skills de CLAUDE.md contra `.claude/skills/`.
5. **Contratos contra el código:** `node pruebas/contrato_modulos.js --comprueba` (cabeceras); `contratos/interfaces.json` y `doc/sistema/CONTRATOS.md` frente a `src/`; esquemas frente a lo que escriben `finca_8_teselas.py` y `hituelo_conv.py`.
6. **PLAN y DECISIONS-PENDING:** iniciativas con su estado real; decisiones ya tomadas → ADR y fuera de la lista.
7. **Informes por archivar:** todo documento que describa «lo que se hizo un día» y no se mantenga → `git mv` a `doc/historico/` con la línea «🗄️ Informe del AAAA-MM-DD: foto de ese momento, no se mantiene. Lo vigente: <enlaces>».
8. **MEDIDAS:** ¿alguna cifra de `doc/sistema/MEDIDAS.md` es anterior a un cambio gráfico que la invalida? Marcarlo; no re-medir sin la skill `medir`.
9. **Privacidad del repo público:** ids, enlaces de artefactos, cifras de la explotación nuevas (guardián `secretos`).
10. **Lo vivo que envejece:** `git log -1 --format=%cs -- <fichero>` frente a lo que cambió en `src/` o en los exportadores.

## Qué arregla sola
Enlaces rotos, filas de índice que faltan, ficheros fuera de su carpeta (`git mv` + enlaces), archivar fotos, ESTADO con hechos de git (versión, «Al día a»), líneas de CHANGELOG evidentes.

## Qué pregunta antes
Todo lo que afirme estado de producción o de dispositivos; borrar un documento; cambiar una regla de oro; reescribir un ADR; fechas comprometidas; cualquier decisión que sea de Antonio (licencia, qué se publica, cifras de la explotación).

## Informe final
Tres bloques: ✅ **En orden** · 🔧 **Arreglado** (con commit) · ❓ **Para decidir** (con quién decide). Nunca publica, etiqueta ni hace `push`.
