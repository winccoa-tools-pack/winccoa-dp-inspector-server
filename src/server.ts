import { WebSocketServer, WebSocket } from 'ws';
import { randomUUID } from 'crypto';
import type { IDpAdapter } from './dpAdapter';
import type { ClientMessage, ServerMessage } from './protocol';
import { SubscriptionManager } from './subscriptionManager';
import { logger } from './logger';

function send(ws: WebSocket, msg: ServerMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

/**
 * Creates and starts the WebSocket server.
 *
 * @param host  Bind address (e.g. "0.0.0.0")
 * @param port  TCP port (default 4712)
 * @param adapter  IDpAdapter implementation (mock or WinCC OA)
 * @returns The running WebSocketServer instance
 */
export function startServer(host: string, port: number, adapter: IDpAdapter): WebSocketServer {
  const wss = new WebSocketServer({ host, port });
  const subManager = new SubscriptionManager(adapter);

  logger.info('Server', `WebSocket server listening on ws://${host}:${port}`);

  wss.on('connection', (ws) => {
    const clientId = randomUUID();
    logger.info('Server', `Client connected: ${clientId}`);

    ws.on('message', async (raw) => {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(raw.toString()) as ClientMessage;
      } catch {
        logger.warn('Server', `Invalid JSON from ${clientId}: ${raw}`);
        send(ws, { type: 'error', id: '', message: 'Invalid JSON' });
        return;
      }

      logger.debug('Server', `[${clientId}] → ${JSON.stringify(msg)}`);

      switch (msg.type) {
        case 'subscribe': {
          if (!Array.isArray(msg.dps) || msg.dps.length === 0) {
            send(ws, { type: 'error', id: msg.id, message: 'No DPs specified' });
            return;
          }
          subManager.subscribe(clientId, msg.id, msg.dps, (updateMsg) => {
            send(ws, updateMsg);
          });
          send(ws, { type: 'subscribed', id: msg.id, status: 'ok' });
          break;
        }

        case 'unsubscribe': {
          subManager.unsubscribe(clientId, msg.id);
          break;
        }

        case 'dpSearch': {
          try {
            const dps = await adapter.query(msg.query);
            send(ws, { type: 'dpSearchResult', id: msg.id, dps });
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            logger.error('Server', `dpSearch failed: ${message}`, err instanceof Error ? err : undefined);
            send(ws, { type: 'error', id: msg.id, message: `dpSearch failed: ${message}` });
          }
          break;
        }

        default: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          send(ws, { type: 'error', id: (msg as any).id ?? '', message: 'Unknown message type' });
        }
      }
    });

    ws.on('close', () => {
      logger.info('Server', `Client disconnected: ${clientId}`);
      subManager.cleanupClient(clientId);
    });

    ws.on('error', (err) => {
      logger.error('Server', `Error from client ${clientId}`, err);
    });
  });

  wss.on('error', (err) => {
    logger.error('Server', 'WebSocket server error', err);
  });

  return wss;
}
