# Contrato HTTP y administración

La API usa JSON y sirve el mismo contrato desde Node y desde el Worker. Los tiempos absolutos son milisegundos Unix en UTC. La duración y el desplazamiento de audio son segundos. El contrato OpenAPI 3.1 con los esquemas de peticiones, respuestas y errores está en [API.openapi.json](./API.openapi.json).

## API pública

| Método y ruta | Resultado |
| --- | --- |
| `GET /api/health` | Estado del proceso y comprobación de SQLite. |
| `GET /api/system/time` | Hora de servidor en `now` y fecha ISO en `utc`. |
| `GET /api/config/public` | Idiomas, modos, versión, disponibilidad del estudio y modalidad de persistencia. |
| `GET /api/stations` | Emisoras habilitadas, señales adicionales y referencias documentales. |
| `GET /api/stations/{slug}` | Ficha, canciones documentadas y fuentes de información. |
| `GET /api/stations/{slug}/tracks` | Canciones de la ficha. Permite buscar por título y artista. |
| `GET /api/stations/{slug}/schedule` | Cortes originales ordenados y revisión de la programación demo. |
| `GET /api/stations/{slug}/now-playing?mode=demo` | Corte actual, siguiente corte, desplazamiento y límites absolutos del tramo. |
| `GET /api/stations/{slug}/now-playing?mode=live` | Metadatos observados en el monitor. Las pistas desconocidas llevan `current: null`. |
| `GET /api/stations/{slug}/sources` | Orígenes de reproducción habilitados o deshabilitados y referencia pública de derechos. |
| `GET /api/broadcasts/status` | Disponibilidad de demo, fuentes en directo configuradas, salud y lecturas medidas. |
| `GET /api/events?station=flash-fm` | Eventos SSE. El parámetro opcional limita la suscripción a una emisora. |

Emisoras y canciones admiten `q`, `confidence`, `offset` y `limit`. El límite inicial es 100 y el máximo 200. La colección de emisoras también acepta `genre`. Las respuestas paginadas incluyen el número total después de aplicar los filtros. Las respuestas de catálogo y programación admiten `If-None-Match` con cinco segundos de frescura. Los estados de emisión y las operaciones privadas usan `no-store`.

El primer evento SSE, `snapshot`, entrega el estado actual. `update` indica un cambio de revisión, programa o señal. El cliente puede reconstruir el estado tras una reconexión a partir de la nueva instantánea. Se comprueba el estado cada cinco segundos. Cada conexión dura hasta cuatro minutos y EventSource vuelve a conectar. El tope por instancia es de 128 conexiones y seis por cliente. El contador del estudio representa conexiones a eventos en esa instancia. Los oyentes de radio proceden de una medición distinta en el servidor de audio.

## Emisión y telemetría

La demo calcula el corte contra un reloj UTC común en `server/schedule.mjs`. Las visitas, conexiones y desconexiones de oyentes no desplazan el comienzo de los cortes. Una emisión real entrega una sola señal por mount. Los buffers de cada navegador influyen en el retraso final.

| Estado de fuente | Interpretación |
| --- | --- |
| `unconfigured` | El operador todavía no ha configurado una fuente para la emisora. |
| `disabled` | Existen fuentes en directo que el operador ha deshabilitado. |
| `unknown` | Hay una fuente configurada y falta una observación compatible. |
| `online` | El monitor ha observado el mount activo. |
| `offline` | Se ha consultado el monitor y el mount está ausente o informa de desconexión. |
| `unreachable` | El monitor no ha podido proporcionar una lectura válida desde el arranque. |
| `stale` | La última actualización ha fallado después de una lectura válida. |

La API consulta exclusivamente la dirección de monitor que haya configurado el operador en `BROADCAST_STATUS_URL`. Admite el JSON de la pasarela incluida y el formato nativo `/status-json.xsl` de Icecast, con una o varias fuentes. La pasarela prueba los bytes de audio. El JSON nativo únicamente acredita el mount anunciado por el servidor. Las lecturas exitosas quedan en caché hasta quince segundos. El servidor Node independiente las renueva también sin oyentes. El Worker las renueva al recibir peticiones o suscripciones. Las lecturas atrasadas, mal formadas o inaccesibles no conservan un indicador de emisión activa. Una URL externa sin monitor compatible puede reproducirse en el navegador y figura como `unknown` hasta verificarla.

## Acceso al estudio

