// Dónde está el sol en un sitio y un instante, con suncalc (fórmulas de Meeus), para poner el sol de un mundo interior:
//   node sol.mjs --lat 37.7 --lon -3.9 --utc 2026-11-12T15:00:00Z [--norte 180]
// Escribe un JSON con el azimut geográfico (grados desde el norte hacia el este), la elevación, y, si se da --norte
// (hacia dónde cae el norte real en la planta de Blender: grados desde +Y hacia +X), el azimut en planta que resulta.
// Lo que se pasa a prepara.py es: --azimut <azimut_geografico> --elevacion <elevacion> --norte <norte>.
// La latitud, la longitud y la hora se dan por argumento: aquí no hay datos de ninguna finca.
import * as SunCalc from 'suncalc';

export function sol(lat, lon, fecha, norte = null) {
  const p = SunCalc.getPosition(fecha, lat, lon);
  const r = { utc: fecha.toISOString(), lat, lon, azimut_geografico: +p.azimuth.toFixed(2), elevacion: +p.altitude.toFixed(2) };
  if (norte !== null) { r.norte = norte; r.azimut_en_planta = +(((p.azimuth + norte) % 360 + 360) % 360).toFixed(2); }
  return r;
}

if (process.argv[1] && process.argv[1].endsWith('sol.mjs')) {
  const a = process.argv.slice(2), o = {};
  for (let i = 0; i < a.length; i += 2) o[a[i].replace(/^--/, '')] = a[i + 1];
  if (!o.lat || !o.lon || !o.utc) { console.error('uso: node sol.mjs --lat <grados> --lon <grados> --utc <ISO 8601> [--norte <grados>]'); process.exit(1); }
  console.log(JSON.stringify(sol(Number(o.lat), Number(o.lon), new Date(o.utc), o.norte === undefined ? null : Number(o.norte))));
}
