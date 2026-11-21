> **Nuevo:** `DESCARGAR_CANCIONES.ps1` + `canciones/FUENTES-DESCARGA.csv` permiten descargar y organizar automáticamente archivos de audio desde URLs directas autorizadas. Consulta [GUIA-DESCARGAS.md](GUIA-DESCARGAS.md). No se incluyen los 241 audios comerciales.

# LEONIDA FM — GTA VI Soundtrack + Radio en vivo

## Novedad: dos modos de escucha en la misma web

- **GTA VI · Canciones**: reproduce archivos musicales que estén **dentro del propio proyecto**, en `canciones/<slug-de-emisora>/`. No necesita YouTube ni APIs para reproducir esos archivos. El reproductor busca directamente las grabaciones en el disco del ordenador y pasa automáticamente a la siguiente cuando termina la anterior. **Si la carpeta está vacía, muestra la ausencia de archivos y no sustituye la música por otro contenido sin avisar.**
- **Radios reales**: conserva la reproducción gratuita existente a través del directorio Radio Browser, con señales independientes de géneros parecidos a las emisoras del juego.

El selector entre ambos modos está encima de la interfaz y dentro del minirreproductor desplegado. La selección se guarda en el navegador. La rueda, las 21 emisoras, los podcasts catalogados y el diseño anterior se conservan.

### Carpetas de las emisoras

Hemos generado **21 carpetas** y **241 referencias de canciones** distribuidas en los listados `LISTA-DE-CANCIONES.txt`. La emisora de tertulias *The Wipe* tiene su carpeta preparada para episodios, aunque no tiene canciones catalogadas.

**Importante: el ZIP no incluye los archivos de audio comerciales.** Solo contiene sus nombres y la infraestructura para reproducirlos. Para escuchar la banda sonora real, añade los MP3/M4A/etc. que tengas a las carpetas correctas. No son enlaces ni MP3 vacíos: la app solo anuncia como disponible un archivo de audio que exista de verdad.

Ejemplo:

```text
LEONIDA-FM/
  canciones/
    flash-fm/
      LISTA-DE-CANCIONES.txt
      MGMT - Electric Feel.mp3
      Charli xcx - Good Ones.mp3
    dirty-south/
      LISTA-DE-CANCIONES.txt
      David Banner - Like A Pimp.mp3
    the-wipe/
      LISTA-DE-CANCIONES.txt
      ...tus episodios.mp3
```

Para **organizar automáticamente tu música local**, usa estos comandos en PowerShell desde la carpeta donde está `package.json`:

```powershell
npm run canciones:importar -- --from "C:\Users\TuUsuario\Music"          # simulación sin tocar nada
npm run canciones:importar -- --from "C:\Users\TuUsuario\Music" --copy   # copia según el catálogo
npm run canciones:estado                                                   # comprueba el progreso
```

El importador usa los títulos documentados para localizar cada emisora; evita duplicados y deja sin asignar los archivos ambiguos. Para copiar todos los archivos de una carpeta a una emisora concreta puedes añadir `--station flash-fm` antes de `--copy`.

Después de copiar archivos, pulsa **«Volver a buscar canciones»** en el reproductor. No es necesario volver a compilar. Consulta `canciones/README.md` para instrucciones adicionales.

Para arrancar Windows 11, extrae el ZIP y ejecuta `INICIAR_LEONIDA.bat`, o haz `npm ci`, `npm run build` y `node server/node.mjs` con `PORT=3000`.

**Uso local:** el servidor devuelve audio de `canciones/` solo a conexiones desde la propia máquina; no publiques esa biblioteca en una web o servidor expuesto a Internet.

---

# LEONIDA FM — Complete Dial / GTA VI (19/11/2026)

Web independiente inspirada en el selector de emisoras de **GTA VI**. Ahora integra **21 emisoras listadas por GTABase**, con las seis destacadas por Rockstar en la rueda radial y el resto en la tira de selección horizontal. **El audio predeterminado procede de Radio Browser**, no de YouTube, yt-dlp ni una cuenta de pago.


## Nuevo dial completo — 21 emisoras

La nueva interfaz incluye una **tira horizontal cuadrada**, al estilo de la captura de referencia del usuario. Selecciona una emisora inmediatamente con clic, desplazamiento táctil o botones laterales. En el teclado, **← / →** recorren las 21 carátulas sin cortar la música y **Enter** confirma la selección. Los indicadores **← / →** muestran el desplazamiento y un contador de posición.

La **rueda radial** se reserva para las **seis estaciones presentadas oficialmente por Rockstar**, mientras que la tira y el directorio incluyen las **21 emisoras referenciadas en GTABase**. Las otras quince están etiquetadas como `REPORTED` y no se presentan como confirmaciones de Rockstar.

