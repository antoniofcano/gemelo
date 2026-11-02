# ADR-0029 — Llaves de acceso para todos; el enlace por correo queda para el alta y la recuperación

- **Estado:** Propuesto
- **Fecha:** 2026-11-02

## Contexto
Hoy se entra con un **enlace mágico** por correo ([ADR-0013](0013-enlace-magico-y-sesiones.md)); la oficina, además, con un **aparato confiable** y, desde OF13, con una **llave de acceso** (WebAuthn) obligatoria ([ADR-0024](0024-la-oficina-roles-acceso-y-configuracion-versionada.md), decisiones 105, 151 y 152). Las gafas entran con un código corto ([ADR-0028](0028-gafas-vinculadas-desde-la-oficina-entran-como-visitante.md)).

El 2026-11-02, en la primera entrada real en el servidor, Antonio dijo «el login me parece horrible» (decisión 174). Lo que falla, con su causa en el código (detalle en [LLAVES-DE-ACCESO §2](../sistema/LLAVES-DE-ACCESO.md#2-qué-falla-hoy-en-el-login-real)):
- **429** a los tres enlaces por correo en 15 min (`GEMELO_ENLACE_POR_CORREO`); la oficina gasta dos la primera vez en cada aparato (aparato pendiente y segundo enlace pasados 5 min), y si uno tarda y se pide otro, se acaba el cupo.
- **Aparato pendiente** de la oficina hasta aprobarlo.
- **Correo mal tecleado**: la api responde igual exista o no la cuenta (a propósito), y quien se equivoca espera un correo que no llega.
- **Edge, Chrome, Windows Hello y el QR**: en Windows una llave puede guardarse en Windows Hello, en el gestor de Chrome, en el de Edge o en el teléfono por QR, y no todas se ven desde todos los navegadores **[SUPUESTO, por probar]**.
- **Enlaces que no llegan**: el SMTP de OVH y el DKIM/DMARC del dominio están sin verificar.

La regla 12 pide reusar: OF13 ya trae la tabla `llaves_oficina` (migraciones 0013 y 0015), los retos, la verificación con `@simplewebauthn/server` 14.0.3 y la página con `@simplewebauthn/browser` 14.0.0.

## Decisión
**Todas las cuentas pueden entrar con una llave de acceso** (passkey, credencial descubrible, verificación de la persona obligatoria) **sin escribir el correo**, desde una pantalla con «Entrar con mi llave» arriba y «Recibir un enlace por correo» debajo. El enlace queda para **el alta** (tras el primero se ofrece crear una llave en ese aparato) y **la recuperación**. Una sola tabla, `llaves_oficina` renombrada a `llaves_acceso`; las reglas cambian por tipo de cuenta:
- **familias:** el correo sigue siendo la raíz: una sesión de enlace puede añadir una llave aunque ya haya otras, con aviso por correo y la lista revocable en *Mis dispositivos*;
- **oficina:** llave + aparato ya aprobado = dentro, sin enlace; un aparato nuevo sigue pendiente (152) y el buzón solo nunca añade una llave a una cuenta que ya tuvo una (lo de OF13, sin cambios).

El texto de pedir enlace pasa a «Si ese correo tiene cuenta, te llegará un enlace» y ninguna respuesta revela si un correo existe. Diseño completo, amenazas y plan: [doc/sistema/LLAVES-DE-ACCESO.md](../sistema/LLAVES-DE-ACCESO.md).

## Alternativas consideradas
- **Solo enlace, con mejores textos y límites** — lo más barato (un día de trabajo) y sin riesgo nuevo, pero no quita la causa: cada entrada depende de que llegue un correo y de no pasarse del cupo. Se hace igualmente su parte de textos (OF13b-1), pero no basta.
- **Contraseña** — otra cosa que olvidar y que robar, *phishable*, y la recuperación sigue siendo el correo; ya descartada en ADR-0013. Para gente del campo con el móvil, peor que el enlace.
- **TOTP (app de códigos)** — un segundo factor, no un sustituto: sigue haciendo falta entrar por correo, y añade instalar una app y guardar un secreto compartido en el servidor. Sirve para alguien que no pueda usar llaves; no para todos.
- **Llaves solo para la oficina** (lo que hay con OF13) — protege lo que más vale, pero deja a las familias con el problema que vio Antonio. El código ya existe: extenderlo cuesta poco más que no hacerlo.
- **Llaves para todos sin enlace de recuperación** («solo con llave») — lo más seguro (el buzón deja de ser la raíz), pero quien pierde el móvil queda fuera hasta que la oficina lo restablezca a mano; con decenas de hogares es servicio técnico continuo. Puede ofrecerse más adelante como opción por hogar.
- **Llaves para todos con recuperación por enlace** (la elegida) — cómoda y resistente al *phishing* en el día a día; honesta en su límite: para una familia, quien controla el buzón puede añadir su llave, igual que hoy puede entrar.
- **Proveedor externo (Hanko, Auth0, Keycloak) o better-auth** — datos de los hogares en un tercero o un servicio más que operar; better-auth trae su esquema propio. `@simplewebauthn` ya está en el repo (ADR-0013 y regla 12).

## Consecuencias
- **Positivas:** se entra con huella, cara o PIN sin esperar correos ni escribir el correo; desaparecen casi todos los enlaces (y con ellos el 429 y la dependencia del SMTP en el día a día); la entrada con llave no se puede *phishear* ni sondear; la oficina entra sin enlace en sus aparatos aprobados; se reusa todo OF13.
- **Negativas / coste:**
  - **El techo de seguridad de una familia no sube**: sigue siendo su buzón (A2 del estudio). Se dice así a la familia y a la EIPD.
  - **Trabajo:** una migración (renombre con cambios en `llaves.ts`, `llaves_rutas.ts`, `almacen.ts`, pruebas, tres guardianes, contrato y RUNBOOK-VPS), dos rutas sin sesión con su cookie de reto, las rutas de *Mis dispositivos*, el correo de aviso, la portada y la oficina: unas 11 tareas atómicas (dos delicadas, con opus) y dos pruebas pesadas por el banco.
  - **Más superficie sin sesión:** dos rutas públicas (`/api/auth/llave/opciones` y `/api/auth/llave`) con sus límites.
  - **Llaves residentes obligatorias**: las llaves físicas viejas o sin PIN no valen; las de oficina ya creadas que no sean descubribles siguen por el camino de hoy (enlace y llave) hasta cambiarlas.
  - **Confusión de dónde se guarda la llave** (Windows Hello, el gestor de cada navegador, el teléfono): se mitiga con textos y nombres, no se elimina.
  - **El RP ID queda atado al host**: cambiar de dominio invalida todas las llaves (las familias vuelven por enlace; la oficina, por la consola).
  - **Más datos personales**: la lista de llaves de cada hogar (sin biometría ni modelo de aparato), que entra en la exportación, el borrado y la EIPD.
- **Implicaciones futuras:** una opción «solo con llave» por hogar; avisos de seguridad más finos; la API de señales de WebAuthn para esconder llaves borradas; si se añade un segundo dominio, *related origins* exigiría otro ADR.

## Comprobación
Cuando se implemente: unidad (reglas de `permisoAlta` por cuenta, respuestas simuladas contra la verificación real de `@simplewebauthn/server`), integración contra PostGIS por el banco (alta y entrada sin sesión, credencial de otra cuenta, `userHandle` cambiado, reto gastado o sin cookie, mismo 202 y 429 exista o no el correo, quitar una llave cierra sus sesiones, oficina con aparato aprobado y pendiente, el enlace de oficina no añade llave) y el recorrido en Chrome con el autenticador virtual de CDP. **No probado** (ni lo será sin aparatos): Windows Hello en Edge y en Chrome, los gestores de Google y Microsoft, iPhone y Mac con iCloud, Android, el teléfono por QR, llaves físicas, Firefox, gestores de terceros (1Password, Bitwarden), la mediación condicional en cada navegador, el navegador de las Quest y los lectores de pantalla. Este ADR pasa a **Aceptado** con el OK de Antonio a sus preguntas ([LLAVES-DE-ACCESO §8](../sistema/LLAVES-DE-ACCESO.md#8-preguntas-abiertas-para-antonio)).
