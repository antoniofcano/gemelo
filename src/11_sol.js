  // ---------- el sol según la hora (25-oct, Jaén, hora oficial peninsular)
  function sol2() {
    var hora = Number($("hora").value), fi = 37.73 * Math.PI / 180, de = -12.1 * Math.PI / 180, Hh = (hora - 13.27) * 15 * Math.PI / 180;
    var alt = Math.asin(Math.sin(fi) * Math.sin(de) + Math.cos(fi) * Math.cos(de) * Math.cos(Hh));
    var az = Math.atan2(Math.sin(Hh), Math.cos(Hh) * Math.sin(fi) - Math.tan(de) * Math.cos(fi)) + Math.PI; // desde el norte, horario
    sol.position.set(Math.sin(az) * Math.cos(alt) * 300, Math.max(Math.sin(alt), 0.05) * 300, -Math.cos(az) * Math.cos(alt) * 300);
    var k = Math.max(0, Math.sin(alt)); sol.intensity = 0.25 + 0.75 * k; hemi.intensity = 0.45 + 0.5 * k;
    var hh = Math.floor(hora), mm = hora % 1 ? "30" : "00"; $("horaV").textContent = hh + ":" + mm;
  }
  $("hora").addEventListener("input", sol2); sol2();

