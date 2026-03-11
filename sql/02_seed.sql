-- 02_seed.sql
-- Datos iniciales para poder probar el flujo end-to-end.

INSERT INTO public.departamentos (id, nombre)
VALUES
  (1, 'Cortes'),
  (2, 'Francisco Morazan'),
  (3, 'Atlantida')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.municipios (id, departamento_id, nombre)
VALUES
  (1, 1, 'San Pedro Sula'),
  (2, 1, 'Puerto Cortes'),
  (3, 2, 'Distrito Central'),
  (4, 2, 'Valle de Angeles'),
  (5, 3, 'La Ceiba')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.estados_proyecto (id, nombre, color, orden)
VALUES
  (1, 'Borrador', '#64748b', 1),
  (2, 'En Ejecucion', '#2563eb', 2),
  (3, 'Finalizado', '#16a34a', 3),
  (4, 'Suspendido', '#dc2626', 4)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.usuarios (email, password_hash, nombre, rol)
VALUES
  ('admin@pgrest.local', crypt('admin123', gen_salt('bf')), 'Administrador General', 'app_admin'),
  ('user@pgrest.local', crypt('user123', gen_salt('bf')), 'Usuario Demo', 'app_user')
ON CONFLICT (email) DO NOTHING;

INSERT INTO public.proyectos
  (nombre, descripcion, departamento_id, municipio_id, estado_id, monto, fecha_inicio, fecha_fin, creado_por)
SELECT
  'Puente Rio Lindo',
  'Proyecto inicial de ejemplo',
  1,
  1,
  2,
  1500000.00,
  CURRENT_DATE,
  CURRENT_DATE + INTERVAL '120 days',
  u.id
FROM public.usuarios u
WHERE u.email = 'user@pgrest.local'
  AND NOT EXISTS (
    SELECT 1 FROM public.proyectos p WHERE p.nombre = 'Puente Rio Lindo'
  );
