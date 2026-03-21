import type { IDpAdapter, DpValueCallback } from './dpAdapter';
import type { UpdateMsg } from './protocol';
import { logger } from './logger';

type SendFn = (msg: UpdateMsg) => void;

interface SessionEntry {
  subscriptionId: string;
  dp: string;
  cb: DpValueCallback;
}

/**
 * Manages per-client, per-subscription DP connections.
 *
 * Each WebSocket client is identified by a clientId (assigned on connection).
 * Each `subscribe` message creates a subscription identified by a subscriptionId.
 * One subscription covers multiple DP elements; each gets its own dpConnect call.
 */
export class SubscriptionManager {
  private readonly _adapter: IDpAdapter;

  // clientId → list of session entries
  private readonly _sessions = new Map<string, SessionEntry[]>();

  constructor(adapter: IDpAdapter) {
    this._adapter = adapter;
  }

  /**
   * Register a subscription for the given client.
   * For each DP, calls adapter.connect() and routes updates to sendFn.
   */
  subscribe(clientId: string, subscriptionId: string, dps: string[], sendFn: SendFn): void {
    logger.info(
      'SubscriptionManager',
      `subscribe: client=${clientId} sub=${subscriptionId} dps=[${dps.join(', ')}]`,
    );

    const existing = this._sessions.get(clientId) ?? [];

    for (const dp of dps) {
      const cb: DpValueCallback = (dpName, value, ts, quality) => {
        sendFn({ type: 'update', id: subscriptionId, dp: dpName, value, ts, quality });
      };

      this._adapter.connect(dp, cb);
      existing.push({ subscriptionId, dp, cb });
    }

    this._sessions.set(clientId, existing);
  }

  /**
   * Cancel all DP connections belonging to the given subscriptionId for a client.
   */
  unsubscribe(clientId: string, subscriptionId: string): void {
    logger.info(
      'SubscriptionManager',
      `unsubscribe: client=${clientId} sub=${subscriptionId}`,
    );

    const entries = this._sessions.get(clientId);
    if (!entries) return;

    const toRemove = entries.filter((e) => e.subscriptionId === subscriptionId);
    const remaining = entries.filter((e) => e.subscriptionId !== subscriptionId);

    for (const entry of toRemove) {
      this._adapter.disconnect(entry.dp, entry.cb);
    }

    if (remaining.length === 0) {
      this._sessions.delete(clientId);
    } else {
      this._sessions.set(clientId, remaining);
    }
  }

  /**
   * Clean up all subscriptions for a client (e.g., on disconnect).
   */
  cleanupClient(clientId: string): void {
    logger.info('SubscriptionManager', `cleanupClient: ${clientId}`);

    const entries = this._sessions.get(clientId);
    if (!entries) return;

    for (const entry of entries) {
      this._adapter.disconnect(entry.dp, entry.cb);
    }

    this._sessions.delete(clientId);
  }

  /** Number of active clients */
  get clientCount(): number {
    return this._sessions.size;
  }
}
