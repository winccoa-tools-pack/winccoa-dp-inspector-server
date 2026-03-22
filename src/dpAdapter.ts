import { logger } from './logger';
import type { DpSearchEntry } from './protocol';

/** Callback called when a datapoint value changes. */
export type DpValueCallback = (
  dp: string,
  value: number | boolean | string | null,
  ts: number,
  quality: 'good' | 'bad' | 'uncertain',
) => void;

/**
 * Abstraction over the WinCC OA DP access API.
 * This interface is implemented both by the real WinCC OA adapter (runtime)
 * and a mock adapter (local development / testing).
 */
export interface IDpAdapter {
  /**
   * Subscribe to value changes of a datapoint element.
   * The callback is invoked immediately with the current value and on every change.
   */
  connect(dp: string, cb: DpValueCallback): void;

  /**
   * Cancel the value-change subscription registered via connect().
   * The exact callback reference must match the one passed to connect().
   */
  disconnect(dp: string, cb: DpValueCallback): void;

  /**
   * Query datapoint names matching a wildcard pattern.
   * @param pattern e.g. "System1:Pump*"
   */
  query(pattern: string): Promise<DpSearchEntry[]>;
}

// ─── Mock Adapter ─────────────────────────────────────────────────────────────

/** Simulated DP catalogue for local development. */
const MOCK_DPS: DpSearchEntry[] = [
  { name: 'System1:Pump1.pressure',   type: 'float' },
  { name: 'System1:Pump1.running',    type: 'bool'  },
  { name: 'System1:Pump1.state',      type: 'enum'  },
  { name: 'System1:Pump2.pressure',   type: 'float' },
  { name: 'System1:Pump2.running',    type: 'bool'  },
  { name: 'System1:Tank1.level',      type: 'float' },
  { name: 'System1:Tank2.level',      type: 'float' },
  { name: 'System1:Valve1.position',  type: 'float' },
  { name: 'System1:Valve2.position',  type: 'float' },
  { name: 'System1:Valve3.mode',      type: 'enum'  },
  { name: 'System1:Sensor_Temp1.value', type: 'float' },
  { name: 'System1:Sensor_Temp2.value', type: 'float' },
  { name: 'System1:Sensor_Press1.value', type: 'float' },
  { name: 'System1:Motor1.speed',     type: 'float' },
  { name: 'System1:Motor2.speed',     type: 'float' },
  { name: 'System1:Flow1.rate',       type: 'float' },
  { name: 'System1:Flow2.rate',       type: 'float' },
];

// ─── Signal generators ────────────────────────────────────────────────────────

type SignalFn = (t: number) => number | boolean;

/** t = elapsed seconds since subscription start */
const SIGNAL_MAP: Record<string, SignalFn> = {
  // Sinus signals — pressure/flow
  'Pump1.pressure':          (t) => parseFloat((60 + 40 * Math.sin(2 * Math.PI * t / 60)).toFixed(2)),
  'Pump2.pressure':          (t) => parseFloat((55 + 35 * Math.sin(2 * Math.PI * t / 45 + 1)).toFixed(2)),
  'Sensor_Press1.value':     (t) => parseFloat((5 + 3 * Math.sin(2 * Math.PI * t / 30 + 0.5)).toFixed(3)),
  'Flow1.rate':              (t) => parseFloat((200 + 80 * Math.sin(2 * Math.PI * t / 50)).toFixed(1)),
  'Flow2.rate':              (t) => parseFloat((150 + 60 * Math.sin(2 * Math.PI * t / 70 + 2)).toFixed(1)),

  // Large range — Motor speed 0-3000 RPM (for dual-axis test)
  'Motor1.speed':            (t) => parseFloat((1500 + 1200 * Math.sin(2 * Math.PI * t / 80)).toFixed(0)),
  'Motor2.speed':            (t) => parseFloat((1800 + 900 * Math.sin(2 * Math.PI * t / 55 + 0.8)).toFixed(0)),

  // Small range — Temperature 18-26°C (for dual-axis test with Motor)
  'Sensor_Temp1.value':      (t) => parseFloat((22 + 3 * Math.sin(2 * Math.PI * t / 120)).toFixed(2)),
  'Sensor_Temp2.value':      (t) => parseFloat((19 + 2.5 * Math.cos(2 * Math.PI * t / 90)).toFixed(2)),

  // Sawtooth/ramp 0→100 over 60s
  'Tank1.level':             (t) => parseFloat(((t % 60) / 60 * 100).toFixed(1)),
  'Tank2.level':             (t) => parseFloat((100 - (t % 60) / 60 * 100).toFixed(1)),  // falling ramp

  // Valve position — slower ramp 0→100 over 30s, back
  'Valve1.position':         (t) => {
    const phase = (t % 30) / 30;
    return parseFloat((phase < 0.5 ? phase * 2 * 100 : (1 - phase) * 2 * 100).toFixed(1));
  },
  'Valve2.position':         (t) => parseFloat(((t % 30) / 30 * 100).toFixed(1)),

  // Bool toggles every 5s
  'Pump1.running':           (t) => Math.floor(t / 5) % 2 === 0,
  'Pump2.running':           (t) => Math.floor(t / 7) % 2 === 0,

  // Enum stepping 0→1→2→0 every 8s
  'Pump1.state':             (t) => Math.floor(t / 8) % 3,
  'Valve3.mode':             (t) => Math.floor(t / 6) % 3,
};

