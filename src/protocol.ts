/**
 * WebSocket protocol types for the WinCC OA DP Inspector.
 *
 * All messages are JSON-serialized.
 */

// ─── Client → Server ─────────────────────────────────────────────────────────

/** Subscribe to one or more datapoint elements. */
export interface SubscribeMsg {
  type: 'subscribe';
  /** Unique session/subscription ID chosen by the client. */
  id: string;
  /** Array of fully-qualified DP element names, e.g. "System1:Pump1.value" */
  dps: string[];
}

/** Cancel all subscriptions for the given session ID. */
export interface UnsubscribeMsg {
  type: 'unsubscribe';
  id: string;
}

/** Search for datapoints matching a wildcard pattern. */
export interface DpSearchMsg {
  type: 'dpSearch';
  /** Correlation ID returned with the result. */
  id: string;
  /** Wildcard query, e.g. "System1:Pump*" */
  query: string;
}

export type ClientMessage = SubscribeMsg | UnsubscribeMsg | DpSearchMsg;

// ─── Server → Client ─────────────────────────────────────────────────────────

/** Confirmation that a subscription was accepted. */
export interface SubscribedMsg {
  type: 'subscribed';
  id: string;
  status: 'ok';
}

/** Live value update for a single datapoint element. */
export interface UpdateMsg {
  type: 'update';
  /** Subscription ID that triggered this update. */
  id: string;
  /** Fully-qualified DP element name. */
  dp: string;
  /** Current value (number | boolean | string). */
  value: number | boolean | string | null;
  /** Unix timestamp in milliseconds. */
  ts: number;
  /** "good" | "bad" | "uncertain" */
  quality: 'good' | 'bad' | 'uncertain';
}

/** Result of a dpSearch query. */
export interface DpSearchResultMsg {
  type: 'dpSearchResult';
  id: string;
  dps: string[];
}

/** Error response for any message. */
export interface ErrorMsg {
  type: 'error';
  /** ID of the originating message, or empty string for global errors. */
  id: string;
  message: string;
}

export type ServerMessage = SubscribedMsg | UpdateMsg | DpSearchResultMsg | ErrorMsg;
