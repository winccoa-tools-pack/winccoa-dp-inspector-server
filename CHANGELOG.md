# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-03-22

### Added

- Initial release: WebSocket server designed to run as a WinCC OA JavaScript Manager
- Real `WinccoaManager` API integration (`dpConnect`, `dpDisconnect`, `dpNames`, `dpElementType`) via `winccoa-manager` package
- `dpSearch` protocol: wildcard search across all datapoints with element types
- `subscribe` / `unsubscribe` protocol for live DP value streaming
- `update` messages with value, timestamp, and quality
- Mock adapter (`DP_INSPECTOR_USE_MOCK=true`) for local development without a running WinCC OA instance
- Subscription manager for multiplexed client connections
- Configurable port (`DP_INSPECTOR_PORT`, default: `4712`) and bind address (`DP_INSPECTOR_HOST`, default: `0.0.0.0`)
- TypeScript source with `dist/index.js` build output for WinCC OA manager deployment

## [Unreleased]