- **241 canciones documentadas**: 92 previas + 149 entradas de las otras quince emisoras. No son archivos de audio ni autorizan su emisión.
- **The Wipe** es un canal centrado en charlas y podcasts. Incluye una ficha editorial de **Ask Dr. Nita**, atribuido a Anitta por prensa. No se han encontrado episodios completos que podamos distribuir legítimamente; por eso no hay reproductor falso ni nombres de episodios inventados.
- **Carátulas:** las seis estaciones oficiales mantienen sus recursos de Rockstar. Para **V-Rock, Vice City FM, VCRR, The Wipe y Symphony FM** se han recortado los logotipos visibles en la captura aportada por el usuario (calidad limitada por la resolución). Las diez restantes usan **SVG originales provisionales, con asterisco y aviso**. No se ofrecen como arte oficial.
- **Señal continua:** Radio Browser sigue buscando una emisora independiente del género correspondiente. Nunca se presenta su programación como audio oficial de GTA VI.

### Actualizar el listado sin editar React

Los datos están en `data/station-directory.json`. Incluyen nombre, género, canciones, tipo de contenido, procedencia y etiquetas de Radio Browser. Tras editar ese fichero:

```powershell
npm run directory:sync
npm run directory:check
npm test
```

El comando `directory:sync` incorpora o actualiza únicamente las quince estaciones secundarias, sin sustituir las fichas oficiales existentes. Los **componentes están desacoplados**: `web/StationRibbon.tsx`, `web/station-selection.ts` y `web/station-ribbon.css`.

Para añadir canciones a las seis emisoras de Rockstar, sigue usando `data/station-track-additions.json` y `npm run catalog:sync`; después ejecuta `npm run directory:sync` para mantener la versión del catálogo. Para crear una emisora original de la comunidad, `npm run station:add` sigue disponible.

Consulta `docs/FULL-DIAL.md` para el inventario, la procedencia de las carátulas y las limitaciones.

---

## Novedades de esta versión

- **Panel de audio desplegable:** ahora se inicia plegado, mostrando una pequeña tarjeta con el nombre de la señal y Play/Pausa. Pulsa el título o el chevrón para abrir opciones y cambiar entre las fuentes. Los controles de la barra inferior siguen funcionando. **Plegar no desmonta ni detiene la reproducción**.
- **UX simplificada:** se eliminó el gran reproductor de HTML nativo de las radios externas, que provocaba scroll horizontal y controles duplicados. El panel tiene un único scroll vertical cuando hay poco espacio. Los enlaces/importación quedan en «Fuentes y opciones».
- **Catálogo actualizado:** 92 canciones para las primeras seis emisoras (21 anteriores + **71 documentadas en GTABase el 19/11/2026**) y 149 en las quince añadidas; **241 canciones en total**. Los nuevos temas se clasifican como `REPORTED`/`SECONDARY_STATION_LIST` y **no** como adelantos confirmados por Rockstar. Las canciones del catálogo **no son** la emisión de Radio Browser.
- **Componentes y datos desacoplados:** `web/RadioDock.tsx` y `web/radio-dock.css` encapsulan el panel; `data/station-track-additions.json` contiene incorporaciones bibliográficas y `data/radio-genres.json` las etiquetas de búsqueda de Radio Browser.
- **Nueva herramienta de estaciones:** puedes crear otra emisora desde CLI sin modificar React ni el selector.

### Añadir nuevas canciones documentadas

Añade objetos en `data/station-track-additions.json` bajo el slug de la emisora; incluye el título, artista, evidencia, URL de fuente y clasificación correcta. Después ejecuta:

```powershell
npm run catalog:sync
npm run catalog:check
```

El sincronizador no duplica canciones ya existentes y conserva los registros originales. No etiquetes contenido procedente de fans o bases secundarias como `OFFICIAL`.

### Añadir una nueva emisora

```powershell
npm run station:add -- sunset-wave "Sunset Wave" "Indie pop" "indie pop,alternative"
npm run catalog:check
npm run build
```

Esto añade su registro a `data/catalog.json`, sus géneros a `data/radio-genres.json` y un SVG provisional original en `public/art/`. Por defecto queda identificada como emisora **COMMUNITY**, no como una estación oficial de GTA VI. Puedes editar sus datos y su diseño sin tocar el componente de la rueda o el de audio. Las emisoras nuevas requieren una fuente del directorio Radio Browser que corresponda a los géneros elegidos; su disponibilidad no se garantiza.

### Pruebas nuevas

`npm test` incorpora verificaciones de consistencia entre emisoras y géneros, procedencia de las 71 incorporaciones y renderizado del panel en React. Para comprobar funcionamiento real: abre la web, pon una radio, pliega/despliega el panel y cambia de fuente; el audio no debe interrumpirse al plegar.

Consulta `docs/CATALOG-2026-11-19.md` para el detalle de procedencias.

---

## Qué escucharás (importante)

**NO son las grabaciones oficiales de las emisoras de GTA VI.** La web selecciona radios de Internet **independientes y gratuitas, con música de un género parecido** a la emisora de GTA VI elegida. El contenido (incluidos posibles anuncios) lo decide cada radio, no LEONIDA FM. No se ha autorizado ni incluido música comercial del videojuego.

