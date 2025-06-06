import express from 'express';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { createInteractiveServer } from '../createServer.js';

const app = express();
app.use(express.json());

const transports: Record<string, SSEServerTransport> = {};

app.get('/mcp', async (req, res) => {
  try {
    const transport = new SSEServerTransport('/messages', res);
    const sessionId = transport.sessionId;
    transports[sessionId] = transport;
    transport.onclose = () => {
      delete transports[sessionId];
    };
    const server = createInteractiveServer();
    await server.connect(transport);
  } catch (error) {
    if (!res.headersSent) {
      res.status(500).send('Error establishing SSE stream');
    }
  }
});

app.post('/messages', async (req, res) => {
  const sessionId = req.query.sessionId as string;
  if (!sessionId || !transports[sessionId]) {
    res.status(404).send('Session not found');
    return;
  }
  try {
    await transports[sessionId].handlePostMessage(req, res, req.body);
  } catch (error) {
    if (!res.headersSent) {
      res.status(500).send('Error handling request');
    }
  }
});

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
app.listen(PORT, () => {
  console.log(`SSE server listening on port ${PORT}`);
});
