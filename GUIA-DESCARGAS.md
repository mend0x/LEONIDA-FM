# LEONIDA FM — descargador y organizador de canciones

## Qué hace

Lee las **241 canciones** del catálogo y su emisora. Si has incluido una URL de descarga directa **autorizada** para alguna pista, descarga el archivo y lo guarda en la carpeta exacta correspondiente dentro de `canciones/`. Detecta el formato de audio real, evita duplicados, rechaza páginas HTML disfrazadas de música y genera `canciones/ESTADO-DESCARGAS.csv` con el resultado.

**Importante:** este proyecto no trae archivos musicales de GTA VI ni enlaces para descargar las grabaciones comerciales sin autorización. El catálogo enumera títulos; no es una fuente de descargas. El script no usa YouTube ni yt-dlp, no evade protecciones ni convierte Spotify en archivos MP3. Tampoco puede convertir enlaces de páginas web que no ofrecen una descarga directa en archivos de música.

## Preparación

1. Abre `canciones/FUENTES-DESCARGA.csv` con Excel, LibreOffice o un editor de texto.
2. Localiza la fila de una canción para la que dispongas de una URL **directa** de descarga permitida.
3. Rellena `URL_Directa` con la URL HTTPS que devuelva el archivo de audio, y `Descarga_autorizada` con `SI` cuando tengas derecho a descargarlo.
4. Guarda el CSV manteniendo el delimitador **punto y coma** y la codificación UTF-8.
5. Haz doble clic en `DESCARGAR_CANCIONES.bat` desde Windows, o ejecuta en PowerShell:

```powershell
.\DESCARGAR_CANCIONES.ps1
```

No hace falta instalar bibliotecas adicionales: se utiliza Node.js, que ya necesita LEONIDA FM.

## Comandos útiles

```powershell
# Mostrar el estado sin realizar descargas
.\DESCARGAR_CANCIONES.ps1 -SoloEstado

# Descargar solo las fuentes disponibles de una emisora
.\DESCARGAR_CANCIONES.ps1 -Emisora flash-fm

# Limitar cuántas URLs se intentan descargar en esta ejecución
.\DESCARGAR_CANCIONES.ps1 -Limite 5

# Alternativa si prefieres invocar el motor directamente
npm run canciones:descargar
npm run canciones:descargar -- --check
npm run canciones:estado
```

El motor permite HTTP únicamente con la opción explícita `-PermitirHttp`; no se recomienda para descargas normales.

## Qué significa cada estado

- `DESCARGADA`: archivo descargado y identificado como audio.
- `YA_EXISTE`: había un archivo con ese nombre y formato compatible.
- `SIN_ENLACE`: nadie ha proporcionado una URL directa para esa grabación.
- `FALTA_AUTORIZACION`: hay una URL, pero no se ha indicado que la descarga esté autorizada.
- `ERROR`: enlace caducado, error de red, límite de tamaño, contenido que no es audio, etc.
- `LISTO_PARA_DESCARGAR`: el modo `-SoloEstado` detecta una entrada preparada.

### ¿Qué pasa si descargo un álbum desde una tienda?

Si ya has obtenido archivos musicales mediante una compra o descarga autorizada en una plataforma, puedes utilizar el importador que incluye LEONIDA FM:

```powershell
npm run canciones:importar -- --from "C:\Users\TuUsuario\Downloads\Musica" --copy
```

El importador reconoce los nombres de los temas y los coloca en las carpetas. Para obtener música legal sin pagar, la disponibilidad de cada canción depende de que su titular ofrezca una descarga gratuita; **no existe una API universal de descarga gratuita de todos los grandes éxitos comerciales**.

## Prueba y límites

El descargador se ha probado con un servidor HTTP local y un archivo de audio original de prueba, además de una respuesta HTML inválida. Verifica que el audio se guarde en su emisora y que el HTML se rechace. No se han descargado ni incorporado grabaciones comerciales.

No abras la biblioteca local al público por Internet si no tienes derechos de redistribución.
