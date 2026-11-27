import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BottomPlayerDock } from './components/BottomPlayerDock';
import { FeatureModals } from './components/FeatureModals';
import { LibraryViews } from './components/LibraryViews';
import { MusicoletNavTabs } from './components/MusicoletNavTabs';
import { NowPlayingArtView } from './components/NowPlayingArtView';
import { TopFeatureBar } from './components/TopFeatureBar';
import {
  COVER_MIDNIGHT_ECHOES,
  INITIAL_PLAYLISTS,
  INITIAL_QUEUES,
  INITIAL_TRACKS,
  INITIAL_WALLPAPERS,
} from './data/libraryData';
import {
  EqSettings,
  NavTab,
  Playlist,
  QueueSlot,
  RepeatMode,
  Track,
  WallpaperAppearance,
  WallpaperPreset,
} from './types/music';
import { audioEngine } from './utils/audioEngine';
import { extractAudioMetadata } from './utils/audioMetadata';
import {
  buildTrackFingerprint,
  getSavedTrackPosition,
  loadPersistedPlayerState,
  loadSavedPositions,
  loadStoredTracks,
  loadStoredWallpapers,
  persistPositions,
  savePersistedPlayerState,
  saveTrackToStorage,
  saveWallpaperToStorage,
  updateStoredTrackMetadata,
} from './utils/playbackStorage';

