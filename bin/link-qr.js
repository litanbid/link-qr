#!/usr/bin/env node
import { createLinkQrServer } from '../src/server.js';

const [, , command, ...args] = process.argv;
if (command === '--help' || command === '-h' || !command) {
  console.log('Usage: link-qr serve\nEnvironment: HOST (127.0.0.1), PORT (3000)');
} else if (command !== 'serve' || args.length > 0) {
  console.error('Usage: link-qr serve');
  process.exitCode = 1;
} else {
  const host = process.env.HOST ?? '127.0.0.1';
  const port = Number(process.env.PORT ?? '3000');
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535) {
    console.error('HOST must be set and PORT must be an integer from 1 to 65535.');
    process.exitCode = 1;
  } else {
    const server = createLinkQrServer();
    server.once('error', (error) => {
      console.error('LinkQR could not start:', error.code ?? 'UNKNOWN');
      process.exitCode = 1;
    });
    server.listen(port, host, () => console.log('LinkQR listening on port %d', port));
    for (const signal of ['SIGINT', 'SIGTERM']) {
      process.once(signal, () => server.close());
    }
  }
}
