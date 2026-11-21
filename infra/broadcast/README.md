# Emisión continua de LEONIDA FM

Este perfil emite los doce temas originales del proyecto en seis canales MP3 estéreo a 96 kbit/s y 44,1 kHz. Liquidsoap reproduce cada parrilla aunque tenga cero oyentes. Icecast distribuye ese flujo continuo y cada navegador se incorpora al punto que se transmite en ese momento. El reloj arranca con el codificador. Reiniciar el codificador reinicia su rotación. El reproductor demo del sitio usa una parrilla independiente por tiempo UTC.

## Arranque en Linux, Windows 11 o macOS

Se necesitan Docker Engine con Compose v2 o Docker Desktop, y Python 3.11 o superior para inicializar las credenciales. Sitúate en la raíz del repositorio. En Windows, `py -3` sirve en lugar de `python3`.

```sh
python3 infra/broadcast/entry.py init
docker compose -f infra/broadcast/compose.yml --profile streaming up --build -d
docker compose -f infra/broadcast/compose.yml --profile streaming ps
```

La primera compilación descarga imágenes y paquetes. El servicio queda accesible por la interfaz de loopback del host.

| Señal | Ruta de escucha |
|---|---|
| Flash FM | `http://127.0.0.1:8088/stream/flash-fm` |
| Cocoteo FM | `http://127.0.0.1:8088/stream/cocoteo-fm` |
| Back Country Radio | `http://127.0.0.1:8088/stream/back-country` |
| The Chamber 106.6 | `http://127.0.0.1:8088/stream/the-chamber` |
| Dirty South Classics | `http://127.0.0.1:8088/stream/dirty-south` |
| Afro Bank FM | `http://127.0.0.1:8088/stream/afro-bank` |
| Estado y metadatos | `http://127.0.0.1:8088/stream/status.json` |

```sh
docker compose -f infra/broadcast/compose.yml --profile streaming logs --tail 40 broadcast-worker
docker compose -f infra/broadcast/compose.yml --profile streaming down
```

Los perfiles `streaming` y `production` ejecutan los mismos tres servicios. El perfil de producción requiere añadir HTTPS en la entrada y configurar el servidor de la web. El sitio y la demo de archivos también funcionan sin estos contenedores.

## Conectar el reproductor y el monitor

1. Configura en el proceso del **servidor web** las siguientes variables y reinícialo. Desde un proceso en el propio host se usa la URL de monitor de la tabla. Los contenedores de dos proyectos Compose distintos requieren una red compartida con el gateway.
2. Envía las peticiones del navegador a `/stream/*` al gateway conservando la ruta completa. Los demás paths continúan hacia el servidor web. Desde un contenedor de proxy en la red compartida, el destino es `broadcast-gateway:8088`. En el host es `127.0.0.1:8088`.
3. En el sitio, cambia la fuente de Demo a Live y pulsa reproducir. La primera conexión y el almacenamiento intermedio de cada dispositivo pueden introducir diferencias audibles de varios segundos.

| Variable | Para qué sirve | Valor |
|---|---|---|
| `STREAM_BASE` | Prefijo público que usa el audio HTML | `/stream` |
| `STREAM_RIGHTS_REFERENCE` | Atribución de la fuente | `LEONIDA-FM-ORIGINALS-2026-11-18` |
| `BROADCAST_STATUS_URL` | Monitor privado dentro de una red Compose compartida | `http://broadcast-gateway:8088/stream/status.json` |
| `BROADCAST_STATUS_URL` | Monitor desde el host | `http://127.0.0.1:8088/stream/status.json` |
| `BROADCAST_PORT` | Puerto expuesto exclusivamente en loopback por Compose | `8088` por defecto |
| `DJ_ENABLED` | Activa entradas autenticadas para un estudio privado | `0` por defecto |

Un Caddy instalado en el mismo host puede mantener el mismo origen en producción. Ejemplo con un dominio bajo tu control y la web escuchando en el puerto 5173. Sustituye el dominio y dirige su DNS al servidor. La obtención de certificados públicos requiere que Caddy pueda completar la validación del dominio.