export default function App() {
  const initialSavedState = useMemo(() => loadPersistedPlayerState(), []);
  const initialPositions = useMemo(() => loadSavedPositions(), []);

  const [tracks, setTracks] = useState<Track[]>(INITIAL_TRACKS);
  const [queues, setQueues] = useState<QueueSlot[]>(() =>
    initialSavedState?.queues?.length ? initialSavedState.queues : INITIAL_QUEUES
  );
  const [activeQueueId, setActiveQueueId] = useState<string>(() => {
    const qs = initialSavedState?.queues?.length ? initialSavedState.queues : INITIAL_QUEUES;
    const savedId = initialSavedState?.activeQueueId;
    return qs.some((q) => q.id === savedId) ? savedId! : qs[0].id;
  });
  const [playlists, setPlaylists] = useState<Playlist[]>(() =>
    Array.isArray(initialSavedState?.playlists) ? initialSavedState.playlists : INITIAL_PLAYLISTS
  );

  const [activeTab, setActiveTab] = useState<NavTab>('queue');
  const [searchQuery, setSearchQuery] = useState('');

  // Playback state & exact-moment position memory (hours, minutes, exact seconds)
  const [currentTrackId, setCurrentTrackId] = useState<string | null>(
    () => initialSavedState?.lastTrackId ?? null
  );
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [savedPositions, setSavedPositions] = useState<Record<string, number>>(initialPositions);
  const [volume, setVolume] = useState(() =>
    typeof initialSavedState?.volume === 'number' ? initialSavedState.volume : 0.78
  );
  const [isMuted, setIsMuted] = useState(() => Boolean(initialSavedState?.isMuted));
  const [shuffle, setShuffle] = useState(() => Boolean(initialSavedState?.shuffle));
  const [repeatMode, setRepeatMode] = useState<RepeatMode>(
    () => initialSavedState?.repeatMode ?? 'all'
  );

  // Bill's Cave features state
  const [activeModal, setActiveModal] = useState<'eq' | 'wallpaper' | 'sleep' | 'cloak' | null>(
    null
  );
  const [zenMode, setZenMode] = useState(true);
  const [isDraggingAudio, setIsDraggingAudio] = useState(false);
  const [inspectingTrackId, setInspectingTrackId] = useState<string | null>(null);

  // Cloak Access state
  const [cloakPin, setCloakPin] = useState<string>(() => {
    try {
      return localStorage.getItem('bills-cave-cloak-pin') ?? '';
    } catch {
      return '';
    }
  });
  const [cloakUnlocked, setCloakUnlocked] = useState(false);

  const [eqSettings, setEqSettings] = useState<EqSettings>(
    () =>
      initialSavedState?.eqSettings ?? {
        bands: [0, 0, 0, 0, 0],
        preset: 'Flat',
        caveReverb: false,
      }
  );

  const [wallpapers, setWallpapers] = useState<WallpaperPreset[]>(INITIAL_WALLPAPERS);
  const [appearance, setAppearance] = useState<WallpaperAppearance>(
    () =>
      initialSavedState?.appearance ?? {
        selectedId: INITIAL_WALLPAPERS[0].id,
        dimmer: 16,
        blur: 0,
        panelOpacity: 44,
      }
  );

  const [sleepRemaining, setSleepRemaining] = useState<number | null>(null);
  const [storageHydrated, setStorageHydrated] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cloakFileInputRef = useRef<HTMLInputElement | null>(null);
  const positionsRef = useRef<Record<string, number>>(initialPositions);
  const lastPersistTickRef = useRef<number>(0);

  // Public visible tracks exclude cloaked songs unless explicitly restored
  const visibleTracks = useMemo(() => tracks.filter((t) => !t.isCloaked), [tracks]);
  const cloakedTracks = useMemo(() => tracks.filter((t) => Boolean(t.isCloaked)), [tracks]);

  const stateRef = useRef({
    tracks,
    visibleTracks,
    queues,
    activeQueueId,
    currentTrackId,
    currentTime,
    isPlaying,
    shuffle,
    repeatMode,
  });
  stateRef.current = {
    tracks,
    visibleTracks,
    queues,
    activeQueueId,
    currentTrackId,
    currentTime,
    isPlaying,
    shuffle,
    repeatMode,
  };

  const currentTrack = useMemo(
    () => tracks.find((t) => t.id === currentTrackId) ?? null,
    [tracks, currentTrackId]
  );

  const inspectingTrack = useMemo(
    () => tracks.find((t) => t.id === inspectingTrackId) ?? null,
    [tracks, inspectingTrackId]
  );

  const prevTrackIdRef = useRef<string | null>(currentTrackId);
  useEffect(() => {
    if (
      inspectingTrackId &&
      prevTrackIdRef.current &&
      inspectingTrackId === prevTrackIdRef.current &&
      currentTrackId &&
      currentTrackId !== prevTrackIdRef.current
    ) {
      setInspectingTrackId(currentTrackId);
    }
    prevTrackIdRef.current = currentTrackId;
  }, [currentTrackId, inspectingTrackId]);

  const activeWallpaper = useMemo(
    () => wallpapers.find((w) => w.id === appearance.selectedId) ?? wallpapers[0],
    [wallpapers, appearance.selectedId]
  );

  const savePositionForTrack = useCallback(
    (track: Track | null, seconds: number, force = false) => {
      if (!track) return;
      const now = Date.now();
      if (!force && now - lastPersistTickRef.current < 900) {
        return;
      }
      lastPersistTickRef.current = now;

      const clamped =
        seconds <= 0.25
          ? 0
          : track.duration > 0 && seconds >= track.duration - 0.5
            ? 0
            : Number(seconds.toFixed(2));

      const next = { ...positionsRef.current };
      if (clamped === 0) {
        delete next[track.id];
        if (track.fingerprint) delete next[track.fingerprint];
      } else {
        next[track.id] = clamped;
        if (track.fingerprint) next[track.fingerprint] = clamped;
      }

      positionsRef.current = next;
      setSavedPositions(next);
      persistPositions(next);
    },
    []
  );

  // Hydrate persisted audio library, custom wallpapers, and exact resume position on startup
  useEffect(() => {
    let cancelled = false;

    const hydrate = async () => {
      const [storedTracks, storedWallpapers] = await Promise.all([
        loadStoredTracks(),
        loadStoredWallpapers(),
      ]);
      if (cancelled) return;

      if (storedWallpapers.length > 0) {
        setWallpapers([...INITIAL_WALLPAPERS, ...storedWallpapers]);
      }

      audioEngine.setEqBands(eqSettings.bands);
      audioEngine.setCaveReverb(eqSettings.caveReverb);
      audioEngine.setVolume(isMuted ? 0 : volume);

      if (storedTracks.length > 0) {
        setTracks((prev) => {
          if (prev.length === 0) return storedTracks;
          const existingIds = new Set(prev.map((t) => t.id));
          return [...prev, ...storedTracks.filter((t) => !existingIds.has(t.id))];
        });

        // Ensure restored visible tracks aren't stranded outside every queue
        setQueues((prev) => {
          const base = prev.length > 0 ? prev : INITIAL_QUEUES;
          const queuedIds = new Set(base.flatMap((q) => q.trackIds));
          const missingIds = storedTracks
            .filter((t) => !t.isCloaked && !queuedIds.has(t.id))
            .map((t) => t.id);
          if (missingIds.length === 0) return base;
          const targetId = base.some((q) => q.id === stateRef.current.activeQueueId)
            ? stateRef.current.activeQueueId
            : base[0].id;
          return base.map((q) =>
            q.id === targetId ? { ...q, trackIds: [...missingIds, ...q.trackIds] } : q
          );
        });

        // Do not clobber if the user already imported/started playing a track before hydration completed
        if (!stateRef.current.currentTrackId) {
          const preferredId = initialSavedState?.lastTrackId;
          const restoredTrack =
            storedTracks.find((t) => t.id === preferredId) ??
            storedTracks.find((t) => !t.isCloaked) ??
            storedTracks[0];

          if (restoredTrack) {
            const resumeAt = getSavedTrackPosition(positionsRef.current, restoredTrack);
            setCurrentTrackId(restoredTrack.id);
            setCurrentTime(resumeAt);
            void audioEngine.loadTrack(restoredTrack, resumeAt, false);
          }
        }
      }

      setStorageHydrated(true);
    };

    void hydrate();
    return () => {
      cancelled = true;
    };
    // Run once on initial mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist player preferences, queues, playlists, and active track ID
  useEffect(() => {
    if (!storageHydrated) return;
    savePersistedPlayerState({
      lastTrackId: currentTrackId,
      activeQueueId,
      queues,
      playlists,
      volume,
      isMuted,
      shuffle,
      repeatMode,
      eqSettings,
      appearance,
    });
  }, [
    storageHydrated,
    currentTrackId,
    activeQueueId,
    queues,
    playlists,
    volume,
    isMuted,
    shuffle,
    repeatMode,
    eqSettings,
    appearance,
  ]);

  // Flush exact moment left when page/app hides or closes
  useEffect(() => {
    const flushCurrentMoment = () => {
      const active = stateRef.current.tracks.find(
        (t) => t.id === stateRef.current.currentTrackId
      );
      if (active) {
        const exactTime = audioEngine.getCurrentTime();
        savePositionForTrack(active, exactTime, true);
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flushCurrentMoment();
      }
    };

    window.addEventListener('pagehide', flushCurrentMoment);
    window.addEventListener('beforeunload', flushCurrentMoment);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('pagehide', flushCurrentMoment);
      window.removeEventListener('beforeunload', flushCurrentMoment);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [savePositionForTrack]);

  const playTrackById = useCallback(
    (
      trackId: string,
      queueIdOverride?: string,
      queueIdx?: number,
      options?: { restart?: boolean }
    ) => {
      const target = stateRef.current.tracks.find((t) => t.id === trackId);
      if (!target) return;

      // Save outgoing track's exact second before switching
      if (stateRef.current.currentTrackId && stateRef.current.currentTrackId !== target.id) {
        const prevTrack = stateRef.current.tracks.find(
          (t) => t.id === stateRef.current.currentTrackId
        );
        if (prevTrack) {
          savePositionForTrack(prevTrack, audioEngine.getCurrentTime(), true);
        }
      }

      const startAt = options?.restart
        ? 0
        : getSavedTrackPosition(positionsRef.current, target);

      setCurrentTrackId(target.id);
      setCurrentTime(startAt);
      setIsPlaying(true);

      if (queueIdOverride !== undefined && queueIdx !== undefined) {
        setQueues((prev) =>
          prev.map((q) => (q.id === queueIdOverride ? { ...q, currentIndex: queueIdx } : q))
        );
      }

      void audioEngine.playTrack(target, startAt);
    },
    [savePositionForTrack]
  );

  const advanceQueue = useCallback(
    (fromNaturalEnd: boolean) => {
      const {
        tracks: allTracks,
        queues: qs,
        activeQueueId: qId,
        shuffle: isShuffle,
        repeatMode: repeat,
        visibleTracks: vis,
        currentTrackId: activeId,
      } = stateRef.current;

      const finishedTrack = allTracks.find((t) => t.id === activeId) ?? null;
      if (fromNaturalEnd && finishedTrack) {
        savePositionForTrack(finishedTrack, 0, true);
      } else if (!fromNaturalEnd && finishedTrack) {
        savePositionForTrack(finishedTrack, audioEngine.getCurrentTime(), true);
      }

      const visSet = new Set(vis.map((t) => t.id));
      const queue = qs.find((q) => q.id === qId);
      const playableIds = queue ? queue.trackIds.filter((id) => visSet.has(id)) : [];
      if (!queue || playableIds.length === 0) {
        setIsPlaying(false);
        return;
      }

      if (repeat === 'one' && activeId) {
        playTrackById(activeId, queue.id, queue.currentIndex, { restart: fromNaturalEnd });
        return;
      }

      const currentPos = Math.max(0, playableIds.indexOf(activeId ?? playableIds[0]));
      let nextPos = currentPos + 1;

      if (isShuffle && playableIds.length > 1) {
        let randPos = currentPos;
        while (randPos === currentPos) {
          randPos = Math.floor(Math.random() * playableIds.length);
        }
        nextPos = randPos;
      } else if (nextPos >= playableIds.length) {
        if (repeat === 'all') {
          nextPos = 0;
        } else {
          setIsPlaying(false);
          audioEngine.pause();
          return;
        }
      }

      const nextId = playableIds[nextPos];
      if (nextId) {
        const rawIdx = queue.trackIds.indexOf(nextId);
        playTrackById(nextId, queue.id, rawIdx >= 0 ? rawIdx : 0, {
          restart: fromNaturalEnd && nextId === activeId,
        });
      }
    },
    [playTrackById, savePositionForTrack]
  );

  const handleNext = useCallback(() => {
    advanceQueue(false);
  }, [advanceQueue]);

  const handlePrev = useCallback(() => {
    if (currentTime > 3) {
      audioEngine.seek(0);
      setCurrentTime(0);
      savePositionForTrack(currentTrack, 0, true);
      return;
    }
    const visSet = new Set(visibleTracks.map((t) => t.id));
    const queue = queues.find((q) => q.id === activeQueueId);
    const playableIds = queue ? queue.trackIds.filter((id) => visSet.has(id)) : [];
    if (!queue || playableIds.length === 0) return;

    const currentPos = Math.max(0, playableIds.indexOf(currentTrackId ?? playableIds[0]));
    const prevPos = currentPos > 0 ? currentPos - 1 : playableIds.length - 1;
    const prevId = playableIds[prevPos];
    if (prevId) {
      const rawIdx = queue.trackIds.indexOf(prevId);
      playTrackById(prevId, queue.id, rawIdx >= 0 ? rawIdx : 0);
    }
  }, [
    activeQueueId,
    currentTime,
    currentTrack,
    currentTrackId,
    playTrackById,
    queues,
    savePositionForTrack,
    visibleTracks,
  ]);

  useEffect(() => {
    audioEngine.setCallbacks(
      (time) => {
        setCurrentTime(time);
        const active = stateRef.current.tracks.find(
          (t) => t.id === stateRef.current.currentTrackId
        );
        if (active && stateRef.current.isPlaying) {
          savePositionForTrack(active, time, false);
        }
      },
      () => advanceQueue(true),
      (trackId, realDuration) => {
        setTracks((prev) =>
          prev.map((t) => {
            if (t.id !== trackId || t.duration === realDuration) return t;
            const updated = { ...t, duration: realDuration };
            void updateStoredTrackMetadata(updated);
            return updated;
          })
        );
      }
    );
  }, [advanceQueue, savePositionForTrack]);

  useEffect(() => {
    if (sleepRemaining === null) return;
    const id = window.setInterval(() => {
      setSleepRemaining((prev) => {
        if (prev === null) return null;
        if (prev <= 1) {
          audioEngine.pause();
          const active = stateRef.current.tracks.find(
            (t) => t.id === stateRef.current.currentTrackId
          );
          if (active) {
            savePositionForTrack(active, audioEngine.getCurrentTime(), true);
          }
          setIsPlaying(false);
          return null;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [sleepRemaining, savePositionForTrack]);

  const handleTogglePlay = useCallback(() => {
    if (!currentTrack) return;
    if (isPlaying) {
      audioEngine.pause();
      const exact = audioEngine.getCurrentTime();
      setCurrentTime(exact);
      savePositionForTrack(currentTrack, exact, true);
      setIsPlaying(false);
    } else {
      setIsPlaying(true);
      void audioEngine.resume();
    }
  }, [currentTrack, isPlaying, savePositionForTrack]);

  const handleStop = useCallback(() => {
    audioEngine.stop();
    setIsPlaying(false);
    setCurrentTime(0);
    if (currentTrack) {
      savePositionForTrack(currentTrack, 0, true);
    }
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = 'none';
    }
  }, [currentTrack, savePositionForTrack]);

  // Sync Android Media Notification & Windows Media Transport Controls (SMTC)
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;

    let cancelled = false;

    const updateMetadata = async () => {
      if (!currentTrack) {
        navigator.mediaSession.metadata = null;
        navigator.mediaSession.playbackState = 'none';
        return;
      }

      let resolvedArt = currentTrack.artwork;
      if (resolvedArt.startsWith('blob:')) {
        try {
          const blob = await fetch(resolvedArt).then((r) => r.blob());
          resolvedArt = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () =>
              resolve(typeof reader.result === 'string' ? reader.result : currentTrack.artwork);
            reader.onerror = () => resolve(currentTrack.artwork);
            reader.readAsDataURL(blob);
          });
        } catch {
          resolvedArt = `${window.location.origin}/pwa-512x512.png`;
        }
      } else if (!resolvedArt.startsWith('http') && !resolvedArt.startsWith('data:')) {
        resolvedArt = `${window.location.origin}${resolvedArt.startsWith('/') ? '' : '/'}${resolvedArt}`;
      }

      if (cancelled) return;

      navigator.mediaSession.metadata = new MediaMetadata({
        title: currentTrack.title,
        artist: currentTrack.artist,
        album: currentTrack.album,
        artwork: [
          { src: resolvedArt, sizes: '512x512', type: 'image/jpeg' },
          { src: `${window.location.origin}/pwa-512x512.png`, sizes: '512x512', type: 'image/png' },
        ],
      });
      navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
    };

    void updateMetadata();
    return () => {
      cancelled = true;
    };
  }, [currentTrack, isPlaying]);

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;

    const safeSetHandler = (
      action: MediaSessionAction,
      handler: MediaSessionActionHandler | null
    ) => {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch {
        // ignore unsupported media session actions on older browsers
      }
    };

    safeSetHandler('play', () => {
      if (!isPlaying && currentTrack) handleTogglePlay();
    });
    safeSetHandler('pause', () => {
      if (isPlaying) handleTogglePlay();
    });
    safeSetHandler('stop', () => {
      handleStop();
    });
    safeSetHandler('previoustrack', () => {
      handlePrev();
    });
    safeSetHandler('nexttrack', () => {
      handleNext();
    });
    safeSetHandler('seekbackward', (details) => {
      const offset = details.seekOffset ?? 10;
      const nextPos = Math.max(0, currentTime - offset);
      audioEngine.seek(nextPos);
      setCurrentTime(nextPos);
      savePositionForTrack(currentTrack, nextPos, true);
    });
    safeSetHandler('seekforward', (details) => {
      const offset = details.seekOffset ?? 10;
      const maxDur = currentTrack?.duration ?? currentTime + offset;
      const nextPos = Math.min(maxDur, currentTime + offset);
      audioEngine.seek(nextPos);
      setCurrentTime(nextPos);
      savePositionForTrack(currentTrack, nextPos, true);
    });
    safeSetHandler('seekto', (details) => {
      if (typeof details.seekTime === 'number') {
        audioEngine.seek(details.seekTime);
        setCurrentTime(details.seekTime);
        savePositionForTrack(currentTrack, details.seekTime, true);
      }
    });

    return () => {
      safeSetHandler('play', null);
      safeSetHandler('pause', null);
      safeSetHandler('stop', null);
      safeSetHandler('previoustrack', null);
      safeSetHandler('nexttrack', null);
      safeSetHandler('seekbackward', null);
      safeSetHandler('seekforward', null);
      safeSetHandler('seekto', null);
    };
  }, [
    currentTime,
    currentTrack,
    handleNext,
    handlePrev,
    handleStop,
    handleTogglePlay,
    isPlaying,
    savePositionForTrack,
  ]);

  useEffect(() => {
    if (!('mediaSession' in navigator) || !currentTrack) return;
    try {
      if (typeof navigator.mediaSession.setPositionState === 'function') {
        navigator.mediaSession.setPositionState({
          duration: Math.max(1, currentTrack.duration),
          playbackRate: 1,
          position: Math.min(currentTime, Math.max(1, currentTrack.duration)),
        });
      }
    } catch {
      // ignore invalid position state during track switch
    }
  }, [currentTime, currentTrack]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.code === 'Space') {
        e.preventDefault();
        handleTogglePlay();
      } else if (e.code === 'ArrowRight') {
        const nextPos = Math.min(currentTrack?.duration ?? currentTime + 5, currentTime + 5);
        audioEngine.seek(nextPos);
        setCurrentTime(nextPos);
        savePositionForTrack(currentTrack, nextPos, true);
      } else if (e.code === 'ArrowLeft') {
        const nextPos = Math.max(0, currentTime - 5);
        audioEngine.seek(nextPos);
        setCurrentTime(nextPos);
        savePositionForTrack(currentTrack, nextPos, true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [currentTime, currentTrack, handleTogglePlay, savePositionForTrack]);

  const handleImportAudioFiles = async (files: FileList | File[], importAsCloaked = false) => {
    const fileArr = Array.from(files);
    const audioFiles = fileArr.filter((f) => {
      if (f.type.startsWith('image/')) return false;
      if (f.type.startsWith('audio/') || f.type === 'video/mp4' || f.type === 'video/webm') {
        return true;
      }
      if (
        /\.(mp3|wav|ogg|oga|opus|m4a|m4b|m4p|mp4|flac|aac|wma|aiff|aif|alac|webm|3gp|amr|mka|caf)$/i.test(
          f.name
        )
      ) {
        return true;
      }
      // Android/WebView pickers sometimes return application/octet-stream or empty type for .m4b audiobooks
      const isNonAudioExt = /\.(jpe?g|png|webp|gif|svg|txt|pdf|zip|rar|json|xml|html?|apk|exe)$/i.test(
        f.name
      );
      return (!f.type || f.type === 'application/octet-stream') && !isNonAudioExt;
    });
    if (audioFiles.length === 0) return;

    // Check if an accompanying cover image file was dropped alongside audiobooks
    const companionImage = fileArr.find((f) => f.type.startsWith('image/'));
    const companionArtUrl = companionImage ? URL.createObjectURL(companionImage) : undefined;

    const importedTracks: Track[] = [];

    for (const file of audioFiles) {
      const objectUrl = URL.createObjectURL(file);
      const fingerprint = buildTrackFingerprint(file);

      const probeDuration = new Promise<number>((resolve) => {
        const probe = new Audio();
        probe.preload = 'metadata';
        let done = false;
        const finish = (secs: number) => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          probe.removeAttribute('src');
          probe.load();
          resolve(secs);
        };
        const timer = window.setTimeout(() => finish(0), 2500);
        probe.addEventListener('loadedmetadata', () => {
          finish(
            Number.isFinite(probe.duration) && probe.duration > 0
              ? Math.round(probe.duration)
              : 0
          );
        });
        probe.addEventListener('error', () => finish(0));
        probe.src = objectUrl;
      });

      const metaPromise = Promise.race([
        extractAudioMetadata(file).catch(
          () => ({}) as { title?: string; artist?: string; album?: string; artworkUrl?: string }
        ),
        new Promise<{ title?: string; artist?: string; album?: string; artworkUrl?: string }>(
          (resolve) => window.setTimeout(() => resolve({}), 3000)
        ),
      ]);

      const [duration, meta] = await Promise.all([probeDuration, metaPromise]);

      const fallbackTitle = file.name.replace(/\.[^/.]+$/, '').replace(/[_-]+/g, ' ');
      const ext = file.name.split('.').pop()?.toUpperCase() || 'AUDIO';
      const resolvedArt = meta.artworkUrl || companionArtUrl || COVER_MIDNIGHT_ECHOES;

      const newTrack: Track = {
        id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        title: meta.title || fallbackTitle,
        artist: meta.artist || (ext === 'M4B' ? 'Audiobook' : 'Local Audio'),
        album: meta.album || (ext === 'M4B' ? fallbackTitle : "Bill's Library"),
        duration,
        artwork: resolvedArt,
        hasOriginalArt: Boolean(meta.artworkUrl || companionArtUrl),
        format: ext,
        sourceType: 'local',
        audioUrl: objectUrl,
        fingerprint,
        isFavorite: false,
        isCloaked: importAsCloaked,
        addedAt: Date.now(),
      };

      importedTracks.push(newTrack);
      void saveTrackToStorage(newTrack, file);
    }

    setTracks((prev) => [...importedTracks, ...prev]);

    if (!importAsCloaked) {
      setSearchQuery('');
      const currentQueues = stateRef.current.queues.length > 0 ? stateRef.current.queues : INITIAL_QUEUES;
      const targetId = currentQueues.some((q) => q.id === stateRef.current.activeQueueId)
        ? stateRef.current.activeQueueId
        : currentQueues[0].id;
      setActiveQueueId(targetId);
      setQueues((prev) => {
        const baseQueues = prev.length > 0 ? prev : INITIAL_QUEUES;
        return baseQueues.map((q) =>
          q.id === targetId
            ? {
                ...q,
                trackIds: [...importedTracks.map((t) => t.id), ...q.trackIds],
                currentIndex: 0,
              }
            : q
        );
      });
      setActiveTab('queue');
      if (importedTracks[0]) {
        if (currentTrack) {
          savePositionForTrack(currentTrack, audioEngine.getCurrentTime(), true);
        }
        const firstTrack = importedTracks[0];
        const resumeAt = getSavedTrackPosition(positionsRef.current, firstTrack);
        setCurrentTrackId(firstTrack.id);
        setCurrentTime(resumeAt);
        setIsPlaying(true);
        void audioEngine.playTrack(firstTrack, resumeAt);
      }
    }
  };

  const handleResetTrackPosition = useCallback(
    (trackId: string) => {
      const target = tracks.find((t) => t.id === trackId) ?? null;
      if (!target) return;
      savePositionForTrack(target, 0, true);
      if (currentTrackId === trackId) {
        audioEngine.seek(0);
        setCurrentTime(0);
      }
    },
    [currentTrackId, savePositionForTrack, tracks]
  );

  const handleToggleCloak = (trackId: string) => {
    const target = tracks.find((t) => t.id === trackId);
    if (!target) return;
    const updatedTrack = { ...target, isCloaked: !target.isCloaked };
    setTracks((prev) => prev.map((t) => (t.id === trackId ? updatedTrack : t)));
    void updateStoredTrackMetadata(updatedTrack);

    // If we just cloaked the currently playing track while vault is locked, pause or switch safely
    if (currentTrackId === trackId && !target.isCloaked && !cloakUnlocked) {
      savePositionForTrack(target, audioEngine.getCurrentTime(), true);
      audioEngine.pause();
      setIsPlaying(false);
      const fallback = visibleTracks.find((t) => t.id !== trackId) ?? null;
      setCurrentTrackId(fallback?.id ?? null);
      if (fallback) {
        const resumeAt = getSavedTrackPosition(positionsRef.current, fallback);
        setCurrentTime(resumeAt);
        void audioEngine.loadTrack(fallback, resumeAt, false);
      } else {
        setCurrentTime(0);
      }
    }
  };

  const handleLockCloak = () => {
    setCloakUnlocked(false);
    setActiveModal(null);
    if (currentTrack?.isCloaked) {
      savePositionForTrack(currentTrack, audioEngine.getCurrentTime(), true);
      audioEngine.pause();
      setIsPlaying(false);
      const fallback = visibleTracks[0] ?? null;
      setCurrentTrackId(fallback?.id ?? null);
      if (fallback) {
        const resumeAt = getSavedTrackPosition(positionsRef.current, fallback);
        setCurrentTime(resumeAt);
        void audioEngine.loadTrack(fallback, resumeAt, false);
      } else {
        setCurrentTime(0);
      }
    }
  };

  const handleReplaceTrackArtwork = (trackId: string, file: File) => {
    const newUrl = URL.createObjectURL(file);
    setTracks((prev) =>
      prev.map((t) => {
        if (t.id !== trackId) return t;
        const updated = { ...t, artwork: newUrl, hasOriginalArt: true };
        void updateStoredTrackMetadata(updated);
        return updated;
      })
    );
  };

  const handleUploadWallpaper = (file: File) => {
    const url = URL.createObjectURL(file);
    const id = `custom-wp-${Date.now()}`;
    const name = file.name.replace(/\.[^/.]+$/, '').slice(0, 22) || 'Custom Wallpaper';
    const preset: WallpaperPreset = {
      id,
      name,
      subtitle: 'Custom upload',
      url,
      isCustom: true,
    };
    setWallpapers((prev) => [...prev, preset]);
    setAppearance((prev) => ({ ...prev, selectedId: id }));
    void saveWallpaperToStorage(preset, file);
  };

  const handlePlayTrackFromQueue = (idx: number) => {
    const queue = queues.find((q) => q.id === activeQueueId);
    if (!queue) return;
    const trackId = queue.trackIds[idx];
    if (trackId) {
      playTrackById(trackId, queue.id, idx);
    }
  };

  const handlePlayTrackDirect = (trackId: string) => {
    const queue = queues.find((q) => q.id === activeQueueId);
    if (!queue) {
      playTrackById(trackId);
      return;
    }
    const existingIdx = queue.trackIds.indexOf(trackId);
    if (existingIdx !== -1) {
      playTrackById(trackId, queue.id, existingIdx);
    } else {
      const nextTrackIds = [...queue.trackIds, trackId];
      const newIdx = nextTrackIds.length - 1;
      setQueues((prev) =>
        prev.map((q) =>
          q.id === activeQueueId ? { ...q, trackIds: nextTrackIds, currentIndex: newIdx } : q
        )
      );
      playTrackById(trackId);
    }
  };

  const handlePlayTrackList = (trackIds: string[]) => {
    if (trackIds.length === 0) return;
    setQueues((prev) =>
      prev.map((q) =>
        q.id === activeQueueId ? { ...q, trackIds: [...trackIds], currentIndex: 0 } : q
      )
    );
    setActiveTab('queue');
    playTrackById(trackIds[0], activeQueueId, 0);
  };

  const handleAddToQueue = (trackId: string) => {
    setQueues((prev) =>
      prev.map((q) =>
        q.id === activeQueueId ? { ...q, trackIds: [...q.trackIds, trackId] } : q
      )
    );
  };

  const handleRemoveFromQueue = (idx: number) => {
    setQueues((prev) =>
      prev.map((q) => {
        if (q.id !== activeQueueId) return q;
        const nextIds = q.trackIds.filter((_, i) => i !== idx);
        const nextIndex = Math.max(0, Math.min(q.currentIndex, nextIds.length - 1));
        return { ...q, trackIds: nextIds, currentIndex: nextIndex };
      })
    );
  };

  const handleMoveQueueItem = (idx: number, dir: -1 | 1) => {
    setQueues((prev) =>
      prev.map((q) => {
        if (q.id !== activeQueueId) return q;
        const targetIdx = idx + dir;
        if (targetIdx < 0 || targetIdx >= q.trackIds.length) return q;
        const nextIds = [...q.trackIds];
        [nextIds[idx], nextIds[targetIdx]] = [nextIds[targetIdx], nextIds[idx]];
        let nextCurrent = q.currentIndex;
        if (q.currentIndex === idx) nextCurrent = targetIdx;
        else if (q.currentIndex === targetIdx) nextCurrent = idx;
        return { ...q, trackIds: nextIds, currentIndex: nextCurrent };
      })
    );
  };

  const handleShuffleQueue = () => {
    setQueues((prev) =>
      prev.map((q) => {
        if (q.id !== activeQueueId || q.trackIds.length < 2) return q;
        const shuffled = [...q.trackIds];
        for (let i = shuffled.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return { ...q, trackIds: shuffled, currentIndex: 0 };
      })
    );
  };

  const handleClearQueue = () => {
    setQueues((prev) =>
      prev.map((q) => (q.id === activeQueueId ? { ...q, trackIds: [], currentIndex: 0 } : q))
    );
  };

  const handleToggleFavorite = (trackId: string) => {
    setTracks((prev) =>
      prev.map((t) => {
        if (t.id !== trackId) return t;
        const updated = { ...t, isFavorite: !t.isFavorite };
        void updateStoredTrackMetadata(updated);
        return updated;
      })
    );
  };

  const handleCreatePlaylist = (name: string) => {
    const newPl: Playlist = {
      id: `pl-${Date.now()}`,
      name,
      description: 'Custom Bill’s Cave playlist',
      trackIds: [],
    };
    setPlaylists((prev) => [newPl, ...prev]);
  };

  const handleAddToPlaylist = (playlistId: string, trackId: string) => {
    setPlaylists((prev) =>
      prev.map((pl) =>
        pl.id === playlistId && !pl.trackIds.includes(trackId)
          ? { ...pl, trackIds: [...pl.trackIds, trackId] }
          : pl
      )
    );
  };

  const handleRemoveFromPlaylist = (playlistId: string, trackId: string) => {
    setPlaylists((prev) =>
      prev.map((pl) =>
        pl.id === playlistId
          ? { ...pl, trackIds: pl.trackIds.filter((id) => id !== trackId) }
          : pl
      )
    );
  };

  const hudBg = `rgba(10, 12, 17, ${appearance.panelOpacity / 100})`;

  return (
    <div
      className="relative h-screen w-screen overflow-hidden flex flex-col justify-between select-none"
      onDragOver={(e) => {
        e.preventDefault();
        setIsDraggingAudio(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setIsDraggingAudio(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setIsDraggingAudio(false);
        if (e.dataTransfer.files?.length) {
          void handleImportAudioFiles(e.dataTransfer.files, false);
        }
      }}
    >
      {/* Hidden Audio File Inputs (public + direct-to-cloak) */}
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*,audio/mp4,.mp3,.m4a,.m4b,.mp4,.flac,.ogg,.opus,.wav,.aac,.wma,.aiff,.caf,.webm,.3gp"
        multiple
        className="hidden"
        onChange={(e) => {
          const picked = e.target.files ? Array.from(e.target.files) : [];
          e.target.value = '';
          if (picked.length) {
            void handleImportAudioFiles(picked, false);
          }
        }}
      />
      <input
        ref={cloakFileInputRef}
        type="file"
        accept="audio/*,audio/mp4,.mp3,.m4a,.m4b,.mp4,.flac,.ogg,.opus,.wav,.aac,.wma,.aiff,.caf,.webm,.3gp"
        multiple
        className="hidden"
        onChange={(e) => {
          const picked = e.target.files ? Array.from(e.target.files) : [];
          e.target.value = '';
          if (picked.length) {
            void handleImportAudioFiles(picked, true);
          }
        }}
      />

      {/* FULL-BLEED BACKGROUND WALLPAPER */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden bg-[#08090c]">
        <img
          src={activeWallpaper.url}
          alt={activeWallpaper.name}
          referrerPolicy="no-referrer"
          style={{
            filter: appearance.blur > 0 ? `blur(${appearance.blur}px)` : undefined,
            transform: appearance.blur > 0 ? 'scale(1.04)' : 'scale(1)',
          }}
          className="w-full h-full object-cover transition-transform duration-500"
        />
        <div
          style={{
            opacity: (zenMode ? Math.max(8, appearance.dimmer - 8) : appearance.dimmer) / 100,
          }}
          className="absolute inset-0 bg-[#07080c] transition-opacity duration-300"
        />
      </div>

      {/* SLIM TOP BAR: Bill's Cave Features */}
      <TopFeatureBar
        activeModal={activeModal}
        onToggleModal={(m) => setActiveModal((prev) => (prev === m ? null : m))}
        zenMode={zenMode}
        onToggleZenMode={() => setZenMode((prev) => !prev)}
        sleepRemaining={sleepRemaining}
        caveReverb={eqSettings.caveReverb}
        cloakedCount={cloakedTracks.length}
        cloakUnlocked={cloakUnlocked}
        onTriggerAddAudio={() => fileInputRef.current?.click()}
        panelOpacity={appearance.panelOpacity}
      />

      {/* OPEN WALLPAPER VIEWPORT + COMPACT BOTTOM-ANCHORED SOUNDS PLAYER */}
      <main
        onClick={() => {
          if (!zenMode) setZenMode(true);
        }}
        className="relative z-10 flex-1 min-h-0 flex flex-col justify-end px-2 sm:px-5 pb-2 sm:pb-3"
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{ backgroundColor: hudBg }}
          className="w-full max-w-2xl mx-auto rounded-2xl border border-white/[0.1] backdrop-blur-md shadow-2xl overflow-hidden flex flex-col transition-all duration-200"
        >
          {!zenMode && (
            <div className="flex flex-col h-[235px] sm:h-[265px] border-b border-white/[0.06]">
              <LibraryViews
                activeTab={activeTab}
                tracks={visibleTracks}
                queues={queues}
                activeQueueId={activeQueueId}
                currentTrackId={currentTrackId}
                currentTime={currentTime}
                isPlaying={isPlaying}
                playlists={playlists}
                searchQuery={searchQuery}
                savedPositions={savedPositions}
                onSelectQueue={setActiveQueueId}
                onPlayTrackFromQueue={handlePlayTrackFromQueue}
                onPlayTrackDirect={handlePlayTrackDirect}
                onResetTrackPosition={handleResetTrackPosition}
                onAddToQueue={handleAddToQueue}
                onRemoveFromQueue={handleRemoveFromQueue}
                onMoveQueueItem={handleMoveQueueItem}
                onShuffleQueue={handleShuffleQueue}
                onClearQueue={handleClearQueue}
                onToggleFavorite={handleToggleFavorite}
                onToggleCloak={handleToggleCloak}
                onInspectArtwork={(track) => setInspectingTrackId(track.id)}
                onCreatePlaylist={handleCreatePlaylist}
                onAddToPlaylist={handleAddToPlaylist}
                onRemoveFromPlaylist={handleRemoveFromPlaylist}
                onPlayTrackList={handlePlayTrackList}
                onTriggerAddAudio={() => fileInputRef.current?.click()}
              />
            </div>
          )}

          <MusicoletNavTabs
            activeTab={activeTab}
            isOpen={!zenMode}
            onSelectTab={setActiveTab}
            onToggleOpen={() => setZenMode((prev) => !prev)}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            panelOpacity={appearance.panelOpacity}
          />

          <BottomPlayerDock
            currentTrack={currentTrack}
            isPlaying={isPlaying}
            currentTime={currentTime}
            volume={volume}
            isMuted={isMuted}
            shuffle={shuffle}
            repeatMode={repeatMode}
            zenMode={zenMode}
            onToggleZenMode={() => setZenMode((prev) => !prev)}
            onTogglePlay={handleTogglePlay}
            onStop={handleStop}
            onPrev={handlePrev}
            onNext={handleNext}
            onSeek={(secs) => {
              audioEngine.seek(secs);
              setCurrentTime(secs);
              savePositionForTrack(currentTrack, secs, true);
            }}
            onVolumeChange={(val) => {
              setVolume(val);
              setIsMuted(val === 0);
              audioEngine.setVolume(val);
            }}
            onToggleMute={() => {
              const nextMute = !isMuted;
              setIsMuted(nextMute);
              audioEngine.setVolume(nextMute ? 0 : volume);
            }}
            onToggleShuffle={() => setShuffle((prev) => !prev)}
            onCycleRepeat={() =>
              setRepeatMode((prev) => (prev === 'off' ? 'all' : prev === 'all' ? 'one' : 'off'))
            }
            onToggleFavorite={handleToggleFavorite}
            onInspectArtwork={(track) => setInspectingTrackId(track.id)}
          />
        </div>
      </main>

      {/* BILL'S CAVE FEATURE MODALS (EQ, Wallpapers, Sleep, Cloak, Original Cover Art) */}
      <FeatureModals
        activeModal={activeModal}
        onClose={() => setActiveModal(null)}
        eqSettings={eqSettings}
        onUpdateEqBands={(bands, preset) => {
          setEqSettings((prev) => ({ ...prev, bands, preset }));
          audioEngine.setEqBands(bands);
        }}
        onToggleCaveReverb={() => {
          setEqSettings((prev) => {
            const next = !prev.caveReverb;
            audioEngine.setCaveReverb(next);
            return { ...prev, caveReverb: next };
          });
        }}
        wallpapers={wallpapers}
        appearance={appearance}
        onUpdateAppearance={(patch) => setAppearance((prev) => ({ ...prev, ...patch }))}
        onUploadWallpaper={handleUploadWallpaper}
        sleepRemaining={sleepRemaining}
        onSetSleepTimer={(mins) => setSleepRemaining(mins === null ? null : mins * 60)}
        cloakedTracks={cloakedTracks}
        cloakPin={cloakPin}
        cloakUnlocked={cloakUnlocked}
        onUnlockCloak={(attempt) => {
          if (!cloakPin || attempt === cloakPin) {
            setCloakUnlocked(true);
            return true;
          }
          return false;
        }}
        onLockCloak={handleLockCloak}
        onSetCloakPin={(newPin) => {
          setCloakPin(newPin);
          try {
            if (newPin) localStorage.setItem('bills-cave-cloak-pin', newPin);
            else localStorage.removeItem('bills-cave-cloak-pin');
          } catch {
            // ignore storage errors
          }
        }}
        onPlayCloakedTrack={(id) => playTrackById(id)}
        onToggleCloak={handleToggleCloak}
        onImportCloakedAudio={() => cloakFileInputRef.current?.click()}
      />

      {/* FULL-SCREEN AUDIOBOOK / TRACK ARTWORK PLAYER */}
      <NowPlayingArtView
        track={inspectingTrack}
        isCurrentTrack={Boolean(inspectingTrack && inspectingTrack.id === currentTrackId)}
        isPlaying={isPlaying}
        currentTime={currentTime}
        savedPosition={
          inspectingTrack ? getSavedTrackPosition(savedPositions, inspectingTrack) : 0
        }
        onClose={() => setInspectingTrackId(null)}
        onTogglePlay={handleTogglePlay}
        onPlayTrack={(id) => handlePlayTrackDirect(id)}
        onPrev={handlePrev}
        onNext={handleNext}
        onSeek={(secs) => {
          if (inspectingTrack && inspectingTrack.id !== currentTrackId) {
            savePositionForTrack(inspectingTrack, secs, true);
            handlePlayTrackDirect(inspectingTrack.id);
          } else {
            audioEngine.seek(secs);
            setCurrentTime(secs);
            savePositionForTrack(currentTrack, secs, true);
          }
        }}
        onToggleFavorite={handleToggleFavorite}
        onToggleCloak={handleToggleCloak}
        onResetPosition={handleResetTrackPosition}
        onReplaceArtwork={handleReplaceTrackArtwork}
        onOpenEq={() => {
          setInspectingTrackId(null);
          setActiveModal('eq');
        }}
        onOpenQueue={() => {
          setInspectingTrackId(null);
          setZenMode(false);
          setActiveTab('queue');
        }}
      />

      {/* DRAG-AND-DROP AUDIO OVERLAY */}
      {isDraggingAudio && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-6 pointer-events-none">
          <div className="rounded-2xl border-2 border-dashed border-amber-400 bg-zinc-950/90 px-8 py-6 text-center">
            <p className="font-display text-base font-semibold text-amber-300">
              Drop audio or audiobooks into Bill&apos;s Cave
            </p>
            <p className="text-xs text-zinc-400 mt-1">
              Extracts original embedded cover art from MP3, M4B, M4A, and FLAC files.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
