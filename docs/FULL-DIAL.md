# LEONIDA FM — All Stations / 2026-11-19

**Fuente editorial:** https://www.gtabase.com/gta-6/radio-stations/
**Fuente oficial de las seis previews:** https://www.rockstargames.com/VI/music

El listado general de GTABase contiene 21 estaciones. El álbum «GTA VI: The Album» y la banda sonora «Original Score by Justice» son discos/colecciones, no emisoras, y no forman parte del selector de radio. El catálogo de canciones es bibliográfico: las grabaciones no están incluidas.

| Radio | Canciones listadas | Estado del nombre | Carátula |
|---|---:|---|---|
| Flash FM | 32 | Preview Rockstar | Rockstar |
| Cocoteo FM | 14 | Preview Rockstar | Rockstar |
| Back Country Radio | 8 | Preview Rockstar | Rockstar |
| The Chamber 106.6 | 13 | Preview Rockstar | Rockstar |
| Dirty South Classics | 17 | Preview Rockstar | Rockstar |
| Afro Bank FM | 8 | Preview Rockstar | Rockstar |
| V-Rock | 16 | GTABase | Captura del usuario |
| Stockyard FM | 8 | GTABase | SVG editorial provisional |
| Symphony FM | 7 | GTABase | Captura del usuario |
| CircoLoco Records Radio | 3 | GTABase | SVG editorial provisional |
| Emotion | 12 | GTABase | SVG editorial provisional |
| Honey FM | 13 | GTABase | SVG editorial provisional |
| Radio On-U | 6 | GTABase | SVG editorial provisional |
| The Wipe | 0 + 1 show reportado | GTABase + prensa | Captura del usuario |
| Worldwide FM | 10 | GTABase | SVG editorial provisional |
| Kaleidoscope FM | 6 | GTABase | SVG editorial provisional |
| La Ola | 11 | GTABase | SVG editorial provisional |
| Vice City FM | 10 | GTABase | Captura del usuario |
| VCRR | 34 | GTABase | Captura del usuario |
| Gloriana Blues Radio | 8 | GTABase | SVG editorial provisional |
| Leonida Jazz Radio | 5 | GTABase | SVG editorial provisional |

**Totales:** 21 estaciones / 241 canciones / 1 programa de podcast registrado, sin episodios descargables.

## Podcast documentado

- **The Wipe**: sin canciones indexadas por GTABase.
- **Ask Dr. Nita**: programa/podcast con Dr. Nita interpretada por Anitta, según prensa. https://www.uol.com.br/splash/noticias/2026/11/18/anitta-esta-no-gta-6-veja-como-sera-a-participacao-da-cantora.ghtm
- No se ha localizado una fuente pública autorizada de episodios completos; se muestra el título y fuente, no se inventan episodios ni audios.

## Arte y derechos

Las seis previews de Rockstar mantienen sus enlaces de imágenes de la versión anterior. Los recortes de cinco carátulas adicionales se extraen directamente de la captura proporcionada por el usuario en esta conversación, con resolución limitada. Las otras diez carátulas se generan como identificaciones **originales y provisionales** e indican explícitamente que NO son recursos oficiales. Los recursos de terceros no se incluyen ni se presentan como de propiedad del proyecto.

La emisión procede de Radio Browser y usa radios independientes del género, no las canciones del catálogo. En la portada del selector se muestra expresamente «CATÁLOGO» ante el tema destacado para evitar presentarlo como *Now Playing*.

## Arquitectura de ampliación

1. Actualizar `data/station-directory.json` con las fuentes y canciones de las estaciones secundarias.
2. Ejecutar `npm run directory:sync`, seguido de `npm run directory:check`.
3. Para estaciones nuevas creadas por la comunidad, usar `npm run station:add -- slug 'Nombre' 'Género' 'etiqueta1,etiqueta2'`.
4. No modificar React para cada nueva emisora: `StationRibbon` y la vista de directorio leen `catalog.stations`; las entradas de Radio Browser leen `radio-genres.json`.
5. Ampliar `shows` con episodios únicamente cuando exista título, fuente verificable, URL y permiso de reproducción.

## Verificación

- 59 pruebas Node automáticas, incluyendo integridad de catálogo, declaraciones de audio y controles de selección.
- `npm run typecheck` y `npm run lint` completados satisfactoriamente.
- `npm run build` debe repetirse en Windows tras `npm ci` por falta del binario nativo de rolldown para Linux en el entorno utilizado para modificar el ZIP.


## Navegación y carátulas — revisión de interfaz

- En el selector horizontal, `←` y `→` **preseleccionan** una emisora sin interrumpir la señal actual; `Enter` confirma el cambio. Las teclas actúan cuando no hay un campo de texto o diálogo activo.
- Al pulsar directamente una portada, una flecha en pantalla o deslizar en móvil, la sintonización se realiza en el momento (en móviles no es necesario disponer de Enter).
- La selección horizontal mantiene la posición vertical de la página; solo se centra el carrusel de portadas. Cambiar a secciones distintas sigue desplazándose al inicio.
- El arte de las fundas del vinilo ocupa el 100 % del cuadrado sin padding; las carátulas editoriales que ya incluyen el nombre evitan el texto sobrepuesto duplicado.
- La rueda radial sigue reservada para las seis estaciones oficiales, independiente del selector completo.
