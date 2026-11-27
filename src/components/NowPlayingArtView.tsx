import React, { useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  Disc3,
  EyeOff,
  FastForward,
  Heart,
  ImagePlus,
  Menu,
  MoreVertical,
  Pause,
  Play,
  Rewind,
  RotateCcw,
  SlidersVertical,
} from 'lucide-react';
import { Track } from '../types/music';
import { formatDuration } from '../utils/audioEngine';

interface NowPlayingArtViewProps {
  track: Track | null;
  isCurrentTrack: boolean;
  isPlaying: boolean;
  currentTime: number;
  savedPosition: number;
  onClose: () => void;
  onTogglePlay: () => void;
  onPlayTrack: (trackId: string) => void;
  onPrev: () => void;
  onNext: () => void;
  onSeek: (seconds: number) => void;
  onToggleFavorite: (trackId: string) => void;
  onToggleCloak: (trackId: string) => void;
  onResetPosition: (trackId: string) => void;
  onReplaceArtwork: (trackId: string, file: File) => void;
  onOpenEq: () => void;
  onOpenQueue: () => void;
}

export const NowPlayingArtView: React.FC<NowPlayingArtViewProps> = ({
  track,
  isCurrentTrack,
  isPlaying,
  currentTime,
  savedPosition,
  onClose,
  onTogglePlay,
  onPlayTrack,
  onPrev,
  onNext,
  onSeek,
  onToggleFavorite,
  onToggleCloak,
  onResetPosition,
  onReplaceArtwork,
  onOpenEq,
  onOpenQueue,
}) => {
  const coverInputRef = useRef<HTMLInputElement | null>(null);
  const hideTimerRef = useRef<number | null>(null);
  const wokeAtRef = useRef<number>(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);

  const clearHideTimer = () => {
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  };

  const scheduleAutoHide = (menuIsOpen: boolean) => {
    clearHideTimer();
    if (menuIsOpen) return;
    hideTimerRef.current = window.setTimeout(() => {
      setControlsVisible(false);
      setMenuOpen(false);
    }, 10000);
  };

  const wakeControls = () => {
    setControlsVisible(true);
    scheduleAutoHide(menuOpen);
  };

  useEffect(() => {
    setImgFailed(false);
    setMenuOpen(false);
    if (track) {
      setControlsVisible(true);
      scheduleAutoHide(false);
    }
    return () => clearHideTimer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track?.id, track?.artwork]);

  useEffect(() => {
    if (!track || !controlsVisible) {
      clearHideTimer();
      return;
    }
    scheduleAutoHide(menuOpen);
    return () => clearHideTimer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menuOpen, controlsVisible, track?.id]);

  useEffect(() => {
    if (!track) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else {
        wakeControls();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track, onClose, menuOpen]);

  if (!track) return null;

  const displayTime = isCurrentTrack ? currentTime : savedPosition;
  const duration = Math.max(1, track.duration || displayTime || 1);
  const progressPct = Math.min(100, Math.max(0, (displayTime / duration) * 100));
  const activePlaying = isCurrentTrack && isPlaying;

  const handlePrimaryPlay = () => {
    wakeControls();
    if (isCurrentTrack) {
      onTogglePlay();
    } else {
      onPlayTrack(track.id);
    }
  };

  const handleSkipBy = (delta: number) => {
    wakeControls();
    const target = Math.max(0, Math.min(duration, displayTime + delta));
    onSeek(target);
  };

  const handleContainerPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!controlsVisible) {
      // First touch/click on the screen only wakes the controls so hidden buttons aren't pressed by accident
      e.preventDefault();
      e.stopPropagation();
      wokeAtRef.current = Date.now();
      wakeControls();
      return;
    }
    scheduleAutoHide(menuOpen);
  };

  const handleContainerClickCapture = (e: React.MouseEvent<HTMLDivElement>) => {
    if (Date.now() - wokeAtRef.current < 350) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Now playing artwork for ${track.title}`}
      onPointerDownCapture={handleContainerPointerDown}
      onClickCapture={handleContainerClickCapture}
      className="fixed inset-0 z-50 bg-[#050608] text-zinc-100 flex flex-col justify-between overflow-hidden select-none"
    >
      {/* Hidden cover art replacement input */}
      <input
        ref={coverInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            onReplaceArtwork(track.id, file);
          }
          e.target.value = '';
        }}
      />

      {/* Full-bleed Edge-to-Edge Audiobook / Track Cover Artwork */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        {!imgFailed ? (
          <img
            src={track.artwork}
            alt={`${track.title} cover art`}
            referrerPolicy="no-referrer"
            onError={() => setImgFailed(true)}
            className="w-full h-full object-cover object-center"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-zinc-900 via-[#0e1118] to-black flex items-center justify-center">
            <Disc3 className="w-24 h-24 text-amber-400/25" />
          </div>
        )}

        {/* Measured readability scrims: fade away completely after 10s so only pure cover art remains */}
        <div
          aria-hidden="true"
          className={`absolute inset-0 bg-gradient-to-b from-black/45 via-black/15 to-black/90 transition-opacity duration-300 ${
            controlsVisible ? 'opacity-100' : 'opacity-0'
          }`}
        />
        <div
          aria-hidden="true"
          className={`absolute inset-x-0 bottom-0 h-[56%] bg-gradient-to-t from-[#040507] via-black/65 to-transparent transition-opacity duration-300 ${
            controlsVisible ? 'opacity-100' : 'opacity-0'
          }`}
        />
      </div>

      {/* Top Navigation Row: Collapse Chevron & Grab Handle */}
      <div
        className={`relative z-10 w-full max-w-2xl mx-auto px-3 sm:px-5 pt-3 flex items-center justify-between transition-opacity duration-300 ${
          controlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Back to player"
          title="Minimize artwork"
          className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full text-zinc-100/90 hover:text-white hover:bg-black/35 transition-colors"
        >
          <ChevronDown className="w-6 h-6" strokeWidth={2} />
        </button>

        <div
          aria-hidden="true"
          className="w-9 h-1 rounded-full bg-white/35"
        />

        <button
          type="button"
          onClick={() => coverInputRef.current?.click()}
          aria-label="Change cover art"
          title="Change cover art"
          className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full text-zinc-200/85 hover:text-amber-300 hover:bg-black/35 transition-colors"
        >
          <ImagePlus className="w-5 h-5" />
        </button>
      </div>

      {/* Lower Immersive Control Stage (fades out after 10s until touched) */}
      <div
        className={`relative z-10 w-full max-w-2xl mx-auto px-5 sm:px-7 pb-5 sm:pb-7 flex flex-col gap-5 transition-opacity duration-300 ${
          controlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        {/* Title, Subtitle & Favorite / More Actions */}
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-lg sm:text-2xl font-medium tracking-wide text-amber-300/95 truncate drop-shadow-sm">
              {track.title}
            </h1>
            <p className="text-xs sm:text-sm text-zinc-300/85 truncate mt-0.5">
              {track.artist} · {track.album}
            </p>
          </div>

          <div className="flex items-center gap-0.5 shrink-0 relative">
            <button
              type="button"
              onClick={() => onToggleFavorite(track.id)}
              aria-label={track.isFavorite ? 'Remove from favorites' : 'Favorite track'}
              className={`min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full transition-colors ${
                track.isFavorite
                  ? 'text-amber-400'
                  : 'text-zinc-200/80 hover:text-white hover:bg-white/10'
              }`}
            >
              <Heart className={`w-5 h-5 ${track.isFavorite ? 'fill-current' : ''}`} />
            </button>

            <button
              type="button"
              onClick={() => setMenuOpen((prev) => !prev)}
              aria-label="More artwork options"
              aria-expanded={menuOpen}
              className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full text-zinc-200/80 hover:text-white hover:bg-white/10 transition-colors"
            >
              <MoreVertical className="w-5 h-5" />
            </button>

            {menuOpen && (
              <div className="absolute right-0 bottom-12 z-30 w-52 rounded-xl bg-zinc-950/95 border border-white/15 p-1.5 shadow-2xl backdrop-blur-xl">
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    coverInputRef.current?.click();
                  }}
                  className="w-full text-left px-3 py-2 text-xs text-zinc-100 hover:bg-white/10 rounded-lg flex items-center gap-2"
                >
                  <ImagePlus className="w-3.5 h-3.5 text-amber-400" />
                  <span>Set Custom Cover Art</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onResetPosition(track.id);
                  }}
                  className="w-full text-left px-3 py-2 text-xs text-zinc-100 hover:bg-white/10 rounded-lg flex items-center gap-2"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
                  <span>Restart from 0:00</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onToggleCloak(track.id);
                  }}
                  className="w-full text-left px-3 py-2 text-xs text-zinc-100 hover:bg-white/10 rounded-lg flex items-center gap-2"
                >
                  <EyeOff className="w-3.5 h-3.5 text-amber-400" />
                  <span>{track.isCloaked ? 'Restore from Cloak' : 'Move to Cloak Access'}</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Amber Scrubber Bar & Exact H:MM:SS Timestamps */}
        <div className="space-y-2">
          <div className="relative flex items-center h-5">
            <div className="w-full h-[3px] rounded-full bg-white/25 overflow-hidden pointer-events-none">
              <div
                className="h-full bg-amber-400 transition-[width] duration-150"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <div
              aria-hidden="true"
              className="absolute w-3.5 h-3.5 rounded-full bg-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.7)] pointer-events-none -translate-x-1/2"
              style={{ left: `${progressPct}%` }}
            />
            <input
              type="range"
              min={0}
              max={duration}
              step={1}
              value={Math.min(displayTime, duration)}
              onChange={(e) => {
                onSeek(Number(e.target.value));
              }}
              aria-label="Seek audio position"
              className="cave-slider absolute inset-0 w-full opacity-0 cursor-pointer"
            />
          </div>

          <div className="flex items-center justify-between text-xs font-mono-tabular text-zinc-200/90">
            <span>{formatDuration(displayTime)}</span>
            <span>{formatDuration(track.duration)}</span>
          </div>
        </div>

        {/* Hero Outlined Amber Transport Row */}
        <div className="flex items-center justify-center gap-4 sm:gap-9 py-2">
          <button
            type="button"
            onClick={() => handleSkipBy(-15)}
            aria-label="Rewind 15 seconds"
            title="Rewind 15s"
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full text-zinc-300/75 hover:text-amber-300 hover:bg-white/10 font-mono-tabular text-xs transition-colors"
          >
            -15s
          </button>

          <button
            type="button"
            onClick={onPrev}
            aria-label="Previous track"
            className="min-w-[56px] min-h-[56px] flex items-center justify-center rounded-full text-amber-400 hover:text-amber-300 hover:bg-amber-400/10 active:scale-95 transition-all"
          >
            <Rewind className="w-10 h-10" strokeWidth={1.6} />
          </button>

          <button
            type="button"
            onClick={handlePrimaryPlay}
            aria-label={activePlaying ? 'Pause' : 'Play'}
            className="min-w-[64px] min-h-[64px] flex items-center justify-center rounded-full text-amber-400 hover:text-amber-300 hover:bg-amber-400/10 active:scale-95 transition-all"
          >
            {activePlaying ? (
              <Pause className="w-11 h-11" strokeWidth={1.7} />
            ) : (
              <Play className="w-11 h-11 ml-1" strokeWidth={1.7} />
            )}
          </button>

          <button
            type="button"
            onClick={onNext}
            aria-label="Next track"
            className="min-w-[56px] min-h-[56px] flex items-center justify-center rounded-full text-amber-400 hover:text-amber-300 hover:bg-amber-400/10 active:scale-95 transition-all"
          >
            <FastForward className="w-10 h-10" strokeWidth={1.6} />
          </button>

          <button
            type="button"
            onClick={() => handleSkipBy(15)}
            aria-label="Forward 15 seconds"
            title="Forward 15s"
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full text-zinc-300/75 hover:text-amber-300 hover:bg-white/10 font-mono-tabular text-xs transition-colors"
          >
            +15s
          </button>
        </div>

        {/* Bottom Utility Bar: Cave EQ · Change Cover Art · Queue */}
        <div className="flex items-center justify-between pt-2">
          <button
            type="button"
            onClick={onOpenEq}
            aria-label="Open Cave Equalizer"
            title="Cave EQ"
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-zinc-200/85 hover:text-amber-300 hover:bg-white/10 transition-colors"
          >
            <SlidersVertical className="w-5 h-5" />
          </button>

          <button
            type="button"
            onClick={() => coverInputRef.current?.click()}
            className="h-9 px-5 rounded border border-emerald-400/35 bg-black/50 hover:bg-black/75 hover:border-amber-400/60 text-[11px] font-medium tracking-widest text-zinc-100 flex items-center gap-2 transition-colors whitespace-nowrap shrink-0"
          >
            <ImagePlus className="w-3.5 h-3.5 text-zinc-200" />
            <span>COVER ART</span>
          </button>

          <button
            type="button"
            onClick={onOpenQueue}
            aria-label="Open Queue"
            title="Queue"
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-zinc-200/85 hover:text-amber-300 hover:bg-white/10 transition-colors"
          >
            <Menu className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
};
