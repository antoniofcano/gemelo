-- 0027_avisos_por_correo.sql — EV-3a, decisión de Antonio (2026-11-05): de los avisos automáticos del campo, solo los del tiempo (lluvia, helada) salen
-- también por correo; los de labores (recogida, fenología) se quedan en la campana del mundo. `por_correo` falso = el repartidor (src/avisos/correo.ts)
-- no lo manda nunca. Las filas que había salían por correo: el valor por omisión (verdadero) no cambia nada para ellas ni para los avisos de la oficina.
ALTER TABLE avisos ADD COLUMN por_correo boolean NOT NULL DEFAULT true;
