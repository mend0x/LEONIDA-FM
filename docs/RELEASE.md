# LEONIDA FM 1.0

## Arranque del ZIP

Descomprime el archivo y abre una terminal en la carpeta `leonida-fm`, donde está `package.json`. Con Node.js 24 instalado, ejecuta `node server/node.mjs` y abre [el dial](http://127.0.0.1:5173). La aplicación ya está compilada y la demo funciona sin instalar paquetes ni configurar claves. Pulsa el botón de reproducción para empezar a escuchar.

Las seis emisoras emiten en modo demo con un reloj compartido y dos piezas originales por emisora. El explorador también documenta canciones vinculadas al juego y sus fuentes. Para conectar un directo propio, consulta la [guía de operaciones](OPERATIONS.md).

## Comprobaciones

| Área | Resultado |
| --- | --- |
| API, programación, reproductor y rueda de emisoras | 37 pruebas aprobadas con `npm test` |
| Navegación y accesibilidad | 26 pruebas aprobadas en Chromium. Las siete vistas analizadas con axe tuvieron cero infracciones detectadas. Esta ejecución precede a los ajustes finales de calidad de audio y precarga móvil. [Informe de navegador](qa/formal-browser-tests.json) |
| Emisión con Icecast y Liquidsoap | Seis señales MP3 decodificadas y doce oyentes de prueba simultáneos. El ensayo incluyó interrupciones y recuperación. [Mediciones](../infra/broadcast/verified-native.json) |
| Entrada de estudio | Se verificaron la entrada del DJ en una emisora y la vuelta a su programación al desconectar. [Mediciones](../infra/broadcast/verified-studio.json) |

Los formatos de móvil y tableta se comprobaron por emulación. Quedan pendientes las pruebas en teléfonos físicos, Safari/WebKit y un mando físico.

## Capturas

[Portada en portátil](qa/formal-screenshots/landing-laptop.webp) · [Dial en Android emulado](qa/formal-screenshots/radio-android.webp) · [Rueda de emisoras](qa/formal-screenshots/radio-wheel.webp) · [Índice de capturas](qa/formal-visual-captures.json)

[Arquitectura](ARCHITECTURE.md) · [API](API.md) · [Procedencia de la música](SOURCES.md) · [Piezas de la demo](AUDIO-ASSETS.md) · [Licencias](LICENSES.md)
