# LEONIDA FM · Cloudflare Pages (beta con música alojada)

**Objetivo:** el beta tester abre un enlace y reproduce las 21 emisoras del catálogo, las radios independientes online y las 235 pistas de la biblioteca GTA VI publicadas con autorización. Ningún PC particular debe permanecer encendido.

## Subir la adaptación

1. Ejecuta `INSTALAR-Y-SUBIR.bat` desde el ZIP extraído. El script clona el GitHub original, aplica solamente los archivos de este parche, ejecuta la prueba del generador, `npm ci`, `npm run typecheck` y la compilación del frontend, y finalmente hace commit/push sobre `main` con tu sesión de Git.
2. La biblioteca de ~0,88 GiB **ya está en Git LFS**. El instalador evita descargarla en tu PC para esta operación. La descarga de los objetos LFS se hace durante la construcción en Cloudflare.

## Crear el proyecto Pages

En [Cloudflare](https://dash.cloudflare.com/) selecciona **Workers & Pages > Create > Pages > Connect to Git**, conecta GitHub y elige `mend0x/LEONIDA-FM`.

| Campo | Valor |
| --- | --- |
| Production branch | `main` |
| Root directory | `/` |
| Build command | `npm ci && node scripts/build-cloudflare.mjs` |
| Build output directory | `dist/client` |
| Node.js | 22.16.0 (archivo `.node-version` incluido) |
| Environment variables | Ninguna imprescindible |

**No elijas Direct Upload**. El objetivo es que cada push a `main` publique la app automáticamente y que Cloudflare recupere los archivos LFS del repo.

### Comprobaciones antes de compartir la beta

- Abre `https://<tu-proyecto>.pages.dev/library/index.json`: debería indicar `"tracks":235` y 21 entradas de emisoras.
- Abre `https://<tu-proyecto>.pages.dev/library/flash-fm.json`: debe mostrar canciones y URLs reales `/canciones/flash-fm/...`.
- Prueba directamente una URL `.m4a` de ese manifiesto: debe devolver audio, no un puntero Git LFS ni una página HTML.
- En LEONIDA FM activa **GTA VI** y pulsa reproducir; cambia de canción y emisora, repite en iPhone.
- Activa **Radio en directo** y comprueba emisoras externas de Radio Browser. Dependen de servidores de terceros y pueden estar inactivos o bloquear clientes.

### Qué hace la compilación

- `scripts/build-cloudflare.mjs` genera el frontend original con Vite y activa el modo estático Cloudflare exclusivamente para esa compilación.
- `scripts/cloudflare-assets.mjs` identifica posibles punteros Git LFS y ejecuta `git lfs pull` cuando hace falta, verifica el mínimo de 235 canciones, rechaza archivos vacíos o mayores de **25 MiB** y copia los audios a `dist/client/canciones/<emisora>/`.
- El código de `server/song-library.mjs` genera un archivo de metadatos JSON para cada emisora en `dist/client/library/`. El navegador lo usa para reproducir el audio sin servidores, cookies, cuentas ni importaciones.
- No hay acceso a SQLite, API Node ni panel admin en Pages; la versión Windows sigue teniéndolos.

Si Cloudflare indica `git: 'lfs' is not a git command`, su imagen no tiene Git LFS: será necesario habilitar Git LFS en el entorno de compilación o cambiar a un despliegue con GitHub Actions. Si falla por límite de tiempo o cuota de ancho de banda LFS, usa el registro exacto para resolverlo antes de mandar la beta.

## Coste y límites

Según la documentación de Cloudflare Pages (noviembre de 2026), el plan gratuito incluye hasta 20.000 archivos por sitio, un máximo de 25 MiB por archivo y 500 builds al mes. Los 235 archivos actuales en LFS pesan ~0,88 GiB, y el mayor ~8,7 MiB, por lo que cumplen el límite por archivo. Su recuperación completa puede estar sujeta a cuotas de Git LFS en GitHub y al límite de 20 minutos para construir en Cloudflare.
