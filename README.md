# FinanzApp

Aplicación web académica para registrar ingresos y gastos y consultar libros y reportes financieros.

## Ejecución

La interfaz React se compila con `npm run build`. El servicio Node y Express entrega la interfaz y la API con `npm start`.
Se requiere una base PostgreSQL dedicada y la variable `DATABASE_URL`. Para aplicar el esquema de forma idempotente se ejecuta `npm run db:migrate`, que utiliza `DATABASE_URL_DIRECT` si está configurada y, en caso contrario, `DATABASE_URL`.

Las credenciales y cadenas de conexión se configuran como variables privadas del entorno. Nunca deben agregarse al repositorio.

## Datos de demostración

El comando `npm run db:seed` incorpora ejemplos ficticios y cuatro cuentas únicamente cuando `DEMO_SEED=1` y se proporcionan contraseñas distintas de al menos 12 caracteres en las variables `DEMO_ADMIN_PASSWORD`, `DEMO_CONTADOR_PASSWORD`, `DEMO_EMPLEADO_PASSWORD` y `DEMO_USUARIO_PASSWORD`. Repetir la carga no reemplaza contraseñas ni registros existentes.

## Acceso y respaldo

El servicio mantiene sesiones en PostgreSQL y verifica los roles en la API. El registro de usuarios lo gestiona la administración. Las copias JSON de Administración contienen cuentas contables, categorías y movimientos. La restauración reemplaza esos datos dentro de una transacción y requiere confirmación.

## Despliegue

`render.yaml` configura el servicio web. Configure `DATABASE_URL` con la conexión agrupada y `DATABASE_URL_DIRECT` con la conexión directa de la base dedicada.
