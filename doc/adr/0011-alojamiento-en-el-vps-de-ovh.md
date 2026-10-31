# ADR-0011 — Alojamiento en el VPS de OVH como inquilino del borde

- **Estado:** Aceptado
- **Fecha:** 2026-10-28 (aprobado por Antonio con el plan multiusuario)
- **Enmendado por:** [ADR-0027](0027-livekit-en-produccion-puertos-publicados.md) (cómo se publica LiveKit)

## Contexto
Antonio decidió alojar el gemelo multiusuario en su VPS de OVH con el dominio `gemelo.canoydamas.es`. Ese VPS no está vacío: según la documentación de los proyectos hermanos (Vigía, ADR-0012 de su repo), Oficultor es el dueño del Caddy de borde y de los puertos 80/443, y Vigía vive como inquilina en su red. El repo decía «no hay servidor ni despliegue» (CLAUDE.md, PUBLICACION) y había descartado CI (PLAN).

## Decisión
El gemelo se despliega con Docker Compose en el VPS como **inquilino de la red `borde`**: no publica puertos web; el Caddy de Oficultor recibe un bloque de host **sin variables** que enruta `gemelo.canoydamas.es` al Caddy interno del gemelo. La excepción es LiveKit (fase 2), que necesita sus puertos UDP/TCP con reglas `ufw` explícitas. Imágenes construidas en CI (GitHub Actions) y despliegue **con aprobación manual** (regla 9), en la ventana de poco uso que acuerden los proyectos del VPS. La salida artefacto de claude.ai se conserva como demostración sin servidor.

## Alternativas consideradas
- **VPS propio solo para el gemelo** — otra factura y otra máquina que mantener.
- **Publicar el compose con sus propios 80/443** — rompería a Oficultor y a Vigía.
- **Supabase en la nube** — descartado por Antonio (datos fuera del VPS).

## Consecuencias
- **Positivas:** un solo dominio y TLS gestionado por el borde existente; despliegue repetible.
- **Negativas / coste:** dependencia del Caddy de Oficultor (un error allí tumba a todos); coordinación de ventanas y recursos (memoria y núcleos del VPS **[NO VERIFICADO]**); Docker se salta `ufw` con puertos publicados, por eso no se publica ninguno salvo LiveKit.
- **Supera:** «no hay servidor ni despliegue» (CLAUDE.md §4 y PUBLICACION) y el «🚫 CI en GitHub Actions» del PLAN. **Enmienda** [ADR-0008](0008-ficheros-de-apoyo-json-jpg.md): json/jpg sigue valiendo para la salida artefacto; el servidor usará el formato v3 binario (ADR propio en la fase 1a).

## Comprobación
Ninguna todavía (fase 0 no despliega). En la fase 1a: `infra/probar-caddy.sh` (cabeceras, redacción de tokens en logs) y un ensayo de restauración. Lo del VPS que dice este ADR viene de la documentación de los repos hermanos, **no** de inspeccionar la máquina.
