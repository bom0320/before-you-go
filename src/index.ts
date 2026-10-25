import { createHttpServer } from './http.js';

const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
const list = (value: string | undefined) => value?.split(',').map(s => s.trim()).filter(Boolean);
const server = createHttpServer({
  allowedHosts: list(process.env.ALLOWED_HOSTS),
  allowedOrigins: list(process.env.ALLOWED_ORIGINS),
});
server.listen(port, '127.0.0.1', () => console.log(`before-you-go MCP: http://127.0.0.1:${port}/mcp`));
server.on('error', () => { console.error('HTTP server failed to start'); process.exitCode = 1; });
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    server.close();
    server.closeAllConnections();
  });
}
