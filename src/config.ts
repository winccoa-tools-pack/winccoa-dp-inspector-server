/**
 * Server configuration — read from environment variables with sensible defaults.
 */
export interface ServerConfig {
  host: string;
  port: number;
  useMock: boolean;
}

export function loadConfig(): ServerConfig {
  return {
    host: process.env['DP_INSPECTOR_HOST'] ?? '0.0.0.0',
    port: parseInt(process.env['DP_INSPECTOR_PORT'] ?? '4712', 10),
    useMock: process.env['DP_INSPECTOR_USE_MOCK'] === 'true',
  };
}