En el servidor, define `ADMIN_TOKEN` con 32 a 512 caracteres y activa una base de datos persistente. Una cadena aleatoria de 32 bytes codificada en hexadecimal cumple el requisito. En el entorno autohospedado se usa SQLite. En el Worker se usa el binding D1 con la migración aplicada. Si se ejecuta el manejador solo con el catálogo incluido, el público conserva acceso de lectura.

El estudio inicia sesión con `POST /api/admin/session` y un objeto JSON con el campo `token`. Recibe la cookie HttpOnly `lfm_session` con duración de cuatro horas, SameSite Strict, alcance `/api/admin` y atributo Secure bajo HTTPS. La base de datos conserva un resumen del identificador de sesión ligado al secreto del operador. Se puede cerrar la sesión con `DELETE /api/admin/session`. Rotar el secreto invalida todas las sesiones anteriores. Las mutaciones mediante cookie requieren un encabezado Origin del mismo sitio. Los clientes de administración también pueden usar un encabezado Bearer desde un entorno de confianza. El secreto se carga únicamente en el servidor.

| Método y ruta | Acción |
| --- | --- |
| `GET /api/admin/dashboard` | Emisoras activas, demo disponible, fuentes configuradas, fuentes conectadas, bytes, oyentes medidos, salud y eventos recientes. |
| `GET /api/admin/events?limit=50` | Hasta 200 cambios o incidencias recientes. |
| `GET /api/admin/stations` | Índice de emisoras, incluidas las deshabilitadas. |
| `GET /api/admin/stations/{slug}` | Documento editable y revisión actual en el cuerpo y en ETag. |
| `POST /api/admin/stations` | Alta de emisora con identificador estable, nombre, género y contenido opcional. |
| `PUT /api/admin/stations/{slug}` | Edición por campos de ficha, fuentes, canciones, evidencias y programación. También admite PATCH. |
| `POST /api/admin/stations/{slug}/probe` | Lectura inmediata del monitor configurado y registro de la comprobación. |

Las ediciones son atómicas. Los campos omitidos se conservan. Una colección enviada sustituye a la colección anterior. Añade `revision` al cuerpo o envía el ETag de la lectura en `If-Match`. Una revisión anterior devuelve 412. Si dos escrituras parten simultáneamente de la misma revisión, únicamente puede confirmarse una y la otra recibe 409 o 412. Después de un conflicto hay que volver a leer la ficha antes de combinar los cambios.

### Ejemplo de alta

Este documento se puede enviar a `POST /api/admin/stations`. Reutiliza una pieza original existente y crea una emisora de comunidad sin atribuirle carácter oficial.

```json
{
  "station": {
    "slug": "coastal-test",
    "name": "Coastal Test",
    "shortName": "Coastal",
    "genre": "Synth pop",
    "genreEs": "Pop electrónico",
    "description": "Local station for testing original cuts.",
    "descriptionEs": "Emisora local de prueba con piezas originales.",
    "confidence": "COMMUNITY",
    "color": "#36D7C1",
    "art": "/art/tile-flash.webp",
    "order": 8
  },
  "programs": [
    {
      "id": "coastal-heat-mirage",
      "title": "Heat Mirage",
      "artist": "Leonida Sound Department",
      "duration": 33.724082,
      "url": "/audio/flash-fm-1.mp3"
    }
  ]
}
```

La ficha acepta presentadores, descripción bilingüe, género, color, imagen local, orden y pruebas editoriales. Un cambio a OFFICIAL debe aportar una referencia del editor Rockstar. Para citar una nueva fuente, incluye sus datos bibliográficos en `evidence` y su identificador en `station.evidence` o en `tracks[].evidence`. Las canciones pueden guardar enlaces revisados de Spotify y YouTube. Los documentos de derechos privados deben permanecer en el archivo del operador. En `rightsReference` se publica únicamente un identificador o texto apto para mostrar al público.

La programación puede reordenar, renombrar o asignar cortes del inventario revisado. Para incorporar archivos nuevos en autohospedaje, coloca el audio autorizado en el volumen de recursos estáticos, comprueba sus segundos con ffprobe y añádelo a `data/programs.json` antes de reiniciar la API. El paquete alojado necesita una nueva versión para incluir un archivo físico nuevo. Reprogramar cortes existentes o incorporar una emisora con un mount ya autorizado solo requiere una actualización en el estudio.

### Activar un mount autorizado

