/**
 * Anonymous traffic counts (no UI). Two events only: 'page_view' once per page load and
 * 'run_start' when a real run starts (any mode; never the tutorial or the title demo video).
 *
 * Privacy: a random id (crypto.randomUUID) lives in localStorage and only its SHA-256 hash is
 * sent. Also sent: a coarse device class and the referrer's host name. No cookies, IP, user
 * agent or fingerprinting. Opt out with ?notrack=1 (sets localStorage fsb_notrack=1; ?notrack=0
 * clears it).
 *
 * Fire-and-forget: every step is wrapped so a failure, a blocked request or a missing API can
 * never affect gameplay, load time or the leaderboard.
 */

const VISITOR_KEY = 'fsb-visitor-v1';
const NOTRACK_KEY = 'fsb_notrack';

const RAW_URL = (import.meta.env.VITE_SUPABASE_URL ?? '').trim().replace(/\/+$/, '');
const ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim();
const enabled =
  /^https?:\/\/[^/]+/.test(RAW_URL) && ANON_KEY.length > 20 && !/REPLACE|PLACEHOLDER|YOUR_/i.test(ANON_KEY);

let off: boolean | null = null;
let hashP: Promise<string | null> | null = null;

/** Opt-out flag; ?notrack=1 / ?notrack=0 on the URL sets / clears it. */
function trackingOff(): boolean {
  if (off !== null) return off;
  off = true;
  try {
    const q = new URLSearchParams(window.location.search).get('notrack');
    if (q === '1') localStorage.setItem(NOTRACK_KEY, '1');
    else if (q === '0') localStorage.removeItem(NOTRACK_KEY);
    off = !enabled || localStorage.getItem(NOTRACK_KEY) === '1';
  } catch {
    off = true; // no storage = no stable id: don't track
  }
  return off;
}

function visitorHash(): Promise<string | null> {
  if (hashP) return hashP;
  hashP = (async () => {
    try {
      let id = localStorage.getItem(VISITOR_KEY);
      if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
        id = crypto.randomUUID();
        localStorage.setItem(VISITOR_KEY, id);
      }
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(id));
      return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
    } catch {
      return null;
    }
  })();
  return hashP;
}

function deviceClass(): 'phone' | 'tablet' | 'desktop' {
  try {
    const touch = window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
    if (!touch) return 'desktop';
    return Math.min(window.screen.width, window.screen.height) < 600 ? 'phone' : 'tablet';
  } catch {
    return 'desktop';
  }
}

/** Host of an external referrer only (no path / query); null for direct or same-site. */
function referrerHost(): string | null {
  try {
    if (!document.referrer) return null;
    const h = new URL(document.referrer).hostname.toLowerCase();
    if (!h || h === window.location.hostname.toLowerCase()) return null;
    return /^[a-z0-9.-]{1,253}$/.test(h) ? h : null;
  } catch {
    return null;
  }
}

function send(event: 'page_view' | 'run_start', mode: string | null, level: number | null): void {
  try {
    if (trackingOff()) return;
    void visitorHash()
      .then((hash) => {
        if (!hash) return;
        const headers: Record<string, string> = { apikey: ANON_KEY, 'Content-Type': 'application/json' };
        if (ANON_KEY.startsWith('eyJ')) headers.Authorization = `Bearer ${ANON_KEY}`;
        const init: RequestInit = {
          method: 'POST',
          headers,
          cache: 'no-store',
          credentials: 'omit',
          body: JSON.stringify({
            p_visitor_hash: hash,
            p_event: event,
            p_mode: mode,
            p_level: level,
            p_device_class: deviceClass(),
            p_referrer_host: event === 'page_view' ? referrerHost() : null,
          }),
        };
        const url = `${RAW_URL}/rest/v1/rpc/fsb_track`;
        // keepalive survives navigation; browsers that refuse a keepalive request needing a CORS
        // preflight get one plain retry.
        return fetch(url, { ...init, keepalive: true }).catch(() => fetch(url, init));
      })
      .catch(() => {});
  } catch {
    /* never let tracking throw */
  }
}

/** Once per page load, after the page has finished loading (never on the load path). */
export function trackPageView(): void {
  try {
    if (trackingOff()) return;
    const go = (): void => {
      window.setTimeout(() => send('page_view', null, null), 1500);
    };
    if (document.readyState === 'complete') go();
    else window.addEventListener('load', go, { once: true });
  } catch {
    /* ignore */
  }
}

/** A real run started: mode name ('STANDARD' for no fan mode) and the starting level. */
export function trackRunStart(mode: string | null, level: number): void {
  send('run_start', (mode ?? 'STANDARD').toUpperCase().slice(0, 40), Math.round(level));
}
