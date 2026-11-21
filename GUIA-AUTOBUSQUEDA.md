# LEONIDA FM - Búsqueda automática de canciones

Este kit usa el catálogo de `canciones/FUENTES-DESCARGA.csv` (241 referencias) para buscar vídeos por artista y título mediante `yt-dlp` y guardar sus URLs en `canciones/ENLACES-YTDLP.csv`. Para las fuentes de audio cuya descarga esté permitida, guarda archivos `.mp3` (si hay FFmpeg) o `.m4a` (sin FFmpeg) en `canciones/<emisora>/`. No se incluyen archivos musicales.

## Primer arranque en Windows 11

1. En la carpeta del proyecto, abre PowerShell.
2. Comprueba 5 títulos primero:

   ```powershell
   .\DESCARGAR_CANCIONES.ps1 -Limite 5
   ```

3. Comprueba el resultado en `canciones/ESTADO-AUTOBUSQUEDA.csv`.
4. Ejecuta el catálogo completo:

   ```powershell
   .\DESCARGAR_CANCIONES.ps1
   ```

   O simplemente ejecuta `DESCARGAR_CANCIONES.bat` con doble clic. El primer inicio descarga `yt-dlp.exe` de GitHub oficial a `tools/` si no está instalado. Node.js 22+ debe estar disponible. Para YouTube se utiliza Node como runtime JavaScript y el proveedor EJS oficial de yt-dlp, sin cuenta de pago. La disponibilidad dependerá de YouTube, la conexión y las restricciones de cada publicación.

## Otras opciones

```powershell
.\DESCARGAR_CANCIONES.ps1 -SoloEstado
.\DESCARGAR_CANCIONES.ps1 -SoloEnlaces
.\DESCARGAR_CANCIONES.ps1 -Emisora flash-fm
.\DESCARGAR_CANCIONES.ps1 -Limite 10
.\DESCARGAR_CANCIONES.ps1 -ActualizarEnlaces
.\DESCARGAR_CANCIONES.ps1 -PermitirDudosas
```

- **SoloEstado:** revisa qué audio está instalado sin conexión.
- **SoloEnlaces:** busca y guarda enlaces pero no descarga.
- **Emisora:** filtra una emisora por nombre de su carpeta.
- **Limite:** procesa como máximo N canciones todavía pendientes de descarga.
- **ActualizarEnlaces:** vuelve a buscar aunque haya enlaces guardados.
- **PermitirDudosas:** acepta sugerencias con coincidencia moderada; aumenta el riesgo de descargar una versión incorrecta.

El sistema deja en `REVISAR` las coincidencias ambiguas. No descarga archivos con coincidencias bajas. Los enlaces son a la publicación original, **no URLs directas de MP3**; por eso se gestionan con este nuevo script, no con el importador antiguo de URLs directas.

Si no detecta FFmpeg utiliza M4A (AAC), que admite LEONIDA FM. Con FFmpeg en el PATH convierte la fuente de audio a MP3.

## Aviso

Úsalo solo para contenido que tengas derecho a descargar y conservar. La existencia de una publicación en un buscador no equivale a una licencia de descarga. Algunos vídeos pueden estar bloqueados o requerir autenticación. Este kit no elude DRM.
