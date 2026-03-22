/**
 * Simple timestamped console logger.
 */

type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

function log(level: LogLevel, component: string, message: string, error?: Error): void {
  const ts = new Date().toISOString();
  const line = `[${ts}] [${level.padEnd(5)}] [${component}] ${message}`;
  if (level === 'ERROR') {
    console.error(line);
    if (error) console.error(error.stack ?? error.message);
  } else if (level === 'WARN') {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export const logger = {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  debug: (_component: string, _message: string) => { /* no-op: debug logging disabled */ },
  info:  (component: string, message: string) => log('INFO',  component, message),
  warn:  (component: string, message: string) => log('WARN',  component, message),
  error: (component: string, message: string, err?: Error) => log('ERROR', component, message, err),
};
