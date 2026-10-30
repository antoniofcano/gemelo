// Un autenticador WebAuthn de mentira para las pruebas de la llave de acceso (OF13): una clave ES256 (P-256) en memoria que
// responde como lo haría un navegador (RegistrationResponseJSON y AuthenticationResponseJSON, attestation «none»). Sirve
// para probar la api de punta a punta con la verificación REAL de @simplewebauthn/server, sin navegador ni aparato.
// No es un autenticador de verdad: no hay biometría, ni almacenamiento seguro, ni attestation de fabricante.
import { createHash, generateKeyPairSync, type KeyObject, randomBytes, sign } from "node:crypto";

type Cbor = number | string | Uint8Array | Map<Cbor, Cbor> | { [k: string]: Cbor };

/** CBOR mínimo (enteros, texto, bytes y mapas): lo justo para la clave COSE y el attestationObject. */
export function cbor(v: Cbor): Buffer {
  const cab = (mayor: number, n: number): Buffer => {
    if (n < 24) return Buffer.from([(mayor << 5) | n]);
    if (n < 0x100) return Buffer.from([(mayor << 5) | 24, n]);
    if (n < 0x10000) return Buffer.from([(mayor << 5) | 25, n >> 8, n & 0xff]);
    const b = Buffer.alloc(5); b[0] = (mayor << 5) | 26; b.writeUInt32BE(n, 1); return b;
  };
  if (typeof v === "number") return v >= 0 ? cab(0, v) : cab(1, -1 - v);
  if (typeof v === "string") { const b = Buffer.from(v, "utf8"); return Buffer.concat([cab(3, b.length), b]); }
  if (v instanceof Uint8Array) return Buffer.concat([cab(2, v.length), Buffer.from(v)]);
  const m = v instanceof Map ? [...v.entries()] : Object.entries(v);
  return Buffer.concat([cab(5, m.length), ...m.flatMap(([k, x]) => [cbor(k), cbor(x)])]);
}

const b64u = (b: Uint8Array) => Buffer.from(b).toString("base64url");
const sha256 = (b: Uint8Array | string) => createHash("sha256").update(b).digest();

export interface OpcionesFalsas {
  /** origen que el «navegador» pone en clientDataJSON (por defecto, el de la prueba) */
  origen?: string;
  /** RP ID cuyo hash va en authenticatorData (por defecto, el de las opciones) */
  rpId?: string;
  /** false: sin la bandera UV (la persona no se verificó) */
  verifica?: boolean;
  /** reto distinto al de las opciones (para probar que se rechaza) */
  reto?: string;
  /** contador que se firma (por defecto, el siguiente) */
  contador?: number;
  /** firmar con otra clave (para probar que se rechaza) */
  claveAjena?: boolean;
}

export class AutenticadorFalso {
  readonly credencial = randomBytes(32);
  private readonly privada: KeyObject;
  private readonly publica: KeyObject;
  contador = 0;
  private readonly origenPorDefecto: string;
  constructor(origenPorDefecto: string) {
    this.origenPorDefecto = origenPorDefecto;
    const par = generateKeyPairSync("ec", { namedCurve: "P-256" });
    this.privada = par.privateKey; this.publica = par.publicKey;
  }
  get id(): string { return b64u(this.credencial); }

  private flags(o: OpcionesFalsas, extra = 0): number { return 0x01 | (o.verifica === false ? 0 : 0x04) | extra; }
  private clienteJSON(tipo: string, reto: string, o: OpcionesFalsas): Buffer {
    return Buffer.from(JSON.stringify({ type: tipo, challenge: o.reto ?? reto, origin: o.origen ?? this.origenPorDefecto, crossOrigin: false }), "utf8");
  }

  /** Respuesta a navigator.credentials.create() con las opciones que dio la api. */
  alta(opciones: { challenge: string; rp: { id?: string } }, o: OpcionesFalsas = {}) {
    const jwk = this.publica.export({ format: "jwk" });
    const cose = cbor(new Map<Cbor, Cbor>([[1, 2], [3, -7], [-1, 1], [-2, Buffer.from(jwk.x!, "base64url")], [-3, Buffer.from(jwk.y!, "base64url")]]));
    const largo = Buffer.alloc(2); largo.writeUInt16BE(this.credencial.length);
    const cuenta = Buffer.alloc(4); cuenta.writeUInt32BE(this.contador);
    const authData = Buffer.concat([sha256(o.rpId ?? opciones.rp.id ?? ""), Buffer.from([this.flags(o, 0x40)]), cuenta, Buffer.alloc(16), largo, this.credencial, cose]);
    const cliente = this.clienteJSON("webauthn.create", opciones.challenge, o);
    return {
      id: this.id, rawId: this.id, type: "public-key" as const, clientExtensionResults: {}, authenticatorAttachment: "platform" as const,
      response: { clientDataJSON: b64u(cliente), attestationObject: b64u(cbor({ fmt: "none", attStmt: {}, authData })), transports: ["internal", "hybrid"] as ("internal" | "hybrid")[] },
    };
  }

  /** Respuesta a navigator.credentials.get() con las opciones que dio la api. */
  entrada(opciones: { challenge: string; rpId?: string }, o: OpcionesFalsas = {}) {
    this.contador = o.contador ?? this.contador + 1;
    const cuenta = Buffer.alloc(4); cuenta.writeUInt32BE(this.contador);
    const authData = Buffer.concat([sha256(o.rpId ?? opciones.rpId ?? ""), Buffer.from([this.flags(o)]), cuenta]);
    const cliente = this.clienteJSON("webauthn.get", opciones.challenge, o);
    const clave = o.claveAjena ? generateKeyPairSync("ec", { namedCurve: "P-256" }).privateKey : this.privada;
    const firma = sign("sha256", Buffer.concat([authData, sha256(cliente)]), clave);   // DER, como lo da un autenticador ES256
    return {
      id: this.id, rawId: this.id, type: "public-key" as const, clientExtensionResults: {},
      response: { clientDataJSON: b64u(cliente), authenticatorData: b64u(authData), signature: b64u(firma) },
    };
  }
}
