# LEONIDA FM — reparación del reproductor (19-11-2026)

## Problema observado

El vídeo de «Like A Pimp» de David Banner presentaba «Este vídeo no está disponible» dentro del reproductor oficial de YouTube. El software anterior quedaba en estado de error y no intentaba otras publicaciones ni otros temas.

## Solución implementada

- El reproductor mantiene un historial de identificadores que YouTube ha rechazado y prueba primero otras publicaciones referenciadas de la **misma canción**. Cuando no queda ninguna, busca otro tema confirmado de la emisora.
- El proceso termina al agotar los identificadores; no hay ciclos infinitos.
- Se distingue el error 153 (problemas de identificación/referrer) de los códigos 100 (inexistente) y 101/150 (inserción no permitida). El 153 no provoca saltos automáticos.
- Un vídeo que no logra arrancar después del evento `onReady` ofrece instrucciones de interacción manual, sin asumir que el titular haya restringido la inserción.
- El panel permite abrir el vídeo, buscar otra publicación y consultar Spotify.
- Es posible elegir archivos de audio reales desde el ordenador con **Importar mi audio**. Se usan URLs `blob:` locales, con un control `<audio>` visible. No se suben al servidor ni se guardan entre recargas.
- El lanzador de Windows y el servidor Node escuchan en el puerto 3000 por defecto para evitar el rango 5141–5240 reservado en el equipo del autor.

## Alcance de las comprobaciones

- `npm run typecheck`: correcto.
- `npm run lint`: correcto.
- `npm test`: 41 tests unitarios y de integración correctos. Los tests de programación usan clips **sintéticos exclusivamente como fixtures de pruebas**, sin introducir MP3 en la aplicación.
- El motor musical tiene cuatro tests adicionales: sanitización de identificadores, rotación de vídeos, error 153 y archivos locales.
- El catálogo del servidor ha sido probado para comprobar que devuelve las publicaciones alternativas de «Like A Pimp».

**Limitaciones de verificación:** el entorno de edición no tiene conexión directa con YouTube. No hemos podido escuchar ni certificar la inserción real de los vídeos. Tampoco hemos podido ejecutar aquí la compilación Vite de producción: el ZIP original contiene dependencias nativas de Windows y el entorno de pruebas es Linux. La compilación deberá ejecutarse en Windows mediante `INICIAR_LEONIDA.bat`, que instala dependencias apropiadas con `npm ci`.

No se han eludido las restricciones de YouTube; si todas las inserciones están bloqueadas en tu región, debes utilizar un reproductor externo o importar tus propios archivos de audio autorizados.
