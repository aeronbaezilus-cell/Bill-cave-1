import { COVER_MIDNIGHT_ECHOES } from '../data/libraryData';
import {
  EqSettings,
  Playlist,
  QueueSlot,
  RepeatMode,
  Track,
  WallpaperAppearance,
  WallpaperPreset,
} from '../types/music';

const POSITIONS_STORAGE_KEY = 'bills-cave-positions-v1';
const STATE_STORAGE_KEY = 'bills-cave-player-state-v1';
const DB_NAME = 'bills-cave-db';
const DB_VERSION = 1;
const TRACK_STORE = 'tracks';
const WALLPAPER_STORE = 'wallpapers';

export interface PersistedPlayerState {
  lastTrackId: string | null;
  activeQueueId: string;
  queues: QueueSlot[];
  playlists: Playlist[];
  volume: number;
  isMuted: boolean;
  shuffle: boolean;
  repeatMode: RepeatMode;
  eqSettings: EqSettings;
  appearance: WallpaperAppearance;
}

interface StoredTrackRecord {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  format: string;
  fingerprint?: string;
  hasOriginalArt?: boolean;
  isFavorite?: boolean;
  isCloaked?: boolean;
  addedAt: number;
  audioBlob: Blob;
  artworkBlob?: Blob;
}

interface StoredWallpaperRecord {
  id: string;
  name: string;
  subtitle: string;
  imageBlob: Blob;
}

export function buildTrackFingerprint(file: File): string {
  return `${file.name}::${file.size}::${file.lastModified}`;
}

