## 2026-11-19 — Dual local soundtrack and free live radios

- Two explicitly selectable listening modes: project-local GTA VI soundtrack and free internet radio.
- Independent `canciones/` folder for every one of 21 stations, with 241 track titles assigned to their radio in `.txt` lists; no commercial audio files bundled.
- Local song-library API, safe audio serving with HTTP byte range support, path and symlink restrictions; loopback-only music access.
- Playback of songs from disk, automatic next track, volume/mute, explicit empty-library messages and rescan button.
- Local audio importer CLI with dry run, safe copy/move and optional forced station assignment; status CLI.
- Mode selector component isolated in `web/ListeningModeToggle.tsx`, new smoke/integration tests.
- Original free Radio Browser mode, selectors and visual theme preserved.

## 2026-11-19 — Keyboard & sleeve UX patch

- Full-bleed record sleeve art: removed internal 15% padding and square borders; eliminated duplicated wordmark on original editorial covers.
- Radio selection keeps its vertical scroll position when tuning within the home/radio screens.
- Horizontal dial: Left/Right keys preview, Enter confirms; click/touch/onscreen arrows still tune immediately.
- Controller legend now displays ← and → rather than L1/R1, with a visible Enter hint.
- Prevents focus-driven document scrolling during keyboard preview via `focus({ preventScroll: true })`.
- Playwright regression tests added for scroll preservation, keyboard preview/tune and artwork sizing.

# CHANGELOG

## 2026-11-19 — Full Dial / Station Ribbon / Podcasts

- 21 emisoras GTA VI referenciadas por GTABase: seis previews oficiales y quince emisoras documentadas por terceros.
- Nuevo selector horizontal `StationRibbon` inspirado en la captura aportada; controles L1/R1, teclado y táctil, avance centrado y sin recrear audio.
- Rueda radial limitada a las seis emisoras presentadas por Rockstar.
- 149 canciones adicionales (total 241) añadidas como metadatos `REPORTED`; fuente Radio Browser intacta.
- Ficha y sección `/podcasts` con The Wipe y Ask Dr. Nita; no se inventan episodios ni se distribuye audio no autorizado.
- Cinco logotipos procedentes de la captura del usuario; el resto no oficial usa arte SVG editorial marcado como provisional.
- Datos de emisoras en `data/station-directory.json`, sincronización idempotente con `npm run directory:sync` y pruebas de integridad.
- 59 pruebas automáticas correctas, TypeScript y ESLint correctos. Compilación Vite pendiente de verificar en Windows: falta la dependencia nativa de rolldown en el entorno Linux de ejecución.


## 2026-11-19 — Radio Drawer & Scalable Catalog

- Nuevo panel plegable `RadioDock` con Play/Pausa, selección de fuentes, importación y metadatos sin scroll horizontal.
- El nodo de audio permanece montado durante cambios de visibilidad; los vídeos de YouTube opcionales permanecen visibles.
- 71 canciones adicionales documentadas en GTABase (catalogadas `REPORTED`, no oficiales), total 92; actualizaciones idempotentes mediante `npm run catalog:sync`.
- Etiquetas de Radio Browser movidas a `data/radio-genres.json`. `npm run station:add` crea una emisora de comunidad con logotipo provisional y configuración de géneros.
- Pruebas ampliadas a 54; typecheck, lint y formato comprobados.
- Sin cambios a la fuente principal de audio: Radio Browser gratuito y directo; sin nuevas dependencias de pago.

## 2026-11-19 — Modo local yt-dlp opcional

- Añadido adaptador de extracción para escucha local mediante yt-dlp, aislado de las rutas públicas de streaming y limitado a conexiones de loopback.
- Reproductor M4A nativo en la web, cambio automático al modo local cuando el ejecutable está disponible, selector de fuentes y recuperación acotada tras fallos.
- Resolución restringida a IDs del catálogo verificado y URLs de CDN conocidas; procesos sin shell, límites de tiempo y caché temporal de URLs.
- Lanzador de Windows y descargador del ejecutable oficial; nueva configuración y documentación de diagnóstico.
- Suite automatizada ampliada a 45 pruebas con nuevas pruebas de API/stream y ciclo de vida del reproductor.
- Nota: pruebas con streams simulados; los vídeos comerciales no pudieron verificarse reproduciéndose desde este entorno.

## 2026-11-19 — Reparación de reproducción Real Music

- Cambio de puerto predeterminado en Windows a 3000 (5173/5174 estaban reservados).
- Rotación acotada de publicaciones de YouTube cuando el proveedor indica que un vídeo está bloqueado.
- Se agregaron otras publicaciones del canal oficial del artista para Like A Pimp, sin prometer que admitan inserción.
- Reproducción de archivos de audio elegidos por el usuario directamente en el navegador, sin subir ni empaquetar música comercial.
- Mensajes de error y enlaces de salida más claros; pruebas específicas del motor musical.


## 2026-11-19 — Real Music Edition

- Reemplazado el modo audible de sesiones artificiales por canciones reales de las seis emisoras mediante el reproductor oficial e incrustado de YouTube.
- Cambios de emisora y controles del reproductor integrados; avance de canción dentro del canal, enlaces alternativos a Spotify/YouTube y manejo de bloqueos regionales.
- 18 temas con atribución oficial reproducibles; las tres fichas de atribución no confirmada siguen en el catálogo, pero no se reproducen como oficiales.
- Sustituidas las ilustraciones sintéticas por logotipos y fondos de GTA VI alojados en el sitio oficial de Rockstar.
- Eliminados 12 MP3, ocho fondos/carátulas sintéticos, cliente compilado anterior y capturas obsoletas.
- CSP actualizada para la API de YouTube y el arte oficial; validación del catálogo restringida a medios Rockstar.
- Añadido `INICIAR_LEONIDA.bat` para instalar, compilar y arrancar en Windows usando el puerto 3000.

Esta entrega requiere conexión a Internet para imágenes y reproducción musical. No incluye canciones comerciales como archivos ni permite eludir las restricciones de los proveedores.

## 19/11/2026 — Free Radio Browser + Radio Wheel FX

- Fuente por defecto: Radio Browser (emisoras independientes de géneros similares, sin YouTube).
- Nuevo endpoint `/api/free-radio/stations/:slug` con caché, filtros de HTTPS/codec y normalización de fuentes.
- Reproducción de `<audio>` nativo con fallbacks y timeout para streams que no arrancan.
- El minirreproductor identifica la radio externa y diferencia expresamente su música de la banda sonora de GTA VI.
- Rueda de emisoras con cuatro efectos originales Web Audio, respetando las opciones de sonidos y mute.
- Lanzador Windows simplificado sin yt-dlp, en puerto 3000.

## Descargador de archivos autorizados

- `DESCARGAR_CANCIONES.ps1` y lanzador `.bat` para Windows.
- `canciones/FUENTES-DESCARGA.csv`: 241 referencias con espacio para URLs directas y autorización de descarga.
- `scripts/descargar-canciones.mjs`: motor sin dependencias nuevas; asignación por emisora, validación de formato, límite de tamaño, exclusión de duplicados e informe CSV.
- No incorpora canciones comerciales, ni URLs de descargas no autorizadas.
