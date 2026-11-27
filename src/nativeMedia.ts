/**
 * Bridges the web MediaSession API to Android's native media notification,
 * lock-screen card and quick-settings player (via window.CaveNative, see CaveMediaBridge.java).
 * Does nothing in a normal browser.
 */
interface CaveNativeApi {
  update(json: string): void;
  clear(): void;
}
type MediaHandler = (details: { action: string; seekTime?: number; seekOffset?: number }) => void;

const win = window as unknown as {
  CaveNative?: CaveNativeApi;
  __caveMediaAction?: (action: string, positionMs: number) => void;
};

function hashString(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return `${s.length}:${h}`;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image'));
    img.src = src;
  });
}

async function artToBase64(list: { src: string }[]): Promise<string> {
  for (const a of list) {
    try {
      const img = await loadImage(a.src);
      const size = 512;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) continue;
      const r = Math.max(size / img.width, size / img.height);
      const w = img.width * r;
      const h = img.height * r;
      ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
      return canvas.toDataURL('image/jpeg', 0.85).split(',')[1] || '';
    } catch {
      // try next artwork entry
    }
  }
  return '';
}

function install() {
  const native = win.CaveNative;
  if (!native || typeof navigator === 'undefined') return;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const real: any = (navigator as any).mediaSession;
  const handlers: Record<string, MediaHandler | null> = {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let meta: any = null;
  let state: 'none' | 'paused' | 'playing' = 'none';
  let pos = { duration: 0, position: 0 };
  let lastPos = 0;
  let lastAt = 0;
  let lastDur = -1;
  let lastArtKey = '';
  let timer: number | undefined;
  let sending = false;
  let again = false;

  const schedule = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(flush, 80);
  };

  async function flush() {
    if (sending) {
      again = true;
      return;
    }
    sending = true;
    try {
      if (!meta || state === 'none') {
        native!.clear();
        lastArtKey = '';
        return;
      }
      const artList: { src: string }[] = Array.from(meta.artwork || []);
      const key = hashString(artList.map((a) => a.src).join('|'));
      const payload: Record<string, unknown> = {
        title: meta.title || '',
        artist: meta.artist || '',
        album: meta.album || '',
        duration: Math.round(pos.duration * 1000),
        position: Math.round(pos.position * 1000),
        playing: state === 'playing',
      };
      if (key !== lastArtKey) {
        payload.art = await artToBase64(artList);
        lastArtKey = key;
      }
      payload.position = Math.round(pos.position * 1000);
      native!.update(JSON.stringify(payload));
      lastPos = pos.position;
      lastAt = Date.now();
      lastDur = pos.duration;
    } catch {
      // ignore
    } finally {
      sending = false;
      if (again) {
        again = false;
        schedule();
      }
    }
  }

  const fake = {
    get metadata() {
      return meta;
    },
    set metadata(m) {
      meta = m;
      try {
        if (real) real.metadata = m;
      } catch {
        /* ignore */
      }
      schedule();
    },
    get playbackState() {
      return state;
    },
    set playbackState(s: 'none' | 'paused' | 'playing') {
      state = s;
      try {
        if (real) real.playbackState = s;
      } catch {
        /* ignore */
      }
      schedule();
    },
    setActionHandler(action: string, handler: MediaHandler | null) {
      handlers[action] = handler;
      try {
        if (real) real.setActionHandler(action, handler);
      } catch {
        /* ignore */
      }
    },
    setPositionState(p?: { duration?: number; position?: number }) {
      try {
        if (real && typeof real.setPositionState === 'function') real.setPositionState(p);
      } catch {
        /* ignore */
      }
      if (!p) return;
      pos = { duration: p.duration ?? pos.duration, position: p.position ?? pos.position };
      const expected = lastPos + (state === 'playing' ? (Date.now() - lastAt) / 1000 : 0);
      if (Math.abs(pos.position - expected) > 1.5 || pos.duration !== lastDur) schedule();
    },
  };

  try {
    Object.defineProperty(navigator, 'mediaSession', { configurable: true, value: fake });
  } catch {
    return;
  }

  // Native notification / lock-screen buttons -> web app handlers
  win.__caveMediaAction = (action: string, positionMs: number) => {
    const h = handlers[action];
    if (!h) return;
    h({ action, seekTime: positionMs / 1000, seekOffset: 10 });
  };
}

install();

export {};
