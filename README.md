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

## Installation

### Automatic (recommended)

Use the **WinCC OA DP Inspector** VS Code extension. It handles cloning, building, and
registering the manager via PMON in one step:

1. Open your WinCC OA project in VS Code
2. Run **`WinCC OA: DP Inspector - Setup Server`** from the Command Palette
3. The extension clones this repo into `<project>/javascript/dpInspectorServer/`, builds it,
   and registers the Node.js manager via PMON

See [vscode-winccoa-dp-inspector](https://github.com/winccoa-tools-pack/vscode-winccoa-dp-inspector) for details.

### Manual

```bash
# Inside your WinCC OA project directory:
git clone https://github.com/winccoa-tools-pack/winccoa-dp-inspector-server javascript/dpInspectorServer
cd javascript/dpInspectorServer
npm ci
npm run build
```

Then add a JavaScript Manager entry in your WinCC OA project configuration (`config/progs`):

```
node -num <N> manual 1 1 2 2 dpInspectorServer/dist/index.js
```

> WinCC OA automatically prepends `<project>/javascript/` to the script path.

## Deploying as a WinCC OA JavaScript Manager

The server uses the `winccoa-manager` Node.js package which wraps the WinCC OA runtime API
(`dpConnect`, `dpDisconnect`, `dpNames`, `dpElementType`). These APIs are only available
when the process is launched by the WinCC OA runtime.

Use `DP_INSPECTOR_USE_MOCK=true` for local development without a running WinCC OA instance.
