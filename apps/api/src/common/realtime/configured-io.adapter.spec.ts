import { createServer, get, type Server as HttpServer } from 'node:http';
import { type AddressInfo } from 'node:net';

import { afterEach, describe, expect, it } from '@jest/globals';
import { type Server } from 'socket.io';

import { ConfiguredIoAdapter } from './configured-io.adapter';

const ALLOWED = 'https://web.example';

/** The CORS headers on the first long-polling handshake from `origin`. */
function handshake(
  port: number,
  origin: string,
): Promise<{
  allowOrigin: string | undefined;
  allowCredentials: string | undefined;
}> {
  return new Promise((resolve, reject) => {
    get(
      {
        port,
        path: '/socket.io/?EIO=4&transport=polling',
        headers: { Origin: origin },
      },
      (response) => {
        response.resume();
        resolve({
          allowOrigin: response.headers['access-control-allow-origin'],
          allowCredentials:
            response.headers['access-control-allow-credentials'],
        });
      },
    ).on('error', reject);
  });
}

describe('ConfiguredIoAdapter', () => {
  let http: HttpServer | undefined;
  let io: Server | undefined;

  /* Closing the Socket.IO server also closes the HTTP server it is
     attached to, and ends the polling session each handshake opened. */
  afterEach(async () => {
    await io?.close();
    io = undefined;
  });

  async function listen(): Promise<number> {
    http = createServer();
    /* Port 0 plus an HTTP server is the path Nest takes when a gateway
       shares the application's server, which is how this app runs. */
    const adapter = new ConfiguredIoAdapter(http, [ALLOWED]);
    io = adapter.createIOServer(0, { cors: { credentials: true } });
    await new Promise<void>((resolve) => http?.listen(0, resolve));
    return (http.address() as AddressInfo).port;
  }

  it('echoes an allowed origin, which a credentialed request requires', async () => {
    const port = await listen();

    await expect(handshake(port, ALLOWED)).resolves.toEqual({
      allowOrigin: ALLOWED,
      allowCredentials: 'true',
    });
  });

  it('never answers with a wildcard, which browsers reject with credentials', async () => {
    const port = await listen();

    const { allowOrigin } = await handshake(port, 'https://evil.example');

    expect(allowOrigin).not.toBe('*');
    expect(allowOrigin).not.toBe('https://evil.example');
  });
});
