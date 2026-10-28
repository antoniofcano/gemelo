# Contribuir

Todo el método de trabajo está en [CLAUDE.md](CLAUDE.md) (reglas de oro, mapa del repo, comandos). Lo mínimo:

1. Rama desde `main`: `feat/*`, `fix/*` o `doc/*`.
2. Cambio pequeño y coherente. Si toca el motor, mide antes y después ([skill `medir`](.claude/skills/medir/SKILL.md)).
3. Pasa la puerta en local antes de cada commit: la lista está en un solo sitio, [doc/operacion/ONBOARDING.md](doc/operacion/ONBOARDING.md#la-puerta).
4. Documentación en el mismo commit y solo la afectada (CHANGELOG en «No publicado», ADR si hubo decisión, contrato si cambia una interfaz).
5. Commits en español, en imperativo y con el porqué (`feat:`, `fix:`, `doc:`, `chore:`). Si lo genera un agente, termina con su línea `Co-Authored-By:`.
6. No se suben datos (LiDAR, ortofoto, teselas, datos de la explotación), claves ni rutas locales: el repo es público.
7. Publicar, etiquetar o hacer `push` lo decide la persona, no el agente.
