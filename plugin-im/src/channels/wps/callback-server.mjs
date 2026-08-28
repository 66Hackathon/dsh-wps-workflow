import { createServer } from 'node:http';

import {
  challengeResponse,
  decryptEventData,
  eventAckResponse,
  parseCallbackBody,
  verifyEventSignature,
} from './event-crypto.mjs';

function readJsonBody(request, { maxBytes = 1_048_576 } = {}) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error('WPS callback body is too large'));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => {
      try {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve(text ? JSON.parse(text) : {});
      } catch (error) {
        reject(error);
      }
    });
    request.on('error', reject);
  });
}

/**
 * Minimal HTTP server for WPS event subscription callbacks.
 */
export function createWpsCallbackServer({
  appId,
  appSecret,
  path = '/wps/events',
  onEvent,
  logger = console,
}) {
  if (!appId || !appSecret) throw new TypeError('WPS callback server requires app credentials');
  if (typeof onEvent !== 'function') throw new TypeError('WPS callback server requires onEvent');

  const server = createServer(async (request, response) => {
    try {
      if (request.method !== 'POST' || request.url !== path) {
        response.writeHead(404);
        response.end();
        return;
      }
      const body = await readJsonBody(request);
      const parsed = parseCallbackBody(body);
      if (parsed.kind === 'challenge') {
        response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
        response.end(JSON.stringify(challengeResponse(parsed.challenge)));
        return;
      }
      if (!verifyEventSignature(parsed.event, { appId, appSecret })) {
        response.writeHead(400, { 'content-type': 'application/json; charset=utf-8' });
        response.end(JSON.stringify({ code: 'signature-check-failed' }));
        return;
      }
      response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify(eventAckResponse()));
      const plain = decryptEventData(parsed.event.encrypted_data, {
        appSecret,
        nonce: parsed.event.nonce,
      });
      queueMicrotask(() => {
        onEvent({
          topic: parsed.event.topic,
          operation: parsed.event.operation,
          plain,
          frame: parsed.event,
        }).catch((error) => {
          logger.error?.('[dsh-wps] callback event handler failed:', error);
        });
      });
    } catch (error) {
      logger.error?.('[dsh-wps] callback request failed:', error);
      if (!response.headersSent) {
        response.writeHead(400, { 'content-type': 'application/json; charset=utf-8' });
        response.end(JSON.stringify({ code: 'bad-request' }));
      }
    }
  });

  return {
    server,
    async listen(host = '127.0.0.1', port = 0) {
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, host, resolve);
      });
      const address = server.address();
      return {
        host: address.address,
        port: address.port,
        path,
        url: `http://${address.address}:${address.port}${path}`,
      };
    },
    async close() {
      await new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}
