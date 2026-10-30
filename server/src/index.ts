import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import type { IncomingMessage, ServerResponse } from "node:http";
import { WebSocket, WebSocketServer, type RawData } from "ws";
import { config } from "./config";
import { RoomManager } from "./rooms";
import { serveStatic } from "./static";

const roomManager = new RoomManager();
const wss = new WebSocketServer({ noServer: true });

type QueuedMessage = { data: RawData; isBinary: boolean };

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function readJsonBody(req: IncomingMessage, limit = 64 * 1024): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error("Payload too large"));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf-8");
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

async function handleApiRequest(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL
): Promise<boolean> {
  if (req.method === "GET" && (url.pathname === "/api/health" || url.pathname === "/healthz")) {
    sendJson(res, 200, {
      status: "ok",
      rooms: roomManager.getRoomCount(),
      maxRooms: config.maxRooms,
    });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/rooms") {
    sendJson(res, 200, roomManager.listRooms());
    return true;
  }

  if (
    req.method === "POST" &&
    (url.pathname === "/api/rooms" || url.pathname === "/api/rooms/create")
  ) {
    try {
      const body = (await readJsonBody(req)) as { name?: string };
      const room = await roomManager.createRoom(body?.name);
      sendJson(res, 200, room);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Internal error";
      const status = message === "Payload too large" ? 413 : 500;
      sendJson(res, status, { error: message });
    }
    return true;
  }

  return false;
}

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (url.pathname.startsWith("/api/") || url.pathname === "/healthz") {
    const handled = await handleApiRequest(req, res, url);
    if (handled) return;
  }
  serveStatic(req, res, url.pathname);
}

function bridgeClient(client: WebSocket, roomId: string): void {
  const room = roomManager.getRoom(roomId);
  if (!room) {
    client.close(4004, "Комната не найдена");
    return;
  }

  room.clients.add(client);
  const queue: QueuedMessage[] = [];
  let closed = false;

  const targetUrl = `ws://127.0.0.1:${room.port}`;
  const upstream = new WebSocket(targetUrl);

  const closeBoth = (code = 1000, reason = "") => {
    if (closed) return;
    closed = true;
    room.clients.delete(client);
    room.lastEmptyAt = Date.now();
    try {
      if (client.readyState === WebSocket.OPEN || client.readyState === WebSocket.CONNECTING) {
        client.close(code, reason);
      }
    } catch {}
    try {
      if (upstream.readyState === WebSocket.OPEN || upstream.readyState === WebSocket.CONNECTING) {
        upstream.close(code, reason);
      }
    } catch {}
  };

  client.on("message", (data: RawData, isBinary: boolean) => {
    if (closed) return;
    if (upstream.readyState === WebSocket.OPEN) {
      upstream.send(data, { binary: isBinary });
    } else {
      queue.push({ data, isBinary });
    }
  });

  upstream.on("open", () => {
    if (closed) return;
    while (queue.length > 0) {
      const item = queue.shift();
      if (item && upstream.readyState === WebSocket.OPEN) {
        upstream.send(item.data, { binary: item.isBinary });
      }
    }
  });

  upstream.on("message", (data: RawData, isBinary: boolean) => {
    if (closed) return;
    if (client.readyState === WebSocket.OPEN) {
      client.send(data, { binary: isBinary });
    }
  });

  upstream.on("close", (code, reason) => {
    closeBoth(code === 1005 ? 1000 : code, reason.toString());
  });

  upstream.on("error", () => {
    closeBoth(1011, "Ошибка серверной комнаты");
  });

  client.on("close", () => closeBoth(1000, ""));
  client.on("error", () => closeBoth(1011, ""));
}

const server =
  config.sslCert && config.sslKey
    ? https.createServer(
        {
          cert: fs.readFileSync(config.sslCert),
          key: fs.readFileSync(config.sslKey),
        },
        (req, res) => void handleRequest(req, res)
      )
    : http.createServer((req, res) => void handleRequest(req, res));

server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  const match = /^\/ws\/room\/([a-zA-Z0-9_-]+)$/.exec(url.pathname);
  const roomId = match ? match[1] : url.searchParams.get("room") ?? "";
  if (!roomId || !roomManager.getRoom(roomId)) {
    socket.write("HTTP/1.1 404 Not Found

");
    socket.destroy();
    return;
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    bridgeClient(ws, roomId);
  });
});

server.listen(config.port, config.host, () => {
  console.log(`Frog Arena gateway listening on http://${config.host}:${config.port}`);
});
