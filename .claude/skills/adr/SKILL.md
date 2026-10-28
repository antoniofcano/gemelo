---
name: adr
description: Crea un ADR con el número correlativo siguiente, desde la plantilla, y lo añade al índice. Úsala cuando se tome una decisión de arquitectura con alternativas reales, al cerrar una decisión de DECISIONS-PENDING, o cuando una decisión nueva supere a un ADR anterior.
---

# Crear un ADR

Decisión con alternativas reales = ADR. Ante la duda, escríbelo. Reglas completas: [doc/adr/README.md](../../../doc/adr/README.md).

## Pasos
1. **Número siguiente.** Mira los ficheros de `doc/adr/NNNN-*.md`; el nuevo es el mayor + 1, con 4 dígitos. Nombre `NNNN-titulo-en-kebab-case.md`.
2. **Crear desde la plantilla** `doc/adr/_template.md` y rellenar: Estado (`Propuesto` si aún no hay luz verde de Antonio; `Aceptado` si ya está implementado o decidido), Fecha (hoy, `AAAA-MM-DD`), Contexto, Decisión (1–2 frases, en presente), Alternativas (con por qué se descartaron), Consecuencias (con el **coste**, no solo lo bueno) y **Comprobación** (cómo se sabe que se cumple y qué **no** está probado: iPhone, Quest, marco de artefactos…).
3. **Índice.** Añadir la fila `| [NNNN](fichero.md) | Título | Estado |` a `doc/adr/README.md`, en orden. El estado de la fila debe coincidir con el del ADR (lo vigila `documentacion.test.js`).
4. **Si cierra una decisión** de `doc/rumbo/DECISIONS-PENDING.md`: quitarla de la tabla (o marcarla ✅ con el enlace al ADR) y desbloquear la iniciativa en `doc/rumbo/PLAN.md`.
5. **Si supersede otro ADR:** el viejo pasa a `Superado por ADR-NNNN` (solo cambia su línea de Estado y se añade una enmienda fechada); el nuevo lo cita en su Contexto. Nunca se reescribe el cuerpo del viejo.
6. **Si cambia un contrato o una interfaz:** actualizar `doc/sistema/CONTRATOS.md`, el esquema de `contratos/` y el fixture en el mismo commit.
7. **CHANGELOG:** una línea en «No publicado» si el ADR acompaña un cambio con efecto.
8. `npm run puerta` en verde antes de confirmar.

## Estilo
Español, conciso y honesto: el coste y lo no probado van en el ADR. Enlaces relativos. Un ADR por decisión. Cifras con su fuente (`doc/sistema/MEDIDAS.md`) o marcadas **[SUPUESTO]**. Decisiones que son de Antonio (licencia, qué se publica, datos de la explotación) no se escriben como `Aceptado` sin su OK: van `Propuesto` y a DECISIONS-PENDING.
