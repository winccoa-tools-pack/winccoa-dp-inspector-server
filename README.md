# WinCC OA DP Inspector Server

A lightweight Node.js WebSocket server that bridges **WinCC OA datapoints** to the
[vscode-winccoa-dp-inspector](https://github.com/winccoa-tools-pack/vscode-winccoa-dp-inspector)
VS Code extension.

It is designed to run as a **WinCC OA JavaScript Manager** inside a running WinCC OA project.

---

## Protocol

All messages are JSON. Full type definitions are in [`src/protocol.ts`](src/protocol.ts).

### Client → Server

| Message | Description |
|---|---|
| `{ type: "subscribe", id, dps[] }` | Subscribe to one or more DP elements |
| `{ type: "unsubscribe", id }` | Cancel subscription |
| `{ type: "dpSearch", id, query }` | Search DPs by wildcard (e.g. `System1:Pump*`) |

### Server → Client

| Message | Description |
|---|---|
| `{ type: "subscribed", id, status }` | Subscription confirmed |
| `{ type: "update", id, dp, value, ts, quality }` | Live DP value update |
| `{ type: "dpSearchResult", id, dps[] }` | Search results |
| `{ type: "error", id, message }` | Error response |

---

## Configuration

| Variable | Default | Description |
|---|---|---|
| `DP_INSPECTOR_PORT` | `4712` | TCP port to listen on |
| `DP_INSPECTOR_HOST` | `0.0.0.0` | Bind address |
| `DP_INSPECTOR_USE_MOCK` | `false` | Use simulated data (local dev) |

---

## Running locally (mock data)

```bash
npm install
npm run dev:mock
```

The mock adapter generates random-walk values for a set of simulated DPs. Connect the
VS Code extension to `localhost:4712`.

## Building

```bash
npm run build
# Output: dist/index.js
```

## Deploying as a WinCC OA JavaScript Manager

1. Copy the compiled `dist/` folder and `node_modules/` into your WinCC OA project's
   `scripts/libs/` or a dedicated subfolder.
2. In the WinCC OA Console, add a new **JavaScript Manager** pointing to `dist/index.js`.
3. Configure the port via the `DP_INSPECTOR_PORT` environment variable or accept the
   default `4712`.
4. Start the manager — it reads live DP values via `dpConnect` / `dpQuery` which are
   injected as globals by the WinCC OA runtime.

> **Note:** The `WinCCOaDpAdapter` (used in production) references `globalThis.dpConnect`,
> `globalThis.dpDisconnect`, and `globalThis.dpQuery` — these are not standard Node.js APIs.
> They are only available when the process is launched by the WinCC OA runtime. Use the
> mock adapter (`DP_INSPECTOR_USE_MOCK=true`) for local development.
