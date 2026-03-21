import { loadConfig } from './config';
import { MockDpAdapter, WinCCOaDpAdapter } from './dpAdapter';
import { startServer } from './server';
import { logger } from './logger';

const config = loadConfig();

logger.info('Main', '═══════════════════════════════════════════════');
logger.info('Main', '  WinCC OA DP Inspector Server — Starting');
logger.info('Main', '═══════════════════════════════════════════════');
logger.info('Main', `Host : ${config.host}`);
logger.info('Main', `Port : ${config.port}`);
logger.info('Main', `Mode : ${config.useMock ? 'MOCK (simulated data)' : 'WinCC OA runtime'}`);

const adapter = config.useMock ? new MockDpAdapter() : new WinCCOaDpAdapter();

startServer(config.host, config.port, adapter);

// Graceful shutdown
process.on('SIGINT', () => {
  logger.info('Main', 'Received SIGINT — shutting down');
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Main', 'Received SIGTERM — shutting down');
  process.exit(0);
});