function getSignalFn(dp: string): SignalFn {
  // Match by the element part (after last dot or colon)
  const key = dp.includes(':') ? dp.split(':')[1] ?? dp : dp;
  return SIGNAL_MAP[key] ?? ((t) => parseFloat((50 + 30 * Math.sin(2 * Math.PI * t / 40 + Math.random())).toFixed(2)));
}

interface MockSubscription {
  dp: string;
  cb: DpValueCallback;
  intervalId: ReturnType<typeof setInterval>;
}

/**
 * In-process mock adapter with realistic signal shapes:
 * - Sinus for pressure/flow/temperature
 * - Sawtooth/ramp for tank levels
 * - Bool toggle for running states
 * - Enum stepping for modes/states
 * - Large-range motor speeds for dual-axis testing
 */
export class MockDpAdapter implements IDpAdapter {
  private readonly _subs = new Map<string, MockSubscription[]>();

  connect(dp: string, cb: DpValueCallback): void {
    const existing = this._subs.get(dp) ?? [];
    const signalFn = getSignalFn(dp);
    const startMs = Date.now();

    // Fire initial value immediately
    setTimeout(() => {
      const v = signalFn(0);
      cb(dp, v, Date.now(), 'good');
    }, 50);

    const intervalId = setInterval(() => {
      const t = (Date.now() - startMs) / 1000; // elapsed seconds
      const v = signalFn(t);
      cb(dp, v, Date.now(), 'good');
    }, 500); // 500ms for smoother sinus curves

    existing.push({ dp, cb, intervalId });
    this._subs.set(dp, existing);
    logger.debug('MockDpAdapter', `connect: ${dp} (${existing.length} listeners)`);
  }

  disconnect(dp: string, cb: DpValueCallback): void {
    const subs = this._subs.get(dp);
    if (!subs) return;

    const idx = subs.findIndex((s) => s.cb === cb);
    if (idx === -1) return;

    clearInterval(subs[idx]!.intervalId);
    subs.splice(idx, 1);

    if (subs.length === 0) {
      this._subs.delete(dp);
    } else {
      this._subs.set(dp, subs);
    }
    logger.debug('MockDpAdapter', `disconnect: ${dp} (${subs.length} listeners remaining)`);
  }

  query(pattern: string): Promise<DpSearchEntry[]> {
    // Convert WinCC OA wildcard pattern (System1:Pump*) to a RegExp
    const regexStr = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&') // escape regex meta (except * ?)
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');
    const re = new RegExp(`^${regexStr}`, 'i');
    const results = MOCK_DPS.filter((entry) => re.test(entry.name));
    logger.debug('MockDpAdapter', `query("${pattern}") → ${results.length} results`);
    return Promise.resolve(results);
  }
}

// ─── WinCC OA Runtime Adapter ─────────────────────────────────────────────────

/**
 * Production adapter that delegates to the WinCC OA JS API.
 *
 * The WinCC OA JavaScript Manager injects the following global functions at
 * runtime into the Node.js context:
 *   - `dpConnect(dp, callback)`
 *   - `dpDisconnect(dp, callback)`
 *   - `dpQuery(pattern)` — returns an array of DP names
 *
 * These are NOT available at development time; they are referenced as
 * `(globalThis as any).dpConnect(...)` to avoid TypeScript errors.
 *
 * See WinCC OA documentation: "JavaScript Manager API Reference"
 */
export class WinCCOaDpAdapter implements IDpAdapter {
  connect(dp: string, cb: DpValueCallback): void {
    // The WinCC OA callback receives (dpName, value, timestamp, quality).
    // We adapt the signature to match DpValueCallback.
    const adapter = (dpName: string, value: unknown, ts: unknown, quality: unknown) => {
      const tsMs = typeof ts === 'number' ? ts * 1000 : Date.now();
      const q: 'good' | 'bad' | 'uncertain' =
        quality === 0 ? 'good' : quality === 1 ? 'bad' : 'uncertain';
      cb(dpName, value as number | boolean | string | null, tsMs, q);
    };

    // Store the adapted callback so we can pass the same reference to dpDisconnect
    WinCCOaDpAdapter._adapters.set(cb, adapter);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).dpConnect(dp, adapter);
    logger.debug('WinCCOaDpAdapter', `dpConnect: ${dp}`);
  }

  disconnect(dp: string, cb: DpValueCallback): void {
    const adapter = WinCCOaDpAdapter._adapters.get(cb);
    if (!adapter) return;
    WinCCOaDpAdapter._adapters.delete(cb);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).dpDisconnect(dp, adapter);
    logger.debug('WinCCOaDpAdapter', `dpDisconnect: ${dp}`);
  }

  query(pattern: string): Promise<DpSearchEntry[]> {
    return new Promise((resolve, reject) => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rawResults: string[] = (globalThis as any).dpQuery(pattern) ?? [];
        const results: DpSearchEntry[] = rawResults.map((name) => ({ name, type: 'float' as const }));
        logger.debug('WinCCOaDpAdapter', `dpQuery("${pattern}") → ${results.length} results`);
        resolve(results);
      } catch (err) {
        reject(err);
      }
    });
  }

  // Maps original DpValueCallback → adapted WinCC OA callback, so disconnect can find it
  private static readonly _adapters = new WeakMap<DpValueCallback, Function>();
}
