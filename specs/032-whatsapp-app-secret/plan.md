# Plan — 032 App Secret de WhatsApp

## Decisiones

- Extender `meta_credentials` con el trío nullable `app_secret_cipher`, `app_secret_iv`, `app_secret_tag`; usar el cifrado AES-256-GCM compartido.
- Dejar el App Secret opcional y no devolver nunca el texto plano. Si el formulario se vuelve a guardar vacío, conservar el secreto anterior.
- Verificar cada payload entrante con el secreto asociado a sus `phone_number_id`. Todos los números de un mismo payload tienen que resolver al mismo secreto. Mantener `META_APP_SECRET` como fallback para datos anteriores o eventos sin número.
- No cambiar el alcance de la firma de Instagram/Messenger ni quitar el fallback de entorno.

## Modelo y componentes

- Persistencia: `meta_credentials` y migración aditiva.
- Configuración: `PUT/GET /api/settings/whatsapp` y `WhatsappWizard`.
- Webhook: resolver el secreto desde los números incluidos en el payload y verificar la firma cruda existente.

## Verificación

- Tests unitarios de cifrado/reversibilidad, persistencia segura y conservación al actualizar sin App Secret.
- Tests de ruta de ajustes y selección del secreto: propio, fallback, secreto mixto y falta de secreto.
- Ejecutar typecheck, lint y suite de tests al cierre; build si el entorno lo permite.