1. Configura la lista de reproducción en la infraestructura de emisión y conserva el permiso de distribución. El perfil de ejemplo ya dispone de piezas originales.
2. Expón la pasarela de audio bajo el mismo origen en `/stream/{slug}`. Configura la URL fija del monitor. Para activar los seis mounts de referencia a la vez, establece `STREAM_BASE=/stream` y `STREAM_RIGHTS_REFERENCE` en el proceso de la API.
3. Para habilitar solo una emisora, carga su revisión y envía el cambio siguiente a `PUT /api/admin/stations/flash-fm`.
4. Ejecuta `POST /api/admin/stations/flash-fm/probe` y revisa la lectura. Abre `GET /api/stations/flash-fm/now-playing?mode=live` para ver los títulos que proporciona la fuente.

```json
{
  "sources": [
    {
      "id": "flash-originals",
      "type": "icecast",
      "url": "/stream/flash-fm",
      "enabled": true,
      "priority": 0,
      "rightsReference": "LEONIDA FM · original commissioned demonstration programs"
    }
  ]
}
```

Para un origen de reproducción externo, `STREAM_HOSTS` admite nombres HTTPS exactos separados por comas. La lista controla el host, mientras que el editor autoriza el recurso concreto con su referencia de derechos. Las URLs de medios configurables excluyen credenciales, parámetros privados, puertos adicionales e IP literales. El servidor consulta el monitor fijo y entrega al navegador el origen de reproducción. Una fuente de exploración externa usa `external`, y una inserción visible de YouTube usa `youtube` con un URL oficial de embed.

Para deshabilitar inmediatamente una emisión en el catálogo, guarda su fuente con `enabled: false`. Para retirar el audio del acceso público, desactiva también el mount en el distribuidor. Marcar `station.enabled: false` retira la ficha del dial público y conserva la información para el equipo editorial.

## Persistencia y recuperación

Cada emisora se guarda como un agregado versionado de SQLite. Las consultas SQL pueden inspeccionar individualmente las vistas `station_tracks`, `audio_sources`, `programs` y `source_evidence`. Los cambios y la publicación de cada revisión se confirman en una única sentencia. Los triggers de SQLite registran las escrituras confirmadas. Las consultas usan parámetros enlazados y los límites de tamaño se comprueban antes de interpretar el cuerpo JSON.

La migración inicial está en [001_initial.sql](../server/migrations/001_initial.sql). Node la aplica automáticamente e importa el catálogo inicial al arrancar. D1 espera el esquema aplicado durante el despliegue. Un cambio en los datos de lanzamiento actualiza las fichas intactas. Las ediciones del operador mantienen su revisión. Los snapshots de SQLite deben realizarse con la API de backup de SQLite o con `.backup` para incluir las transacciones del WAL.

El límite general es 360 peticiones por minuto y cliente. El inicio de sesión permite diez intentos por minuto. Los límites son locales a cada instancia. En un despliegue distribuido conviene configurar también el limitador del CDN o proxy. Con Node detrás de un único proxy privado que sustituya X-Real-IP por la IP de conexión, se puede activar `TRUST_PROXY=1`. Configura `PUBLIC_ORIGIN` con el origen HTTPS canónico del sitio cuando el proxy termine TLS.

## Verificación reproducible

```bash
node --test tests/api.test.mjs
```

Las pruebas cubren las rutas públicas, filtros y caché, fronteras de programación, cookies y caducidad, control de origen, revisiones concurrentes, persistencia tras reinicio, referencias, autorización de fuentes, lectura de métricas, caída y recuperación del monitor, SSE, limitación de operaciones y HTTP Range sobre una conexión real. El test del adaptador D1 ejecuta su contrato de sentencias preparadas contra SQLite local. La disponibilidad de D1 en un despliegue concreto se comprueba mediante `/api/health`.

La prueba de carga local se repite con `node tests/api-load.mjs`. El [registro de medición](./API-load.json) recoge 24 oyentes simultáneos, 120 peticiones, 24 tramos MP3 y cero errores. Incluye latencia, bytes, CPU y memoria del proceso que ejecutó servidor y clientes. La prueba mide una ráfaga de incorporación a la demo en loopback. El rendimiento del distribuidor de streaming se comprueba en su propio perfil.

### Especificaciones de referencia

- [API SQLite de Node.js](https://nodejs.org/api/sqlite.html)
- [Sentencias preparadas en Cloudflare D1](https://developers.cloudflare.com/d1/worker-api/prepared-statements/)
- [Transacciones por lotes en D1](https://developers.cloudflare.com/d1/worker-api/d1-database/)
- [Estadísticas nativas de Icecast](https://icecast.org/docs/icecast-latest/server_stats/)
- [Eventos de servidor en HTML](https://html.spec.whatwg.org/multipage/server-sent-events.html)
