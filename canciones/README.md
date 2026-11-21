# LEONIDA FM — música del proyecto

Cada emisora tiene una carpeta con su **slug**. Copia tus propios archivos MP3, M4A, AAC, OGG, OPUS, WAV o FLAC a la carpeta correspondiente. El navegador debe admitir el códec usado; MP3 es el más compatible.

En cada subcarpeta hay un listado `LISTA-DE-CANCIONES.txt` con los títulos del catálogo. Estos listados NO son grabaciones. **Esta distribución no incluye canciones comerciales.**

## Importación automática desde cualquier carpeta de Windows

Desde la carpeta raíz del proyecto, en PowerShell:

```powershell
npm run canciones:importar -- --from "C:\Users\TuUsuario\Music"  # solo muestra a dónde iría cada archivo
npm run canciones:importar -- --from "C:\Users\TuUsuario\Music" --copy
```

El script identifica archivos con nombres como `Artista - Título.mp3` y los coloca en la emisora cuyo catálogo coincide. Los ambiguos quedan sin tocar, y no sobrescribe archivos existentes.

Si todos los archivos de una carpeta pertenecen a una emisora, selecciona el destino manualmente:

```powershell
npm run canciones:importar -- --from "C:\Musica\Pop" --station flash-fm --copy
```

Para comprobar cómo va la biblioteca:

```powershell
npm run canciones:estado
```

Con el servidor iniciado puedes consultar `http://127.0.0.1:3000/api/song-library/flash-fm`. La web detecta los archivos sin reconstruir el proyecto. **No publiques la carpeta `canciones` en servidores accesibles por Internet**; el servidor limita su acceso a conexiones locales.
