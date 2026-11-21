import type { Station } from './types';

/**
 * The wheel prioritises the stations tuned most recently. On a fresh install
 * with no history yet, it falls back to Rockstar's six published previews.
 * The horizontal strip always includes the entire documented catalog.
 */
export function featuredStations(
  stations: Station[],
  recentSlugs: string[] = [],
  selectedSlug?: string,
): Station[] {
  const bySlug = new Map(stations.map((station) => [station.slug, station]));
  const orderedRecent = [selectedSlug, ...recentSlugs]
    .filter((slug): slug is string => typeof slug === 'string' && slug.length > 0)
    .map((slug) => bySlug.get(slug))
    .filter((station, index, list): station is Station =>
      Boolean(station) && list.findIndex((item) => item?.slug === station?.slug) === index,
    );
  if (orderedRecent.length) return orderedRecent;
  return stations.filter((station) => station.confidence === 'OFFICIAL');
}

export function stationIndex(stations: Station[], slug: string): number {
  return stations.findIndex((station) => station.slug === slug);
}

export function stationPreview(station: Station, language: 'en' | 'es') {
  if (station.kind === 'talk') {
    return language === 'es'
      ? 'Programas y podcasts · audio original no disponible'
      : 'Talk and podcasts · original audio unavailable';
  }
  return station.tracks[0]
    ? `${language === 'es' ? 'CATÁLOGO' : 'CATALOG'} · ${station.tracks[0].title} — ${station.tracks[0].artist}`
    : language === 'es'
      ? 'Sin canciones documentadas todavía'
      : 'No documented songs yet';
}
