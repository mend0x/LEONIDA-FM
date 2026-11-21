export type Language = 'en' | 'es';
export type Mode = 'demo' | 'live';
export type ListeningMode = 'radio' | 'soundtrack';
export type StreamQuality = 'auto' | 'lowest' | 'highest';
export type Confidence = 'OFFICIAL' | 'REPORTED' | 'UNVERIFIED' | 'COMMUNITY';
export interface Track {
  title: string;
  artist: string;
  confidence: Confidence;
  evidence: string[];
  spotifyUrl?: string;
  sourceUrl?: string;
  youtubeId?: string;
  youtubeAlternates?: string[];
  youtubeUrl?: string;
}
export interface PodcastShow {
  id: string;
  title: string;
  host: string;
  description: string;
  status: Confidence;
  audioStatus: 'NOT_PUBLICLY_AVAILABLE' | 'EXTERNAL_LINK';
  sourceUrl: string;
  episodes: Array<{ id: string; title: string; url?: string }>;
}
export interface Station {
  slug: string;
  name: string;
  shortName: string;
  genre: string;
  genreEs: string;
  description: string;
  descriptionEs: string;
  hosts: string[];
  color: string;
  art: string;
  confidence: Confidence;
  evidence: string[];
  tracks: Track[];
  officialUrl?: string;
  sourceUrl?: string;
  featured?: boolean;
  kind?: 'music' | 'talk' | 'mixed';
  artProvenance?: 'publisher' | 'user_reference' | 'original_placeholder';
  shows?: PodcastShow[];
}
export interface Reference {
  id: string;
  name: string;
  url: string;
}
export interface Expanded {
  slug: string;
  name: string;
  confidence: Confidence;
  evidence: string[];
}
export interface Catalog {
  stations: Station[];
  expanded: Expanded[];
  references: Reference[];
  verifiedAt?: string;
}
export interface Program {
  id: string;
  title: string;
  artist: string;
  duration: number;
  url: string;
}
export type Programs = Record<string, Program[]>;
export interface Schedule {
  current: Program | null;
  next: Program | null;
  offset: number;
  startedAt: number;
  endsAt: number;
}
export interface Source {
  id: string;
  type: string;
  url: string | null;
  enabled: boolean;
  rightsReference?: string;
  bitrateKbps?: number;
  health?: string;
}
export interface Health {
  slug: string;
  name: string;
  demoAvailable: boolean;
  liveAvailable: boolean;
  liveStatus: string;
  title?: string | null;
  artist?: string | null;
  metadata?: { title?: string; artist?: string } | null;
}
export interface Preferences {
  language: Language;
  slug: string;
  volume: number;
  muted: boolean;
  mode: Mode;
  musicMode: ListeningMode;
  quality: StreamQuality;
  favorites: string[];
  recent: string[];
  motion: 'system' | 'reduce';
  visualizer: 'reactive' | 'ambient' | 'off';
  compact: boolean;
  showExpanded: boolean;
  sounds: boolean;
  confirmOnRelease: boolean;
  selector: 'dial' | 'wheel';
  notices: boolean;
  gamepadConfirm: number;
  gamepadCancel: number;
}
