// Sustituto de 3d-tiles-renderer para el build cuando apps/web no tiene node_modules/3d-tiles-renderer (vite.config.js lo elige):
// sin TilesRenderer, la escena 3D Tiles (?escena=tiles, motor/04b_escena3d.js) se declara «sin» y el motor vuelve al relieve de siempre.
export const TilesRenderer = null;
