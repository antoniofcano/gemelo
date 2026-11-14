const fs=require("fs");const { chromium } = require(process.env.PLAYWRIGHT_CORE || "playwright-core");
const dormir=ms=>new Promise(r=>setTimeout(r,ms));
// Guion de mano (no es una prueba: no afirma nada; las pruebas de VR son pruebas/guardianes/vr_*.test.js). Pide GEMELO_URL: la salida artefacto de siempre se retiró (ADR-0021), no hay página por defecto.
if(!process.env.GEMELO_URL){console.error("vr_mock: falta GEMELO_URL (la URL del gemelo servido: infra/dev o la web construida)");process.exit(2);}
(async()=>{const b=await chromium.launch({executablePath:process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe",args:["--use-gl=swiftshader","--enable-unsafe-swiftshader","--no-sandbox"]});
const p=await b.newPage({viewport:{width:640,height:400}});await p.addInitScript({content:fs.readFileSync(require("path").join(__dirname,"mock_xr.js"),"utf8")});
await p.goto(process.env.GEMELO_URL + "?debug");await p.waitForFunction(()=>window.__vrDebug,null,{timeout:120000});await dormir(8000);
await p.click("#btnVR");await dormir(4000);
async function fot(n){const f0=await p.evaluate(()=>window.__mockXR.fotogramas);for(let i=0;i<400;i++){await dormir(60);if((await p.evaluate(()=>window.__mockXR.fotogramas))>=f0+n)return;}}
async function tramo(c){const a0=await p.evaluate(()=>window.__vrDebug().cabeza);await p.evaluate(c=>{window.__mockXR.ejes("left",0,-1);window.__mockXR.boton("left",1,c)},c);await fot(10);await p.evaluate(()=>{window.__mockXR.ejes("left",0,0);window.__mockXR.boton("left",1,false)});await fot(2);const a1=await p.evaluate(()=>window.__vrDebug().cabeza);return Math.hypot(a1[0]-a0[0],a1[2]-a0[2]);}
const a=await tramo(false),c=await tramo(true),a2=await tramo(false);console.log("andar",a.toFixed(2),"correr",c.toFixed(2),"andar",a2.toFixed(2),"razón",(c/((a+a2)/2)).toFixed(2));await b.close();})();
