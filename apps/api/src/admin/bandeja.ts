// Lo que la bandeja de la oficina (OF4, doc/sistema/OFICINA.md §5) necesita además de las rutas de V3 (`GET /api/admin/bandeja`,
// `POST /api/admin/bandeja/:id/estado` y `POST /api/admin/personalizaciones/:id/retirar`, en vida/rutas.ts). Todas con la guarda de oficina:
//   GET  /api/admin/bandeja/resumen                  lo pendiente, para el contador de la barra lateral
//   POST /api/admin/personalizaciones/:id/restaurar  deshace «retirar»: el contenido vuelve a verse (y el hogar lo sabe)
//   GET  /api/admin/preguntas                        preguntas de las familias sobre su haza (con o sin respuesta)
//   POST /api/admin/preguntas/:id/responder          la respuesta, que la familia ve en su haza (y un aviso)
//   POST /api/admin/hogares/:id/avisos               avisar a una familia (aviso de V3, tipo «sistema»)
// Los textos que escriben las familias salen tal cual, como dato: la oficina los pinta con textContent y nunca los interpreta.
import type { FastifyInstance } from "fastify";
import { audita } from "../auth/servicio.ts";
import { enTransaccion } from "../bd/pool.ts";
import type { Contexto } from "../contexto.ts";
import { OFICINA } from "../oficina/acceso.ts";
import { limpia } from "../vida/filtro.ts";

const ID = { type: "object", additionalProperties: false, required: ["id"], properties: { id: { type: "integer", minimum: 1, maximum: 9007199254740991 } } } as const;
/** Una línea o varias, pero sin caracteres de control salvo el salto de línea. */
const TEXTO_LIBRE = (min: number, max: number) => ({ type: "string", minLength: min, maxLength: max, pattern: "^[^\\u0000-\\u0008\\u000b-\\u001f\\u007f]*$" }) as const;

