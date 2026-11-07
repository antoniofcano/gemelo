// Sirve la prueba de humo en la red de casa por HTTPS, para abrirla en el Quest sin cable (WebXR solo funciona en un origen seguro).
// Certificado autofirmado de @vitejs/plugin-basic-ssl: el casco avisa una vez («la conexión no es privada») y hay que aceptarlo.
// Uso: npm run build && npm run sirve:red  →  https://<IP del ordenador en la Wi-Fi>:4173/?modo=…
import basicSsl from "@vitejs/plugin-basic-ssl";

export default {
  plugins: [basicSsl()],
  build: { outDir: "dist" },
  preview: { host: true, port: 4173, strictPort: true },
};
