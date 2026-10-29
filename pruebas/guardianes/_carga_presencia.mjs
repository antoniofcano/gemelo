// Clientes ligeros de carga para la presencia (P4), sin navegador: @livekit/rtc-node (el SDK oficial de LiveKit para Node),
// instalado en infra/dev/herramientas. Lo lanza presencia_dev.test.js, varios procesos a la vez (rtc-node con muchas salas en
// un solo proceso se volvía lento y llegó a perder un handle). Cada proceso:
//   1. conecta CARGA_N clientes (identidad carga_<i>) a CARGA_URL con tokens firmados con la clave de desarrollo y los
//      permisos del rol «hogar» de contratos/livekit-roles.json; dice {"evento":"conectados"} por la salida;
//   2. espera «empieza» por la entrada; publica la pose del contrato (24 B, códec del motor) cada 100 ms a toda la sala,
//      no fiable, tema «pose», durante CARGA_S segundos;
//   3. dice {"evento":"fin", enviados, recibidos, retardos} y sale. El reloj de la cabecera es el de pared del equipo
//      (performance.timeOrigin + now, módulo 2³²), el mismo para todos los procesos: el retardo es de extremo a extremo.
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const HERR = path.join(RAIZ, "infra", "dev", "herramientas");
const req = createRequire(path.join(HERR, "package.json"));
const { AccessToken } = req("livekit-server-sdk");
const rtc = await import(pathToFileURL(req.resolve("@livekit/rtc-node")).href);

const e = process.env, N = Number(e.CARGA_N), DESDE = Number(e.CARGA_DESDE || 0), S = Number(e.CARGA_S), SALA = e.CARGA_SALA;
const F = fs.readFileSync(path.join(RAIZ, "apps", "web", "motor", "26_presencia.js"), "utf8");
const { PoseCodec } = new Function("\"use strict\";\n" + F.slice(F.indexOf("// [puro:inicio]"), F.indexOf("// [puro:fin]")) + "\nreturn { PoseCodec: PoseCodec };")();
const ROL = JSON.parse(fs.readFileSync(path.join(RAIZ, "contratos", "livekit-roles.json"), "utf8")).roles.hogar;
const reloj = () => performance.timeOrigin + performance.now();
const di = o => process.stdout.write(JSON.stringify(o) + "\n");

const clientes = [], t0 = Date.now();
let medir = false;
for (let k = 0; k < N; k++) {
  const n = DESDE + k, id = "carga_" + String(n).padStart(2, "0");
  const at = new AccessToken(e.CARGA_CLAVE, e.CARGA_SECRETO, { identity: id, name: "Carga " + n, ttl: 900,
    metadata: JSON.stringify({ alias: "Carga " + n, avatar: { camisa: n % 8, sombrero: "paja", piel: n % 4 }, rol: "hogar", dispositivo: "escritorio" }) });
  at.addGrant({ room: SALA, ...ROL });
  const sala = new rtc.Room(), c = { sala, enviados: 0, recibidos: 0, ret: [], errores: 0 };
  sala.on(rtc.RoomEvent.DataReceived, (datos, _p, _k, tema) => {
    if (tema !== "pose" || !medir) return;
    c.recibidos++;
    const d = ((reloj() % 4294967296) - new DataView(datos.buffer, datos.byteOffset, datos.byteLength).getUint32(4, true) + 4294967296) % 4294967296;
    c.ret.push(Math.round((d > 2147483648 ? d - 4294967296 : d) * 10) / 10);   // con signo: el redondeo a ms del emisor puede dar −0,5 ms
  });
  try { await sala.connect(e.CARGA_URL, await at.toJwt(), { autoSubscribe: false, dynacast: false }); clientes.push(c); }
  catch (err) { di({ evento: "fallo", id, error: String(err.message || err).slice(0, 200) }); }
}
di({ evento: "conectados", n: clientes.length, ms: Date.now() - t0 });

await new Promise(ok => readline.createInterface({ input: process.stdin }).on("line", l => { if (l.trim() === "empieza") ok(); }));
medir = true;
const cpu0 = process.cpuUsage(), tM = performance.now();
let sigue = true;
clientes.forEach((c, j) => {
  const tic = () => {
    if (!sigue) return;
    const ahora = reloj(), a = (DESDE + j) * 0.157 + ahora / 4000;
    const b = PoseCodec.codifica({ tipo: 1, seq: c.enviados & 0xffff, t: Math.round(ahora % 4294967296) >>> 0, cab: { p: [Math.cos(a) * 20, 1.6, Math.sin(a) * 20], q: [0, Math.sin(a / 2), 0, Math.cos(a / 2)] }, izq: null, der: null });
    c.enviados++;
    c.sala.localParticipant.publishData(b, { reliable: false, topic: "pose" }).catch(() => { c.errores++; });
    c.t = setTimeout(tic, 100);
  };
  c.t = setTimeout(tic, (j * 100) / Math.max(1, clientes.length));
});
await new Promise(ok => setTimeout(ok, S * 1000));
sigue = false; clientes.forEach(c => clearTimeout(c.t));
await new Promise(ok => setTimeout(ok, 2500));
medir = false;
const cpu = process.cpuUsage(cpu0), dur = (performance.now() - tM) / 1000;
di({ evento: "fin", n: clientes.length, enviados: clientes.reduce((s, c) => s + c.enviados, 0), recibidos: clientes.reduce((s, c) => s + c.recibidos, 0),
  errores: clientes.reduce((s, c) => s + c.errores, 0), cpuNucleo: (cpu.user + cpu.system) / 1e6 / dur, retardos: clientes.flatMap(c => c.ret) });
for (const c of clientes) await c.sala.disconnect().catch(() => {});
await rtc.dispose();
process.exit(0);
