import { createLawClient, type LawTransport } from './law/client.js';
import { createLawTools } from './law/tools.js';
import { createOfficialSourceReader, type OfficialSourceFetcher } from './official-sources.js';
import { createServer } from 'node:http';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { hostHeaderValidation, originValidation, toNodeHandler } from '@modelcontextprotocol/node';
import { createMcpServer, type ResearchRunner } from './mcp.js';

export function createHttpServer(options: { allowedHosts?: string[]; allowedOrigins?: string[]; research?: ResearchRunner; sourceFetcher?: OfficialSourceFetcher; enableLawApi?: boolean; lawOc?: string; lawTransport?: LawTransport } = {}) {
  // SDK default legacy stateless support deliberately retained for older clients.
  const readSource = createOfficialSourceReader(options.sourceFetcher);
  const enableLawApi = options.enableLawApi ?? process.env.ENABLE_LAW_API === 'true';
  const lawTools = enableLawApi ? createLawTools(createLawClient({ oc: options.lawOc ?? process.env.LAW_API_OC, transport: options.lawTransport })) : undefined;
  const handler = createMcpHandler(() => createMcpServer({ research: options.research, readSource, enableLawApi, lawTools }));
  const handleMcp = toNodeHandler(handler);
  const local = ['localhost', '127.0.0.1', '[::1]'];
  const validateHost = hostHeaderValidation(options.allowedHosts ?? local);
  const validateOrigin = originValidation(options.allowedOrigins ?? local);
  const server = createServer((req, res) => {
    if (!validateHost(req, res) || !validateOrigin(req, res)) return;
    if (req.url?.split('?')[0] !== '/mcp') {
      res.writeHead(404).end();
      return;
    }
    void handleMcp(req, res).catch(() => {
      // Do not expose request bodies, headers, or internal errors.
      if (!res.headersSent) res.writeHead(500);
      res.end();
    });
  });
  server.on('close', () => { void handler.close(); });
  return server;
}
