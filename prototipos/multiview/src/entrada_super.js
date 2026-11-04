// modo super: super-three 0.185.0 (el alias «three» de construye.mjs apunta a él), WebGLRenderer con multiviewStereo (y &mv=0 sin él)
import * as THREE from "three";
import { arranca } from "./humo.js";
import { fabricaWebGL } from "./webgl.js";

arranca(THREE, fabricaWebGL("super"), __MODO__).catch(e => { document.getElementById("estado").textContent = "Error: " + e.message; console.error(e); });
