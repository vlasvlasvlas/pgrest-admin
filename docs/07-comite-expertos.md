# 07 - Comite de 3 Expertos

Este documento define como gobernar la evolucion de pgrest-admin para sostener una base universal y funcional.

## Perfil 1: Arquitectura de Datos

Responsabilidades:
- Definir estandares de schema SQL por entidad.
- Revisar naming, constraints, llaves foraneas e indices.
- Aprobar cambios de migracion y compatibilidad hacia atras.

Checklist minimo por entidad:
- Tabla principal con PK, timestamps, constraints.
- Catalogos y relaciones normalizadas.
- Indices para queries del listado/filtros.

## Perfil 2: Seguridad y Cumplimiento

Responsabilidades:
- Revisar JWT, roles y politicas RLS.
- Asegurar principio de menor privilegio.
- Auditar funciones SECURITY DEFINER y manejo de secretos.

Checklist minimo por entidad:
- Grants definidos por rol.
- RLS habilitado y forzado donde aplica.
- Pruebas de acceso positivo/negativo por rol.

## Perfil 3: Producto y UX Operativa

Responsabilidades:
- Validar que el YAML sea suficiente para UX consistente.
- Definir componentes reutilizables y reglas de formularios.
- Cuidar accesibilidad, i18n y respuesta de errores.

Checklist minimo por entidad:
- YAML con list/fields/permissions completos.
- Flujo create/edit/delete usable en mobile y desktop.
- Mensajes de error y estados vacios claros.

## Proceso de aprobacion

1. Propuesta de cambio (SQL + YAML + impacto UI).
2. Revision tecnica de los 3 perfiles.
3. Correcciones cruzadas.
4. Aprobacion final y merge.
5. Verificacion post-merge (smoke tests).

## Regla de calidad

Un cambio solo se considera listo cuando:
- funciona end-to-end,
- mantiene seguridad por roles,
- y es entendible sin codigo custom por entidad.