export async function rutasBandeja(app: FastifyInstance, ctx: Contexto): Promise<void> {
  const { bd } = ctx;

  app.get("/api/admin/bandeja/resumen", { preHandler: OFICINA }, async (_req, rep) => {
    const [b, p] = await Promise.all([
      bd.query<{ tipo: string; n: number }>("SELECT tipo, count(*)::int AS n FROM bandeja WHERE estado = 'nueva' GROUP BY tipo"),
      bd.query<{ n: number }>("SELECT count(*)::int AS n FROM preguntas WHERE respuesta IS NULL"),
    ]);
    const por = (t: string) => b.rows.find(f => f.tipo === t)?.n ?? 0;
    const nuevas = { contenido_nuevo: por("contenido_nuevo"), sugerencia: por("sugerencia"), denuncia: por("denuncia") };
    const preguntas = p.rows[0]?.n ?? 0;
    rep.header("cache-control", "no-store");
    return { pendientes: nuevas.contenido_nuevo + nuevas.sugerencia + nuevas.denuncia + preguntas, nuevas, preguntas_sin_responder: preguntas };
  });

  // Deshacer «retirar» (decisión 93: se puede deshacer; queda en la auditoría). Las denuncias que se resolvieron como «retirado» se quedan
  // así (es su historia); el hogar recibe un segundo aviso para que no se quede con el primero.
  app.post<{ Params: { id: number } }>("/api/admin/personalizaciones/:id/restaurar", { preHandler: OFICINA, schema: { params: ID } }, async (req, rep) => {
    const yo = req.session.hogarId!;
    try {
      const r = await enTransaccion(bd, async c => {
        const p = (await c.query<{ id: number; hogar_id: number; haza_id: number }>(
          `UPDATE personalizaciones SET estado = 'visible', retirada_en = NULL, retirada_por = NULL, motivo_retirada = NULL
            WHERE id = $1 AND estado = 'retirado' RETURNING id, hogar_id, haza_id`, [req.params.id])).rows[0];
        if (!p) return 404;
        const aviso = (await c.query<{ id: number }>(
          "INSERT INTO avisos (tipo, titulo, texto, haza_id, autor_id) VALUES ('contenido', 'Lo que colgaste en un olivo vuelve a verse', 'La oficina lo había retirado y lo ha vuelto a mostrar.', $1, $2) RETURNING id",
          [p.haza_id, yo])).rows[0]!.id;
        await c.query("INSERT INTO avisos_hogar (aviso_id, hogar_id) VALUES ($1, $2)", [aviso, p.hogar_id]);
        await audita(c, yo, "admin.contenido_restaurado", { personalizacion: p.id });
        return 204;
      });
      return r === 204 ? rep.code(204).send() : rep.code(404).send({ error: "no_existe", mensaje: "Ese contenido no está retirado." });
    } catch (e) {
      const codigo = (e as { code?: string }).code;
      // 23505: la familia ya puso otro nombre o foto en ese olivo; 23514: la foto ya no existe (se borró con la retención)
      if (codigo === "23505") return rep.code(409).send({ error: "ya_hay_otro", mensaje: "Esa familia ya ha puesto otra cosa en ese olivo: no se puede recuperar la anterior." });
      if (codigo === "23514") return rep.code(409).send({ error: "no_recuperable", mensaje: "El contenido ya no se puede recuperar (la foto se borró)." });
      throw e;
    }
  });

  app.get<{ Querystring: { sin_responder?: boolean; limite?: number } }>("/api/admin/preguntas", {
    preHandler: OFICINA,
    schema: { querystring: { type: "object", additionalProperties: false, properties: { sin_responder: { type: "boolean" }, limite: { type: "integer", minimum: 1, maximum: 500 } } } },
  }, async (req, rep) => {
    const r = await bd.query(
      `SELECT q.id, q.hogar_id, g.alias AS hogar_alias, q.haza_id, hz.codigo AS haza_codigo, q.texto, q.creada_en, q.respuesta, q.respondida_en
         FROM preguntas q LEFT JOIN hogares g ON g.id = q.hogar_id LEFT JOIN hazas hz ON hz.id = q.haza_id
        WHERE ($1::boolean IS NOT TRUE OR q.respuesta IS NULL) ORDER BY q.id DESC LIMIT $2`, [req.query.sin_responder ?? null, req.query.limite ?? 100]);
    rep.header("cache-control", "no-store");
    return {
      preguntas: r.rows.map(f => ({
        id: Number(f.id), hogar_id: Number(f.hogar_id), hogar_alias: f.hogar_alias, haza: f.haza_id === null ? null : { id: Number(f.haza_id), codigo: f.haza_codigo },
        texto: f.texto, creada_en: f.creada_en, respuesta: f.respuesta, respondida_en: f.respondida_en,
      })),
    };
  });

  app.post<{ Params: { id: number }; Body: { respuesta: string } }>("/api/admin/preguntas/:id/responder", {
    preHandler: OFICINA,
    schema: { params: ID, body: { type: "object", additionalProperties: false, required: ["respuesta"], properties: { respuesta: TEXTO_LIBRE(1, 4000) } } },
  }, async (req, rep) => {
    const respuesta = req.body.respuesta.normalize("NFC").trim();
    if (!respuesta) return rep.code(400).send({ error: "entrada_no_valida", mensaje: "Escribe la respuesta." });
    const yo = req.session.hogarId!;
    const r = await enTransaccion(bd, async c => {
      const q = (await c.query<{ hogar_id: number; haza_id: number | null; respuesta: string | null }>(
        "SELECT hogar_id, haza_id, respuesta FROM preguntas WHERE id = $1 FOR UPDATE", [req.params.id])).rows[0];
      if (!q) return 404;
      if (q.respuesta !== null) return 409;
      await c.query("UPDATE preguntas SET respuesta = $2, respondida_en = now() WHERE id = $1", [req.params.id, respuesta]);
      const aviso = (await c.query<{ id: number }>(
        "INSERT INTO avisos (tipo, titulo, texto, haza_id, autor_id) VALUES ('sistema', 'La oficina ha respondido a tu pregunta', $1, $2, $3) RETURNING id",
        [respuesta.length > 300 ? respuesta.slice(0, 297) + "…" : respuesta, q.haza_id, yo])).rows[0]!.id;
      await c.query("INSERT INTO avisos_hogar (aviso_id, hogar_id) VALUES ($1, $2)", [aviso, q.hogar_id]);
      await audita(c, yo, "admin.pregunta_respondida", { pregunta: req.params.id });
      return 204;
    });
    if (r === 404) return rep.code(404).send({ error: "no_existe" });
    if (r === 409) return rep.code(409).send({ error: "ya_respondida", mensaje: "Esa pregunta ya tiene respuesta." });
    return rep.code(204).send();
  });

  app.post<{ Params: { id: number }; Body: { titulo: string; texto?: string } }>("/api/admin/hogares/:id/avisos", {
    preHandler: OFICINA,
    schema: {
      params: ID,
      body: { type: "object", additionalProperties: false, required: ["titulo"], properties: { titulo: { type: "string", minLength: 1, maxLength: 120, pattern: "^[^\\u0000-\\u001f\\u007f]*$" }, texto: TEXTO_LIBRE(1, 2000) } },
    },
  }, async (req, rep) => {
    const titulo = limpia(req.body.titulo), texto = req.body.texto?.normalize("NFC").trim() || null;
    if (!titulo) return rep.code(400).send({ error: "entrada_no_valida", mensaje: "Hace falta un título." });
    const yo = req.session.hogarId!;
    const r = await enTransaccion(bd, async c => {
      const h = await c.query("SELECT 1 FROM hogares WHERE id = $1 AND activo", [req.params.id]);
      if (!h.rowCount) return null;
      const id = (await c.query<{ id: number }>("INSERT INTO avisos (tipo, titulo, texto, autor_id) VALUES ('sistema', $1, $2, $3) RETURNING id", [titulo, texto, yo])).rows[0]!.id;
      await c.query("INSERT INTO avisos_hogar (aviso_id, hogar_id) VALUES ($1, $2)", [id, req.params.id]);
      await audita(c, yo, "admin.aviso_enviado", { aviso: id, hogar: req.params.id });
      return id;
    });
    return r === null ? rep.code(404).send({ error: "no_existe", mensaje: "Esa familia no existe o está de baja." }) : rep.code(201).send({ id: Number(r) });
  });
}
