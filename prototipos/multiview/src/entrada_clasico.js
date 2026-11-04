// modo clasico: three 0.186.1, WebGLRenderer, sin multiview (la referencia: lo que corre hoy en el Quest)
import * as THREE from "three";
import { arranca } from "./humo.js";
import { fabricaWebGL } from "./webgl.js";

arranca(THREE, fabricaWebGL("clasico"), __MODO__).catch(e => { document.getElementById("estado").textContent = "Error: " + e.message; console.error(e); });