Radio Browser: https://www.radio-browser.info/ — API: https://docs.radio-browser.info/

El catálogo de canciones y las imágenes identificativas de GTA VI siguen en la web como referencias informativas. El nuevo motor de audio reproduce streams HTTPS MP3/AAC de terceros, no canciones individuales de ese catálogo.

## Iniciar en Windows 11

1. Descomprime el ZIP completo y entra en la carpeta que contiene `package.json`.
2. Ejecuta `INICIAR_LEONIDA.bat` (instala dependencias con npm si faltan, compila y arranca).
3. Abre http://127.0.0.1:3000/ y pulsa «Entrar en la frecuencia» / Play.
4. Selecciona otra emisora con la rueda, con las flechas o con las tarjetas. El sistema cambia también el stream externo.

O desde PowerShell, dentro de la carpeta:

```powershell
npm ci
npm run build
$env:HOST = '127.0.0.1'
$env:PORT = '3000'
$env:ENABLE_LOCAL_YTDLP = '0'
node server/node.mjs
```

Requiere Node.js 22.13+ (mejor 24 LTS), Internet y un navegador moderno.

**Puerto 3000:** el 5173 y el 5174 están reservados en tu Windows. El `.bat` utiliza el 3000. Si ya está ocupado, cambia el valor de `PORT` a otro libre no reservado.

## Modo radio gratuito

- `GET /api/free-radio/stations/flash-fm` devuelve emisoras externas del género pop; los demás seis slugs están incluidos.
- El servidor consulta Radio Browser, normaliza las respuestas y almacena una caché de 15 minutos para evitar nuevas búsquedas.
- Se priorizan enlaces **HTTPS** con MP3/AAC y marcados como activos por el directorio. No se usa proxy abierto ni se descargan canciones.
- El cliente reproduce el URL directamente con `<audio>`. Si el stream es incompatible, falla o no empieza en 9 s, se prueban otros del mismo género.
- Puedes saltar a **Otra señal** dentro del mismo género desde el minirreproductor.
- La velocidad y disponibilidad dependen del proveedor externo y de la conexión. Radio Browser mantiene un directorio comunitario, no garantiza cada stream.
- Los medios de emisión pertenecen a sus respectivos operadores; utiliza sus enlaces y respeta sus condiciones. Las radios externas pueden mostrar anuncios en su propia señal.

## Efectos de sonido para rueda

Se añadieron sonidos **originales sintetizados en Web Audio**, sin extraer audio del videojuego:

- Abrir rueda: barrido ascendente.
- Pasar de un sector a otro (ratón, teclado, mando): clic breve de sintonización, con límite de frecuencia para evitar ruido molesto.
- Confirmar selección: tono de conexión.
- Cerrar rueda: barrido descendente.

Se respetan silencio, volumen y el ajuste **Ajustes → Sonidos de interfaz**. Está activado por defecto en instalaciones nuevas. Si ya tenías preferencias guardadas con los sonidos desactivados, actívalos manualmente allí.

## Modo de audio propio

La opción **Importar mi audio** permanece disponible: reproduce MP3, M4A, WAV, etc. elegidos por ti, sin subirlos. El backend conserva la funcionalidad avanzada para señales autorizadas de Icecast/HLS en modo privado.

La edición no instala `yt-dlp`, no usa YouTube para reproducir en el modo predeterminado y no necesita credenciales. El reproductor de YouTube y el adaptador yt-dlp se conservan solo en el código como compatibilidad heredada, no se activan con el nuevo lanzador.

## Pruebas

```powershell
npm run typecheck
npm run lint
npm test
npm run build
```

Se incluyen pruebas automatizadas de normalización de fuentes, cache de API, selección de streams y fallback sin iframes. **No se puede certificar la reproducción de una radio externa desde un test offline**: compruébala en Windows, con Internet, y usa «Otra señal» si la elegida no está disponible.

## Privacidad y derechos

LEONIDA FM es un proyecto de fans sin afiliación a Rockstar, Take-Two ni a las emisoras externas. Los recursos de GTA VI se atribuyen a sus titulares. La conexión directa a una radio externa revela a dicha emisora tu dirección IP, igual que cualquier streaming normal; los ajustes se conservan localmente. No hay reemisión de contenidos de terceros a través de nuestro servidor.

Consulta `docs/` e `infra/` para el proyecto base; algunos documentos históricos describen una edición anterior basada en demostraciones o YouTube y no sustituyen a este README.


### Controles del selector horizontal

- **← / →:** recorrer emisoras (preselección sin cortar el audio).
- **Enter:** sintonizar la emisora resaltada.
- **Clic, botones de flecha en pantalla o swipe táctil:** sintonización inmediata.
- Cambiar entre emisoras conserva la posición vertical; navegar a otra sección sí vuelve al principio.
- Las carátulas del vinilo son de borde a borde; no se añaden márgenes a las imágenes.
