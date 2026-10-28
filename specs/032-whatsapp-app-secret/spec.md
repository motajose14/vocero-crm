# 032 — App Secret de WhatsApp

## Problema

La configuración de WhatsApp permite conectar una app de Meta, pero no guardar su App Secret por organización. Sin ese secreto, la instancia no puede validar la firma de los webhooks de esa app sin depender de un único secreto global.

## Requisitos

- «vale pibe ahora hay que agregar que al configurar whatsapp se pueda guardar el app secret, recuerda colocarlo pero encriptado, similar al token.»
- El App Secret es opcional en la configuración, se guarda cifrado con el mismo mecanismo AES-256-GCM que el token y nunca se devuelve en claro al cliente.
- Al actualizar una conexión, dejar vacío el campo conserva el App Secret guardado; introducir uno nuevo lo reemplaza.
- Los webhooks se validan con el App Secret configurado para los números que aparecen en el payload. Si un payload incluye números con secretos distintos, se rechaza para no permitir que una app firme eventos de otra organización.
- `META_APP_SECRET` continúa como respaldo para credenciales antiguas sin App Secret y eventos sin identificador de número.

## Criterios de aceptación

1. Al guardar un App Secret, la fila persiste únicamente su cifrado, IV y tag; descifrado con la clave de instancia recupera el valor original.
2. La API de configuración informa únicamente si hay App Secret configurado; nunca devuelve el valor.
3. Volver a guardar las credenciales sin App Secret no borra el valor existente; desconectar WhatsApp elimina la fila como antes.
4. Una firma válida con el App Secret de los números del payload pasa; secretos no coincidentes, ausentes o mezclados rechazan el webhook.
5. Una credencial antigua y los eventos sin número siguen usando `META_APP_SECRET` cuando está configurado.

## No hacer

- No migrar el secreto global de entorno ni cambiar la validación de otros canales.
- No exponer ni enmascarar fragmentos del App Secret en UI, API, logs o errores.
- No aceptar un payload multi-número con distintos secretos de firma.
