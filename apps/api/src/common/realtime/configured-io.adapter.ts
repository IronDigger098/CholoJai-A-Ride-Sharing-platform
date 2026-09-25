import { type Server as HttpServer } from 'node:http';

import { type INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { type Server, type ServerOptions } from 'socket.io';

/**
 * Socket.IO with the same origin allow-list as the HTTP API.
 *
 * The gateways used to declare `cors: { credentials: true }` and nothing
 * else. With no `origin`, Socket.IO answers every polling request with
 * `Access-Control-Allow-Origin: *` — and a browser refuses a credentialed
 * response carrying a wildcard. The client connects with credentials, so
 * the very first long-polling handshake failed and the socket never reached
 * the WebSocket upgrade. Locally that is `:3000` talking to `:4000`, which
 * is already cross-origin; in production the web app and the API are on
 * different sites entirely.
 *
 * The allow-list cannot live in the `@WebSocketGateway` decorator, because
 * decorator arguments are evaluated at import time, before the validated
 * configuration exists. An adapter is constructed in `main.ts` after it
 * does, and every gateway's server is created through it — so there is one
 * place that decides who may connect, and it reads the same list as
 * `enableCors`.
 */
export class ConfiguredIoAdapter extends IoAdapter {
  public constructor(
    /* The application in `main.ts`; a bare HTTP server in the spec. The
       base adapter accepts either and attaches to the server it finds. */
    appOrHttpServer: INestApplicationContext | HttpServer,
    private readonly allowedOrigins: readonly string[],
  ) {
    super(appOrHttpServer);
  }

  public override createIOServer(
    port: number,
    options?: Partial<ServerOptions>,
  ): Server {
    return super.createIOServer(port, {
      ...options,
      cors: { origin: [...this.allowedOrigins], credentials: true },
    }) as Server;
  }
}