```caddyfile
radio.example.net {
    handle /stream/* {
        reverse_proxy 127.0.0.1:8088
    }
    handle {
        reverse_proxy 127.0.0.1:5173
    }
}
```

Usa `handle` para conservar el prefijo del mount. El gateway solo acepta los mounts autorizados y su recurso de estado. La administración de Icecast, la escritura de metadatos y los puertos de origen permanecen dentro de la red interna. Revisa el funcionamiento del proxy elegido con una escucha larga, incluida una desconexión del navegador. [Documentación de Caddy sobre reverse_proxy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy) y [HTTPS automático](https://caddyserver.com/docs/automatic-https).

## Programación y licencias

`rights.json` identifica las grabaciones aprobadas por emisora, en el orden en que deben sonar. Cada archivo tiene una ruta local, una referencia de autorización y su huella SHA-256. El arranque verifica el archivo completo antes de generar las playlists. Las rutas deben resolver dentro de `public/audio` y utilizar nombres con caracteres alfanuméricos, guion o subrayado. La carpeta se monta en modo de solo lectura. La programación actual y sus másteres están descritos en [AUDIO-ASSETS.md](../../docs/AUDIO-ASSETS.md).

Para incorporar contenido autorizado:

1. Conserva en el archivo de administración la autorización de difusión, su ámbito territorial y sus fechas. Usa un identificador de referencia apto para mostrarse públicamente. Configurar un enlace en el catálogo musical únicamente añade información editorial.
2. Copia el MP3 autorizado en `public/audio`. Incluye etiquetas ID3 de título y artista. Calcula su huella con `sha256sum public/audio/archivo.mp3`, `shasum -a 256 public/audio/archivo.mp3` o `Get-FileHash public/audio/archivo.mp3 -Algorithm SHA256` en PowerShell.
3. Añade la referencia en `rights` y el objeto `{"file":"archivo.mp3","sha256":"…","rightsReference":"…"}` en `recordings` de la emisora. La primera pista es la reserva que usa Liquidsoap si la playlist pierde un archivo. El valor de `crossfadeSeconds` admite de 0 a 5, con 0 como valor inicial.
4. Arranca con `up --build -d` para actualizar el manifest copiado en las imágenes. Comprueba estado, audio y metadatos. Los cambios en base de datos del estudio web configuran proveedores del reproductor. La rotación del codificador se despliega con este registro de ficheros revisados.

El nombre de una emisora y la inclusión de una canción en la investigación editorial no conceden derechos de retransmisión. Los títulos comerciales del explorador permanecen en sus proveedores. Cada miembro de la audiencia recibe el mismo flujo por emisora, sujeto al búfer de cada conexión.

## Estudio en directo opcional

Con `DJ_ENABLED=1`, Liquidsoap abre entradas Icecast compatibles en el puerto **9000 privado** del trabajador, con un mount por slug, usuario `source` y contraseña de `.secrets/dj`. Las seis entradas comparten la credencial del estudio autorizado. El acceso se limita a procesos autorizados en la misma red, un túnel seguro o una VPN del operador. Una entrada autenticada tiene prioridad inmediata y el fin de la sesión devuelve la emisión a la rotación. La validación de derechos de las intervenciones en vivo corresponde al operador. El comprobador automatizado verifica la configuración con ambas posiciones del interruptor. La prueba publicada incluye las rotaciones grabadas.

## Observabilidad y operación

El gateway consulta `/status-json.xsl` en el origen privado. Para cada mount anunciado comprueba que recibe una respuesta de tipo audio con bytes. El nuevo muestreo se inicia cinco segundos después del anterior. La salida resume los resultados y omite la administración interna y las direcciones de oyentes.

| Estado de una señal | Observación |
|---|---|
| `active` | El mount aparece en Icecast y la comprobación ha recibido audio. |
| `no-source` | Icecast responde, pero falta la fuente del mount. |
| `unknown` | Existe en las estadísticas pero la comprobación de audio falla. |
| `unreachable` | El origen o sus estadísticas no responden. El gateway devuelve HTTP 503 en la consulta de estado. |

`listeners` cuenta las respuestas de audio abiertas a través del gateway. `bytesServed` cuenta bytes de audio recibidos para su entrega a clientes desde que arrancó el gateway. Las sondas internas quedan fuera de ambos contadores. Una reproducción que se corta durante el envío puede dejar bytes pendientes en el búfer del sistema. La comprobación no inspecciona el contenido musical ni clasifica silencio. Icecast puede combinar artista y título en el campo ICY usado por el reproductor.

Las claves de fuente, administración, relé y estudio se generan con aleatoriedad del sistema. `.secrets` se excluye de Git y del contexto de construcción. La inicialización repetida conserva los archivos existentes. En POSIX, su directorio es privado, de modo 0700. Docker monta a cada servicio sus secretos asignados. Para rotarlos, detén los servicios, sustituye los archivos en ese directorio y recrea los contenedores. Conserva bajo copia cifrada las autorizaciones, las grabaciones, el manifiesto y las credenciales del operador. El estado de playout es volátil.

La puerta de enlace admite hasta 96 conexiones simultáneas de escucha y el origen permite 150 clientes para dejar margen a las sondas. Estos valores son límites de configuración. A 96 kbit/s, un oyente continuo consume aproximadamente **43,2 MB por hora** antes de la sobrecarga de transporte. Cincuenta oyentes consumen aproximadamente **4,8 Mbit/s** de audio. Para ampliar capacidad, mide tu salida de red y revisa relés compatibles con Icecast o una distribución HLS específica que respete permisos y regiones.

## Pruebas

Para probar el gateway ya arrancado se necesitan Python 3.11+, `ffmpeg` y acceso a las URLs de escucha. El verificador comprueba las seis respuestas, decodifica el audio, mide conexiones simultáneas, contrasta bloques MP3 de dos oyentes por emisora y consulta el estado durante la carga.

```sh
python3 infra/broadcast/verify.py --url http://127.0.0.1:8088 --listeners 12 --seconds 5
```

En Linux con `icecast2`, `liquidsoap`, Node y `ffmpeg` instalados se puede ejecutar toda la secuencia sin Docker. La prueba inicia sus propios procesos en puertos de loopback efímeros, comprueba la transición de metadatos, detiene y reinicia el codificador y después detiene y reinicia Icecast mientras sigue funcionando Liquidsoap. Al acabar cierra esos procesos. Admite `ICECAST_BIN`, `ICECAST_DATA` y `LIQUIDSOAP_BIN` para instalaciones no estándar.

```sh
python3 infra/broadcast/verify.py --native --listeners 12 --seconds 5 --output /tmp/leonida-broadcast.json
```

Si el estado indica `no-source`, revisa los logs de `broadcast-worker` y la carpeta de audio. Un fallo de hash detiene la puesta en marcha hasta que el medio coincida con la revisión autorizada. Si el gateway devuelve 503, revisa `icecast`, sus ficheros de credenciales y su conectividad interna. Si la URL de escucha funciona y la web sigue mostrando una caída, revisa la URL del monitor desde el contenedor web y la ruta `/stream/*` desde el navegador.

## Referencias técnicas

- [Formato de configuración de Icecast 2.4](https://icecast.org/docs/icecast-2.4.1/config-file.html)
- [Estadísticas de Icecast y endpoint JSON](https://www.icecast.org/docs/icecast-2.4.1/server-stats.html)
- [Liquidsoap, fuentes, fallbacks y distribución](https://www.liquidsoap.info/doc-2.2.5/quick_start.html)
- [Liquidsoap, entrada de estudio y selección de fuente](https://www.liquidsoap.info/doc-2.3.3/cookbook)
- [Paquete Debian de Icecast](https://packages.debian.org/trixie/icecast2) y [paquete Debian de Liquidsoap](https://packages.debian.org/trixie/liquidsoap)
