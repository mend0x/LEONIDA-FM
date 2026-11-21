# Sesiones originales de LEONIDA FM

Los doce instrumentales de la demo se compusieron para este proyecto. «Leonida Sound Department» es el crédito de producción del proyecto. Cada nota, instrumento, golpe de batería y respuesta de sala se sintetiza en `scripts/compose.py` a partir de osciladores, envolventes y ruido con semilla fija. El render funciona sin red y sin muestras externas.

## Permiso de uso

Se permite copiar, empaquetar, adaptar y emitir las doce composiciones y sus másteres como parte de LEONIDA FM y de sus despliegues, incluidos los de acceso público. Esta autorización corresponde exclusivamente al material original enumerado aquí. Los temas comerciales del explorador musical y el contenido de Rockstar pertenecen a sus respectivos titulares y requieren sus propias autorizaciones para su retransmisión.

## Másteres

Cada MP3 incluye artista, título y álbum en etiquetas ID3v2.3. Los archivos están en `public/audio/`. El manifiesto que debe consultar el programador es `data/programs.json`, con las duraciones del contenedor MP3 en segundos. La columna de duración se redondea a centésimas únicamente en esta tabla.

| Señal | Programa | Duración | Sonoridad integrada | Pico verdadero |
|---|---|---:|---:|---:|
| Flash FM | Heat Mirage | 33,72 s | −16,41 LUFS | −5,31 dBTP |
| Flash FM | Marisol After Dark | 30,51 s | −16,42 LUFS | −4,38 dBTP |
| Cocoteo FM | Patio de Medianoche | 37,33 s | −16,44 LUFS | −6,45 dBTP |
| Cocoteo FM | Calle de Cobre | 34,95 s | −16,43 LUFS | −6,03 dBTP |
| Back Country Radio | County Line Static | 28,26 s | −16,43 LUFS | −5,70 dBTP |
| Back Country Radio | Rain on the Causeway | 31,01 s | −16,40 LUFS | −3,91 dBTP |
| The Chamber 106.6 | Salt Furnace | 25,31 s | −16,36 LUFS | −1,56 dBTP |
| The Chamber 106.6 | Chrome Fracture | 28,47 s | −16,37 LUFS | −2,53 dBTP |
| Dirty South Classics | Low Beam Ledger | 36,49 s | −16,41 LUFS | −5,00 dBTP |
| Dirty South Classics | Southbound Wax | 33,52 s | −16,42 LUFS | −4,58 dBTP |
| Afro Bank FM | Banyan Steps | 34,64 s | −16,42 LUFS | −6,28 dBTP |
| Afro Bank FM | Copper Kettle Keys | 33,15 s | −16,42 LUFS | −6,29 dBTP |

## Arreglos

- **Flash FM** combina arpegios de piano eléctrico con acordes de sintetizador abierto en estéreo, bajo pulsado y caja con reverberación corta.
- **Cocoteo FM** alterna clave de dos y tres golpes, congas afinadas y anticipaciones de montuno. Las dos piezas cambian de tonalidad, tempo y patrón de piano.
- **Back Country Radio** alterna rasgueos descendentes y ascendentes. El punteo simula el decaimiento de los armónicos de una cuerda, con una segunda voz que desliza la afinación como una pedal steel.
- **The Chamber 106.6** combina dos interpretaciones sintetizadas de acordes de quinta, afinadas y desplazadas independientemente, con apagados de palma, saturación de amplificador y resonancia de pantalla.
- **Dirty South Classics** lleva la caja a medio tiempo, con bombos y subgraves largos, variaciones de hi-hat y respuestas de campanas o metales.
- **Afro Bank FM** construye el pulso sobre el piano eléctrico y el log drum afinado. Los shakers y las congas responden al desplazamiento de los graves.

## Reproducción y comprobación

Los másteres se distribuyen ya codificados. Para escuchar la demo basta con el reproductor web. Para modificar una composición o volver a medir el material, se verificó este entorno de render el 18 de noviembre de 2026.

| Herramienta | Versión de referencia |
|---|---|
| Python | 3.12.14 |
| NumPy | 2.3.5 |
| SciPy | 1.17.0 |
| FFmpeg y FFprobe | 7.1.5, con el codificador libmp3lame |

Desde la raíz del repositorio, estos comandos instalan las dependencias de análisis y comprueban los másteres. FFmpeg y FFprobe deben estar en el PATH.

```sh
python -m pip install numpy==2.3.5 scipy==1.17.0
python scripts/compose.py --verify
```

El siguiente comando vuelve a componer los doce másteres con las semillas publicadas.

```sh
python scripts/compose.py
```

La comprobación decodifica íntegramente los 12 MP3, lee sus etiquetas, coteja la duración con el manifiesto y mide sonoridad y pico en la salida decodificada. También inicia cada pieza al 12 %, 53 % y 88 % de su duración y comprueba la presencia de señal útil en esas 36 incorporaciones. Los doce ficheros suman 6.205.345 bytes y usan MP3 estéreo de 44,1 kHz a 128 kbit/s. El resultado medido cubre estos activos y puede reproducirse con el comando anterior.

Se volvió a sintetizar «Heat Mirage» en un directorio vacío con el mismo entorno. El archivo publicado y el nuevo coincidieron byte por byte. Ambos dieron el SHA-256 `69101436462150f85ef93aa319101b7f6cd0efe65216a4b9a7b94557123f849e`.

## Elección del formato de reproducción

| Fuente | Uso en esta versión | Comprobación operativa |
|---|---|---|
| MP3 | Los doce segmentos y los seis montajes Icecast locales usan MP3. Un mismo archivo sirve al navegador y alimenta al emisor. | Entregar `audio/mpeg` y permitir peticiones por rango sobre los archivos estáticos. FFprobe valida los doce segmentos. |
| AAC | Opción para señales autorizadas que ya se entreguen así. La compatibilidad depende tanto del códec como de su contenedor. | Probar el URL concreto y su MIME en cada navegador objetivo. No se suministra una segunda codificación AAC. |
| HLS | Proveedor de directo cuando el navegador admite HLS nativo. Puede ser interesante si el operador ya dispone de segmentos, listas y distribución HTTP. | El reproductor consulta `canPlayType('application/vnd.apple.mpegurl')`. Una respuesta vacía descarta esa fuente. `maybe` y `probably` permiten intentar la conexión. El evento de reproducción confirma que los segmentos se decodifican. |
| Opus / Vorbis | Alternativas para una futura distribución con otros límites de ancho de banda. Los cortes de esta entrega emplean un único códec. | Antes de añadirlos, comprobar la combinación real de códec, contenedor, navegador, servidor de origen y controles móviles. |

El reproductor intenta primero una fuente habilitada declarada en línea, después una de estado desconocido y por último una que el monitor declara caída. En modo automático, la prioridad del operador desempata dentro de cada grupo. Las opciones de menor o mayor tasa eligen entre las fuentes del mismo grupo con un `bitrateKbps` declarado. A igualdad de tasa, o si ninguna la declara, se conserva el orden del operador. Si la primera URL falla, prueba otra fuente de directo admitida y mantiene los reintentos espaciados cuando se agotan las alternativas. La aplicación ofrece la demo por elección expresa del oyente cuando falta una emisión utilizable. En HLS, una URL de lista y sus variantes deben corresponder a contenido cuya distribución esté autorizada.

Referencias de compatibilidad revisadas el 18 de noviembre de 2026. [Guía de códecs web de MDN](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Audio_codecs) · [Detección de soporte en HTMLMediaElement](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/canPlayType) · [HTTP Live Streaming de Apple](https://developer.apple.com/streaming/)