export function loadSavedPositions(): Record<string, number> {
  try {
    const raw = localStorage.getItem(POSITIONS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const clean: Record<string, number> = {};
    for (const [key, val] of Object.entries(parsed)) {
      if (typeof val === 'number' && Number.isFinite(val) && val >= 0) {
        clean[key] = val;
      }
    }
    return clean;
  } catch {
    return {};
  }
}

export function persistPositions(positions: Record<string, number>) {
  try {
    localStorage.setItem(POSITIONS_STORAGE_KEY, JSON.stringify(positions));
  } catch {
    // ignore storage quota errors
  }
}

export function getSavedTrackPosition(
  positions: Record<string, number>,
  track: Pick<Track, 'id' | 'fingerprint' | 'duration'>
): number {
  const byId = positions[track.id];
  const byFingerprint = track.fingerprint ? positions[track.fingerprint] : undefined;
  const candidate =
    typeof byId === 'number' && byId > 0
      ? byId
      : typeof byFingerprint === 'number' && byFingerprint > 0
        ? byFingerprint
        : 0;
  if (!Number.isFinite(candidate) || candidate <= 0) return 0;
  if (track.duration > 0 && candidate >= track.duration - 0.5) return 0;
  return candidate;
}

export function loadPersistedPlayerState(): Partial<PersistedPlayerState> | null {
  try {
    const raw = localStorage.getItem(STATE_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Partial<PersistedPlayerState>;
  } catch {
    return null;
  }
}

export function savePersistedPlayerState(state: PersistedPlayerState) {
  try {
    localStorage.setItem(STATE_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore storage errors
  }
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(TRACK_STORE)) {
        db.createObjectStore(TRACK_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(WALLPAPER_STORE)) {
        db.createObjectStore(WALLPAPER_STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Failed to open IndexedDB'));
  });
}

async function resolveArtworkBlob(artworkUrl: string): Promise<Blob | undefined> {
  if (!artworkUrl.startsWith('blob:') && !artworkUrl.startsWith('data:')) {
    return undefined;
  }
  try {
    const res = await fetch(artworkUrl);
    return await res.blob();
  } catch {
    return undefined;
  }
}

export async function saveTrackToStorage(track: Track, audioBlob: Blob) {
  let db: IDBDatabase | null = null;
  try {
    const artworkBlob = await resolveArtworkBlob(track.artwork);
    // Copy bytes into a standalone Blob for files <= 80MB so Android WebView / Chrome
    // file handles never become unreadable after the picker session closes.
    const mime = audioBlob.type || 'audio/mpeg';
    let storableAudio: Blob;
    if (audioBlob.size > 0 && audioBlob.size <= 80 * 1024 * 1024) {
      const buf = await audioBlob.arrayBuffer();
      storableAudio = new Blob([buf], { type: mime });
    } else if (audioBlob.size > 0) {
      storableAudio = audioBlob.slice(0, audioBlob.size, mime);
    } else {
      storableAudio = audioBlob;
    }

    db = await openDatabase();
    const record: StoredTrackRecord = {
      id: track.id,
      title: track.title,
      artist: track.artist,
      album: track.album,
      duration: track.duration,
      format: track.format,
      fingerprint: track.fingerprint,
      hasOriginalArt: track.hasOriginalArt,
      isFavorite: track.isFavorite,
      isCloaked: track.isCloaked,
      addedAt: track.addedAt,
      audioBlob: storableAudio,
      artworkBlob,
    };

    await new Promise<void>((resolve, reject) => {
      const tx = db!.transaction(TRACK_STORE, 'readwrite');
      tx.objectStore(TRACK_STORE).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'));
    });
  } catch {
    // ignore IndexedDB quota or private-mode errors
  } finally {
    db?.close();
  }
}

export async function updateStoredTrackMetadata(track: Track) {
  let db: IDBDatabase | null = null;
  try {
    db = await openDatabase();
    const existing = await new Promise<StoredTrackRecord | undefined>((resolve, reject) => {
      const tx = db!.transaction(TRACK_STORE, 'readonly');
      const req = tx.objectStore(TRACK_STORE).get(track.id);
      req.onsuccess = () => resolve(req.result as StoredTrackRecord | undefined);
      req.onerror = () => reject(req.error);
    });
    if (!existing) {
      return;
    }

    const artworkBlob =
      track.hasOriginalArt && (track.artwork.startsWith('blob:') || track.artwork.startsWith('data:'))
        ? (await resolveArtworkBlob(track.artwork)) ?? existing.artworkBlob
        : existing.artworkBlob;

    const updated: StoredTrackRecord = {
      ...existing,
      title: track.title,
      artist: track.artist,
      album: track.album,
      duration: track.duration,
      hasOriginalArt: track.hasOriginalArt,
      isFavorite: track.isFavorite,
      isCloaked: track.isCloaked,
      artworkBlob,
    };

    await new Promise<void>((resolve, reject) => {
      const tx = db!.transaction(TRACK_STORE, 'readwrite');
      tx.objectStore(TRACK_STORE).put(updated);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'));
    });
  } catch {
    // ignore IndexedDB errors
  } finally {
    db?.close();
  }
}

export async function loadStoredTracks(): Promise<Track[]> {
  let db: IDBDatabase | null = null;
  try {
    db = await openDatabase();
    const records = await new Promise<StoredTrackRecord[]>((resolve, reject) => {
      const tx = db!.transaction(TRACK_STORE, 'readonly');
      const req = tx.objectStore(TRACK_STORE).getAll();
      req.onsuccess = () => resolve((req.result as StoredTrackRecord[]) ?? []);
      req.onerror = () => reject(req.error);
    });

    const tracks: Track[] = [];
    for (const rec of records.sort((a, b) => b.addedAt - a.addedAt)) {
      if (!(rec.audioBlob instanceof Blob)) continue;
      tracks.push({
        id: rec.id,
        title: rec.title,
        artist: rec.artist,
        album: rec.album,
        duration: rec.duration,
        format: rec.format,
        fingerprint: rec.fingerprint,
        hasOriginalArt: rec.hasOriginalArt,
        isFavorite: rec.isFavorite,
        isCloaked: rec.isCloaked,
        addedAt: rec.addedAt,
        sourceType: 'local' as const,
        audioUrl: URL.createObjectURL(rec.audioBlob),
        artwork:
          rec.artworkBlob instanceof Blob
            ? URL.createObjectURL(rec.artworkBlob)
            : COVER_MIDNIGHT_ECHOES,
      });
    }
    return tracks;
  } catch {
    return [];
  } finally {
    db?.close();
  }
}

export async function saveWallpaperToStorage(preset: WallpaperPreset, imageBlob: Blob) {
  try {
    const db = await openDatabase();
    const record: StoredWallpaperRecord = {
      id: preset.id,
      name: preset.name,
      subtitle: preset.subtitle,
      imageBlob,
    };
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(WALLPAPER_STORE, 'readwrite');
      tx.objectStore(WALLPAPER_STORE).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // ignore IndexedDB errors
  }
}

export async function loadStoredWallpapers(): Promise<WallpaperPreset[]> {
  try {
    const db = await openDatabase();
    const records = await new Promise<StoredWallpaperRecord[]>((resolve, reject) => {
      const tx = db.transaction(WALLPAPER_STORE, 'readonly');
      const req = tx.objectStore(WALLPAPER_STORE).getAll();
      req.onsuccess = () => resolve((req.result as StoredWallpaperRecord[]) ?? []);
      req.onerror = () => reject(req.error);
    });
    db.close();

    return records.map((rec) => ({
      id: rec.id,
      name: rec.name,
      subtitle: rec.subtitle,
      url: URL.createObjectURL(rec.imageBlob),
      isCustom: true,
    }));
  } catch {
    return [];
  }
}
