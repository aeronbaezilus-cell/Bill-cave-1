import coverMidnightEchoes from '../assets/images/cover_midnight_echoes_1794801312996.jpg';
import wallpaperListeningRoom from '../assets/images/wallpaper_listening_room_1794801312314.jpg';
import wallpaperObsidianCave from '../assets/images/wallpaper_obsidian_cave_1794801311237.jpg';
import wallpaperRainySkyline from '../assets/images/wallpaper_rainy_skyline_1794801311983.jpg';
import { Playlist, QueueSlot, Track, WallpaperPreset } from '../types/music';

export const COVER_MIDNIGHT_ECHOES = coverMidnightEchoes;

export const INITIAL_WALLPAPERS: WallpaperPreset[] = [
  {
    id: 'obsidian-cave',
    name: 'Obsidian Cave',
    subtitle: 'Lantern & underground lake',
    url: wallpaperObsidianCave,
  },
  {
    id: 'twilight-valley',
    name: 'Twilight Valley',
    subtitle: 'Misty dusk ridge view',
    url: wallpaperRainySkyline,
  },
  {
    id: 'listening-room',
    name: 'Listening Room',
    subtitle: 'Warm tungsten walnut studio',
    url: wallpaperListeningRoom,
  },
  {
    id: 'mystery-living-room',
    name: 'Late Night TV',
    subtitle: 'Uploaded app cover scene',
    url: '/assets/aistudio/1794798316811_13f5c3b0.jpg',
  },
];

export const INITIAL_TRACKS: Track[] = [];

export const INITIAL_QUEUES: QueueSlot[] = [
  {
    id: 'queue-main',
    name: 'Main',
    trackIds: [],
    currentIndex: 0,
  },
  {
    id: 'queue-night',
    name: 'Late Night',
    trackIds: [],
    currentIndex: 0,
  },
  {
    id: 'queue-focus',
    name: 'Deep Focus',
    trackIds: [],
    currentIndex: 0,
  },
];

export const INITIAL_PLAYLISTS: Playlist[] = [];

export const EQ_PRESETS: Record<string, [number, number, number, number, number]> = {
  Flat: [0, 0, 0, 0, 0],
  'Cave Warmth': [3.5, 2.0, -0.5, 1.5, 2.5],
  'Deep Bass': [6.5, 4.0, 0.5, -1.0, 0.5],
  'Vocal Clarity': [-2.0, 0.5, 3.5, 4.0, 2.0],
  'Late Night': [2.0, 1.5, 0.0, -1.5, -2.5],
};

export const EQ_FREQUENCIES = ['60 Hz', '230 Hz', '910 Hz', '3.6 kHz', '14 kHz'];
