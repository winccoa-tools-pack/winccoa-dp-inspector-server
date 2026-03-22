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

interface MockSubscription {
  dp: string;
  cb: DpValueCallback;
  intervalId: ReturnType<typeof setInterval>;
  currentValue: number;
}

/**
 * In-process mock adapter that produces random-walk values at ~1 s intervals.
 * Use this when `DP_INSPECTOR_USE_MOCK=true` or during automated tests.
 */
export class MockDpAdapter implements IDpAdapter {
  private readonly _subs = new Map<string, MockSubscription[]>();

  connect(dp: string, cb: DpValueCallback): void {
    const existing = this._subs.get(dp) ?? [];

    const startValue = 50 + Math.random() * 50;
    let currentValue = startValue;

    const intervalId = setInterval(() => {
      // Random walk: ±5% of full scale (0-100)
      currentValue = Math.max(0, Math.min(100, currentValue + (Math.random() - 0.5) * 5));
      cb(dp, parseFloat(currentValue.toFixed(3)), Date.now(), 'good');
    }, 1000);

    // Fire with initial value immediately (async to avoid re-entrant issues)
    setTimeout(() => cb(dp, parseFloat(startValue.toFixed(3)), Date.now(), 'good'), 50);

    existing.push({ dp, cb, intervalId, currentValue });
    this._subs.set(dp, existing);
    logger.debug('MockDpAdapter', `connect: ${dp} (${existing.length} listeners)`);
  }

  disconnect(dp: string, cb: DpValueCallback): void {
    const subs = this._subs.get(dp);
    if (!subs) return;

    const idx = subs.findIndex((s) => s.cb === cb);
    if (idx === -1) return;

    clearInterval(subs[idx].intervalId);
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
