# Operación y despliegue

LEONIDA FM funciona en un solo proceso de Node con una base SQLite. El catálogo y los doce cortes originales se distribuyen con la aplicación. Para una emisión continua, el perfil de streaming incorpora Liquidsoap, Icecast y una pasarela HTTP. Los dos perfiles reproducen los originales del proyecto. La ficha musical de cada emisora conserva sus enlaces de escucha externos.

## Arranque en Windows 11 o Linux

Instala Node 24 LTS con npm. La versión mínima del proyecto es Node 22.13. Ejecuta los comandos desde el directorio que contiene `package-lock.json`.

~~~sh
npm ci
npm run build
npm start
~~~

Abre el [reproductor local](http://127.0.0.1:5173/). La base se crea en `.local/leonida.sqlite`. Un gesto en el reproductor inicia el audio. Para modificar el frontend con recarga en desarrollo, usa `npm run dev`. Después de actualizar dependencias, vuelve a instalar desde el archivo de bloqueo y recompila.

| Tarea | Windows PowerShell | Linux, macOS o WSL |
|---|---|---|
| Copiar la configuración inicial | `Copy-Item .env.example .env` | `cp -n .env.example .env` |
| Comprobar el proceso | `Invoke-RestMethod http://127.0.0.1:5173/api/health` | `curl -fsS http://127.0.0.1:5173/api/health` |
| Usar un puerto libre | Cambiar `PORT` en `.env` y reiniciar | Cambiar `PORT` en `.env` y reiniciar |
| Contenedores | Docker Desktop con contenedores Linux y WSL 2 | Docker Engine con Docker Compose v2 |

Si PowerShell aplica una política de ejecución al acceso directo de npm, ejecuta `npm.cmd ci`, `npm.cmd run build` y `npm.cmd start`. Las instrucciones de contenedores siguientes son iguales en ambas plataformas, salvo las indicaciones de permisos POSIX.

## Perfiles Docker

Docker Compose 2.24 o posterior admite los perfiles y healthchecks usados aquí. La validación de los archivos se realizó con 2.40.3. Los puertos por defecto de demo y desarrollo solo escuchan en loopback.

| Perfil | Componentes | Entrada |
|---|---|---|
| development | Servidor de desarrollo, carpetas de código montadas y volumen SQLite de desarrollo independiente | HTTP local, `WEB_PORT` |
| demo | Node con el frontend compilado, SQLite persistente y Caddy | HTTP local, `WEB_PORT` |
| streaming | Demo más pasarela, Icecast y Liquidsoap en un segundo proyecto | Mismo origen HTTP local para reproductor, API y audio continuo |
| production | Node privado y Caddy con HTTPS. El operador puede conectar la pila de streaming | Dominio propio, 80/TCP y 443/TCP. 443/UDP habilita HTTP/3 |

~~~sh
docker compose --profile demo up -d --build --wait
docker compose --profile demo ps
docker compose --profile demo logs --tail=50 app
~~~

Para cambiar de demo a desarrollo, detén primero el perfil que ocupa el puerto. El comando de parada conserva los volúmenes.

~~~sh
docker compose --profile demo down
docker compose --profile development up --build
~~~

Las modificaciones del frontend, datos y recursos montados llegan al contenedor de desarrollo. Reinicia el servicio tras editar código del servidor. Reconstruye su imagen si modificas scripts, dependencias o la configuración del compilador. En producción, al reconstruir solo cambia la imagen; la base de datos permanece en `APP_DATA_VOLUME`.

## Emisión local con las seis frecuencias

Se necesitan Docker Compose y Python 3.11 o posterior en la máquina de operación. En Windows también sirve `py -3.11` en lugar de `python3`. Los dos proyectos conservan sus directorios de construcción y archivos secretos independientes. Únicamente la pasarela de audio se une a la red compartida con Node y Caddy.

~~~sh
python3 infra/broadcast/entry.py init
docker network create leonida-stream-uplink
docker compose -f infra/broadcast/compose.yml -f infra/broadcast/compose.uplink.yml --profile streaming up -d --build --wait --wait-timeout 300
docker compose -f compose.yml -f compose.streaming.yml --profile streaming up -d --build --wait
~~~

Crea la red una sola vez. Si existe, comprueba su nombre con `docker network inspect leonida-stream-uplink` y continúa. El primer comando genera credenciales por servicio; la carpeta `infra/broadcast/.secrets` queda bajo control del operador. En máquinas de recursos limitados, amplía el tiempo de espera de Compose si los servicios siguen inicializándose. La pasarela conserva una entrada de diagnóstico en 127.0.0.1:8088. El navegador utiliza Caddy en 127.0.0.1:5173 y se incorpora a `/stream/<slug>`.

~~~sh
curl -fsS http://127.0.0.1:5173/stream/status.json
curl -fsS http://127.0.0.1:5173/api/broadcasts/status
~~~

En Windows puedes sustituir `curl` por `curl.exe`. Con el origen activo, el recurso de la pasarela enumera un `status` por emisora y la API muestra `liveAvailable` según la última comprobación. Escucha en la web con **Live Broadcast**. Incluso con todos los navegadores cerrados, los procesos de Liquidsoap siguen enviando audio a sus respectivos mounts. El desfase que percibe cada oyente depende del búfer y de la red.

Para detener los servicios, ejecuta los dos comandos de composición anteriores sustituyendo `up -d --build --wait` y sus parámetros por `down`. Si cambias la aplicación a demo, vuelve a arrancarla con el archivo base. El proyecto tiene un único proxy local por puerto.

## Producción con HTTPS

1. Asigna un dominio al servidor con registros DNS A y, si usas IPv6, AAAA que lleguen al mismo host. Permite el tránsito entrante a los puertos de Caddy. Node, SQLite e Icecast permanecen en redes de contenedores.
2. Copia `.env.example` a `.env`. Establece `SITE_DOMAIN` al nombre DNS sin protocolo y `PUBLIC_ORIGIN` a la URL HTTPS completa. Usa un volumen persistente para la base y conserva los volúmenes `caddy-data` y `caddy-config` entre despliegues.
3. Para servir el catálogo y la demo, inicia el perfil que figura abajo. Para audio continuo, inicia también el origen con los comandos de la sección anterior y añade `-f compose.streaming.yml` al comando de la web. El origen solo necesita estar operativo para que el modo Live aparezca disponible.
4. Comprueba el certificado y abre una emisora en dos dispositivos. Revisa `/api/health`, `/api/broadcasts/status` y, cuando corresponda, `/stream/status.json`. Comprueba la recuperación de una desconexión antes de anunciar disponibilidad de una nueva fuente.

~~~sh
docker compose --profile production up -d --build --wait
docker compose --profile production logs --tail=50 public-web
~~~

Caddy conserva sus certificados en `/data` y se encarga de renovarlos. El acceso TLS de un dominio real requiere DNS y conectividad externa. Si cambias de máquina, restaura la identidad TLS con un respaldo cifrado de ese volumen o permite a Caddy emitir nuevos certificados. Valida una regla de reenvío desde otra conexión. Una Pi detrás de CG-NAT necesita un punto de entrada accesible o un túnel administrado por el operador. [HTTPS automático de Caddy](https://caddyserver.com/docs/automatic-https)

Caddy reemplaza `X-Real-IP` con la IP de su conexión. El perfil Docker habilita esta única capa de confianza y deja el puerto de Node fuera de los puertos publicados. Una CDN adicional requiere configurar sus proxies de confianza y probar de nuevo los límites. Para un despliegue de Node directo, `TRUST_PROXY=0` conserva la dirección del socket. El formato de estadísticas nativas refleja los oyentes que comunica Icecast. La pasarela incluida cuenta sus propias respuestas de audio abiertas. Los eventos SSE representan suscripciones de metadatos.

### Raspberry Pi 5 de 8 GB

Usa Raspberry Pi OS de 64 bits y comprueba `uname -m` (aarch64). Los manifiestos Docker elegidos para Node y Caddy incluyen linux/arm64. Las imágenes nativas de Debian para el origen compilan para la arquitectura local. Evita forzar `linux/amd64` en Portainer. Un SSD USB resulta adecuado para Docker, las copias y la base. Comprueba `df -h` y `docker system df` antes del build, especialmente con una tarjeta de 8 GB. Las imágenes, cachés de compilación y logs ocupan almacenamiento adicional al del ZIP. Para separar servicios en dos Raspberry Pi, una red bridge de Docker solo abarca un host. En ese caso, expón la pasarela mediante una ruta privada alcanzable entre las placas, configura el upstream en Caddy y apunta `BROADCAST_STATUS_URL` a esa dirección. Los secretos de Icecast quedan en la placa de emisión.

## Configuración

| Variable | Dónde | Uso |
|---|---|---|
| `HOST`, `PORT` | Node nativo | Interfaz y puerto. De fábrica 127.0.0.1 y 5173. |
| `DIST_DIR`, `DATABASE_PATH` | Node nativo | Frontend compilado y archivo SQLite. En Docker se usan `/app/dist/client` y `/app/.local/leonida.sqlite`. |
| `PUBLIC_ORIGIN` | Node | Origen visible al navegador. Necesario detrás de HTTPS para determinar el origen de administración y la cookie segura. |
| `ADMIN_TOKEN` | Node | Secreto aleatorio de 32 a 512 caracteres para Studio. Sin configurar, la administración queda deshabilitada. |
| `TRUST_PROXY` | Node | `1` solo tras un proxy único confiable que reemplaza `X-Real-IP`. |
| `STREAM_BASE` | Node | Vacío en demo. `/stream` habilita rutas del mismo origen. También admite base HTTPS en un host permitido. |
| `STREAM_RIGHTS_REFERENCE` | Node | Referencia pública al permiso de la fuente predeterminada. Una cadena por sí sola no acredita los derechos. |
| `STREAM_HOSTS` | Node | Lista de hostnames HTTPS exactos separados por coma para fuentes externas. |
| `BROADCAST_STATUS_URL` | Node | Único destino de monitorización en servidor, definido por el operador. Acepta estadísticas de Icecast o el JSON de la pasarela. |
| `WEB_PORT`, `SITE_DOMAIN` | Compose | Puerto local y dominio del proxy público. |
| `APP_DATA_VOLUME` | Compose | Nombre estable del volumen SQLite que se puede intercambiar para restaurar. |
| `NODE_IMAGE`, `CADDY_IMAGE`, `APP_IMAGE` | Compose | Índices multi-arch fijados por digest y tag local del resultado. Revisa y prueba nuevos digests al actualizar. |
| `ADMIN_SECRET_PATH` | Compose | Archivo de credencial al usar `compose.admin.yml`. En el contenedor se transforma en `ADMIN_TOKEN` mediante `ADMIN_TOKEN_FILE`. |
| `BROADCAST_PORT`, `DJ_ENABLED` | Compose del origen | Puerto de la pasarela en loopback y entrada opcional de estudio. |
| `SITE_ADDRESS`, `STREAM_HANDLERS`, `STREAM_UPSTREAM`, `APP_UPSTREAM` | Caddy | Dirección pública, selección de ruta y upstream internos. Los perfiles suministran los valores de un solo host. |

## Acceso a Studio

En un despliegue nativo, genera un secreto en el equipo del operador y guárdalo en la entrada `ADMIN_TOKEN` de su `.env`, fuera del repositorio. Un gestor de secretos también puede proporcionarlo en el entorno del proceso. Para Compose se incluye una alternativa con archivo. La siguiente orden funciona en Node para Windows y Linux, crea el archivo de forma exclusiva e impide sobrescribir uno existente. En POSIX, la carpeta privada limita el acceso al archivo montado por el contenedor.

~~~sh
node --input-type=module -e "import {mkdirSync,writeFileSync} from 'node:fs'; import {randomBytes} from 'node:crypto'; mkdirSync('.local/secrets',{recursive:true,mode:0o700}); writeFileSync('.local/secrets/admin-token',randomBytes(40).toString('base64url'),{flag:'wx',mode:0o444});"
docker compose -f compose.yml -f compose.admin.yml --profile production up -d --build --wait
~~~

Para operación con emisión, incluye también `-f compose.streaming.yml`. Apunta el navegador a `/admin` y autentícate con la credencial. Para desarrollo local utiliza el perfil `demo` en la misma orden. El administrador puede comprobar revisiones, consultar incidencias, editar estaciones y cambiar fuentes. La cookie caduca a las cuatro horas. Rota el secreto y recrea el servicio `app` si hay que revocar todas las sesiones. En Windows aplica a la carpeta los permisos de tu usuario. En POSIX, si la carpeta ya existía, revisa que su modo sea 0700.

### Añadir una emisión autorizada

1. Identifica las grabaciones, el titular, los usos, los territorios y la vigencia permitidos. Guarda el documento privado con el operador. Publica únicamente una referencia de catálogo apta para los oyentes.
2. Para el origen incluido, añade los MP3 originales autorizados y su hash SHA-256 al registro que revisa el worker. La emisión necesita al menos una grabación persistente de reserva por estación. El audio de demo que entrega la PWA vive en `public/audio/`. **Si la licencia solo permite streaming**, monta las nuevas grabaciones en un directorio privado del worker, separado del frontend; el servidor web entrega cualquier recurso ubicado en `public/`. El archivo `infra/broadcast/rights.json` vincula cada grabación al permiso y la estación. Reconstruye el worker y la pasarela si cambia el registro.
3. Para un proveedor externo, añade su hostname exacto a `STREAM_HOSTS`, indica el tipo de fuente y la URL HTTPS en Studio, y guarda la referencia al permiso. El acceso del navegador y el monitor se configuran por separado. Para diagnóstico por emisora, configura `BROADCAST_STATUS_URL` y un `STREAM_BASE` cuyo sufijo por emisora coincida con el slug; una URL ajena al monitor figura como estado desconocido.
4. Comprueba el tipo MIME, disponibilidad regional, CORS si el frontend necesita acceder a una playlist HLS, estado del origen y reproducción efectiva. Una prueba de API no abre un audio en el navegador. Comprueba también que la señal continúa al salir y volver a sintonizar.

La API admite un cambio parcial con `PUT /api/admin/stations/flash-fm`, token Bearer y `If-Match` con la revisión leída previamente de esa ficha. Este cuerpo conecta Flash FM al mount local de los originales incluidos. La propiedad `sources` sustituye la lista completa de fuentes de esa emisora.

~~~json
{
  "sources": [
    {
      "id": "live-flash",
      "type": "icecast",
      "url": "/stream/flash-fm",
      "rightsReference": "LEONIDA-FM-ORIGINALS-2026-11-18",
      "enabled": true,
      "priority": 0,
      "bitrateKbps": 96
    }
  ]
}
~~~

La operación `POST /api/admin/stations/flash-fm/probe` actualiza el diagnóstico. En caso de 412, vuelve a leer la revisión antes de editar. La guía de API explica el alta de una nueva estación y sus recursos. [Contrato de la API](API.md)

## Copia, restauración y actualización

En Node nativo, el script toma una instantánea consistente mientras el servidor sigue atendiendo y valida la integridad. El destino debe ser un archivo nuevo en un sistema de archivos que admita enlaces duros. NTFS, ext4 y los volúmenes Linux de Docker ofrecen esta función. Guarda después la copia en un soporte diferente. Los registros pueden contener referencias editoriales privadas y resúmenes criptográficos de sesiones administrativas, por lo que conviene cifrar el almacenamiento de copias. [Copias consistentes de SQLite](https://sqlite.org/backup.html)

~~~sh
node scripts/sqlite-backup.mjs .local/leonida.sqlite backups/catalog-001.sqlite
~~~

En Compose, copia desde el contenedor a un directorio de copia local existente. Usa un nombre nuevo en cada ejecución.

~~~sh
docker compose --profile production exec -T app node scripts/sqlite-backup.mjs /app/.local/leonida.sqlite /app/.local/backups/catalog-001.sqlite
docker compose --profile production cp app:/app/.local/backups/catalog-001.sqlite ./catalog-001.sqlite
~~~

**Restauración comprobable.** En Node, usa la copia como origen del mismo script, con una ruta nueva como destino. Cambia `DATABASE_PATH` a esa nueva ruta y reinicia. El archivo anterior queda disponible para volver atrás. En Compose, recupera los datos en otro volumen.

1. Detén el servicio `app` y anota el `APP_DATA_VOLUME` actual. Selecciona en `.env` un nombre de volumen nuevo, por ejemplo `leonida-fm-restored-001`.
2. Desde la carpeta que contiene la copia, ejecuta la orden de abajo. En PowerShell utiliza la variante `--volume "${PWD}/catalog-001.sqlite:/restore/input.sqlite:ro"`. El argumento es una ruta absoluta del host.
3. Arranca de nuevo la composición con el mismo perfil y los archivos adicionales que utilizabas antes de la restauración. Comprueba la salud y una estación cuya revisión conozcas. Para volver al estado anterior, selecciona el nombre anterior de volumen y recrea `app`.

~~~sh
docker compose --profile production run --rm --no-deps --volume "${PWD}/catalog-001.sqlite:/restore/input.sqlite:ro" app node scripts/sqlite-backup.mjs /restore/input.sqlite /app/.local/leonida.sqlite
~~~

Guarda también `.env`, las credenciales de administración y emisión, el registro de derechos, los medios privados y el material TLS con un mecanismo de copia cifrada apropiado al host. Una copia de SQLite permite recuperar los cambios del catálogo y de la programación de demo. Liquidsoap lee su propio registro y medios en el arranque. Para actualizar, realiza una copia, despliega la nueva imagen y comprueba salud, login y una muestra de audio. La aplicación conserva las ediciones de estaciones ya modificadas por un administrador al actualizar el catálogo semilla.

## Tráfico y observación

La configuración de Liquidsoap codifica MP3 estéreo a **96 kbit/s**. El tráfico de audio por oyente es aproximadamente `96 000 × 3 600 ÷ 8 = 43,2 MB` por hora. Cien oyentes simultáneos durante una hora consumen unos **4,32 GB** y requieren **9,6 Mbit/s** de subida sostenida, antes de cabeceras y reintentos. Cien oyentes continuos durante 30 días representan unos **3,11 TB** decimales. A esta transferencia se añaden la web, los proveedores externos, los respaldos y las métricas. La cifra trata solo del reparto de audio servido por el operador.

Consulta en el ISP o VPS el caudal de salida y el precio por GB. Una CDN compatible con emisión de audio continua o un relay puede repartir la carga entre regiones. La caché HTTP convencional de archivos estáticos no garantiza que un stream continuo llegue con baja latencia. El informe de pruebas del proyecto describe el número de conexiones y la duración realmente observados.

~~~
docker compose --profile production ps
docker compose --profile production logs --since=15m app public-web
docker compose -f infra/broadcast/compose.yml --profile streaming logs --since=15m icecast broadcast-worker broadcast-gateway
~~~

Comprueba espacio libre en el volumen, errores de origen, tasas de reconexión y caducidad de certificados. Un sondeo periódico de `/api/health` verifica API y SQLite. `/api/broadcasts/status` diferencia emisoras deshabilitadas, desconectadas, desconocidas y activas. Un muestreo de bytes seguido de decodificación ofrece una prueba de audio más fuerte que un código 200.

| Síntoma | Qué comprobar |
|---|---|
| La demo funciona y Live marca sin fuente | Perfil de emisión, referencia de derechos, red compartida y respuesta de `/stream/status.json`. |
| Todas las emisoras pasan a estado obsoleto | Accesibilidad de `BROADCAST_STATUS_URL` desde Node y fecha de la última lectura válida. |
| La web responde 502 | Salud de `app`, nombre de upstream y misma red de Caddy. En streaming comprueba además `broadcast-gateway`. |
| Error de origen al entrar en Studio | URL del navegador y `PUBLIC_ORIGIN` deben ser idénticos con el mismo esquema y puerto. Una rotación requiere iniciar una sesión nueva. |
| SQLite informa de permisos o espacio | Propietario del volumen, espacio disponible y usuario de Node (UID 1000 en la imagen oficial). |
| Pantalla de PWA desactualizada | Recarga conectado, cierra las demás pestañas de la app y vuelve a abrir para permitir activar la actualización. |
| Un vídeo externo no está disponible | Abre la ficha del proveedor. Comprueba restricciones de titular o región y revisa el enlace editorial. |

## Comprobaciones de esta entrega

| Comprobación | Resultado observado |
|---|---|
| Resolución de archivos Compose | Docker Compose 2.40.3 aceptó desarrollo, demo, producción, streaming local y público, credencial en archivo y superposición de red del origen. |
| Proxy | Caddy 2.11.2 validó las variantes local, producción con TLS y emisión. Caddy ejecutado de forma nativa sirvió la salud del proceso Node real con SQLite y los endpoints del catálogo. La prueba aislada comprobó la respuesta 404 sin origen y, con un upstream controlado, la conservación de la ruta y del estado de emisión. |
| Contenido de la etapa de ejecución | Se copió al directorio vacío exactamente el conjunto que usa la imagen final. Sin las dependencias de desarrollo instaladas, el entrypoint sirvió HTML compilado, respondió 206 a un rango del MP3, abrió la base y autenticó Studio mediante el secreto montado en archivo. |
| Respaldo | Con WAL activo se tomó una instantánea, se hizo otra escritura y se restauró la copia con su estado original. Se comprobó la integridad y el rechazo de destinos ya existentes y de bases ajenas. |
| Origen | El responsable de playout ejecutó Liquidsoap e Icecast de forma nativa. Se conserva evidencia independiente de los seis mounts, de la prueba de oyentes y de la entrada de estudio. [Emisión](../infra/broadcast/verified-native.json) · [Estudio](../infra/broadcast/verified-studio.json) |
| Imágenes de contenedor | El registro devolvió imágenes linux/amd64 y linux/arm64 en los índices fijados para Node y Caddy. El arranque de las composiciones en Docker y la emisión de certificados para un dominio real quedan pendientes de un host con daemon y del DNS del operador. |
| Integración continua | El archivo de GitHub Actions instala desde el lockfile, comprueba código y navegador, arranca la demo y conecta las seis emisiones en un runner con Docker. El informe de esta edición recoge las pruebas ejecutadas en el entorno de entrega. |
