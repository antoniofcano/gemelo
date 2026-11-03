# Llaves de acceso: qué hacer cuando se pierde un aparato (guía para la oficina)

> Guía corta de OF13b-11. Describe lo que **hace el código** ([LLAVES-DE-ACCESO](../sistema/LLAVES-DE-ACCESO.md), [sesion.md](../../contratos/sesion.md)); **ningún paso se ha ensayado en el servidor ni con aparatos reales**. Los comandos de consola van con `<correo>` como marcador: los datos reales no se escriben en el repo. Procedimientos de servidor: [RUNBOOK-VPS](RUNBOOK-VPS.md) (paso 10b).

Idea de fondo: **el correo de la familia siempre sirve para entrar** (el enlace). Quitar una llave nunca deja a nadie fuera; solo deja sin uso ese aparato. En la oficina es distinto: la llave es obligatoria y el enlace solo no basta.

## 1. Una familia pierde el móvil o le roban un aparato

1. **Quitar sus llaves desde la oficina.** Familias → buscar la familia → su ficha → sección **«Llaves de acceso»** → **«Quitar esta llave»** (la del aparato perdido) o **«Quitar todas las llaves»** si no se sabe cuál. Pide confirmación reciente (la llave de quien actúa) y un motivo opcional que queda en la auditoría, sin datos personales.
2. Efecto (en el código): la llave queda revocada, **se cierran las sesiones abiertas con ella** y la familia recibe un correo que dice «la oficina ha quitado…» (sin decir quién). Si la oficina lee «El correo de aviso NO salió: avísale tú», hay que **llamarla**: el cambio está hecho igualmente.
3. **Sesiones sin llave** (abiertas por enlace en el aparato perdido): quitar la llave no las cierra. La familia puede cerrarlas sola con «Salir de todos» en *Mis dispositivos*, o la oficina revocar las sesiones de la cuenta desde su ficha. **Ojo:** «Salir de todos» **no quita las llaves**; el botón que hace las dos cosas juntas («Salir de todos y quitar las llaves») **no estaba hecho** al escribir esto: mira el estado en LLAVES-DE-ACCESO.
4. La familia entra con **el enlace de su correo** (portada → «Recibir un enlace por correo»). Si quiere, crea una llave nueva en su aparato nuevo (la portada se la ofrece tras el enlace).
5. Si el aparato robado estaba **desbloqueado**, mientras no se quite la llave quien lo tiene entra. Una llave **sincronizada** (iCloud, Google) vive en todos los aparatos de esa cuenta del proveedor: quitarla las corta todas; si además le han robado la cuenta de Google o Apple, eso lo resuelve la familia con su proveedor.

## 2. La oficina pierde su única llave

La llave de oficina es obligatoria; un enlace solo **no** añade otra a una cuenta que ya tuvo una.

- **Hay otro `admin`:** en Sistema, con la confirmación reciente de ese admin, **«Rehabilitar el alta»** de la cuenta afectada (vale 24 h; **nunca la propia**). La persona entra con un enlace desde un aparato aprobado y da de alta una llave nueva. Si la perdió por robo, el admin pide también revocar sus llaves (la cuenta recibe un correo que lo cuenta).
- **Es el único `admin`:** desde la consola del servidor, como en [RUNBOOK-VPS paso 10b](RUNBOOK-VPS.md): rehabilitar una hora (`UPDATE hogares SET llave_rehabilitada_hasta = now() + interval '1 hour' …` y la fila de auditoría) y entrar con un enlace en esa hora; si fue robo, revocar antes la llave (`UPDATE llaves_acceso SET revocada_en = now() …`). El texto exacto y la vuelta atrás están en el RUNBOOK; no se copian aquí para que haya un solo sitio. Hace falta además que el **aparato** esté aprobado (paso 10 del RUNBOOK si se perdieron todos).
- **Prevención:** **dos llaves por cuenta** de oficina (Sistema → Llaves de acceso → «Añadir otra llave»), en aparatos distintos.
- Un aparato nuevo de oficina queda **pendiente** aunque se tenga llave (la llave no aprueba aparatos): lo aprueba otro aparato ya aprobado, un segundo enlace pasados 5 minutos o la consola.

## 3. Qué decirle a la familia (para leer por teléfono) — [PROPUESTA] de texto

> «Hola, soy de la oficina del gemelo. Hemos quitado la llave del aparato que has perdido, así que con él ya no se puede entrar a tu cuenta. Tú no te quedas fuera: entra desde la portada, pulsa recibir un enlace por correo y escribe tu correo de siempre. Te llegará un mensaje; ábrelo en el aparato que vayas a usar. El enlace dura 15 minutos y sirve una sola vez; si no lo ves, mira en el correo no deseado. Cuando hayas entrado, la portada te preguntará si quieres crear una llave en ese aparato: di que sí si el aparato es solo tuyo, o que ahora no. También te habrá llegado un correo nuestro avisando de lo que hemos hecho; si hay algo que no reconoces, dínoslo.»

Si el correo no llega: la entrega del correo del servidor **no está verificada** (SMTP de OVH, DKIM/DMARC); no prometer nada ni cambiar el correo de una cuenta sin que lo decida Antonio.

## 4. Lo que no se sabe todavía

Todo lo anterior está probado **solo en Node**; faltan la integración con PostGIS y el recorrido en navegador (OF13b-9 y 10) y los aparatos reales (OF13b-12). Si algo de esta guía no coincide con lo que se ve en pantalla, se corrige aquí en el mismo commit.
