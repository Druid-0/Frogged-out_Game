import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { IncomingMessage, ServerResponse, Server } from "node:http";
import { WebSocketServer, WebSocket, type RawData } from "ws";

interface RoomParticipant {
  peerId: number;
  nickname: string;
  colorIndex: number;
  modelVariant: number;
  teamId: number;
  isBot: boolean;
}

interface GatewayRoom {
  id: string;
  name: string;
  createdAt: number;
  lastEmptyAt: number;
  state: string;
  hostPeerId: number;
  mapVariant: string;
  nextMapSelectionMode: string;
  mapVotes: Record<string, string>;
  clients: Map<WebSocket, RoomParticipant>;
}

const ASSET_MIME: Record<string, string> = {
  ".obj": "text/plain; charset=utf-8",
  ".mtl": "text/plain; charset=utf-8",
  ".png": "image/png",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
};

function createGatewayPlugin(): Plugin {
  const rooms = new Map<string, GatewayRoom>();
  const wss = new WebSocketServer({ noServer: true });
  let nextPeerCounter = 2;

  function sendJson(res: ServerResponse, status: number, payload: unknown) {
    const body = JSON.stringify(payload);
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Length": Buffer.byteLength(body),
      "Cache-Control": "no-store",
    });
    res.end(body);
  }

  function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
    return new Promise((resolve) => {
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => chunks.push(c));
      req.on("end", () => {
        try {
          const raw = Buffer.concat(chunks).toString("utf-8");
          resolve(raw ? JSON.parse(raw) : {});
        } catch {
          resolve({});
        }
      });
      req.on("error", () => resolve({}));
    });
  }

  function broadcastToRoom(room: GatewayRoom, payload: unknown, exclude?: WebSocket) {
    const msg = JSON.stringify(payload);
    for (const [client] of room.clients.entries()) {
      if (client !== exclude && client.readyState === WebSocket.OPEN) {
        client.send(msg);
      }
    }
  }

  function buildRoomSnapshot(room: GatewayRoom) {
    const onlinePlayers = Array.from(room.clients.values());
    return {
      type: "room_state",
      roomId: room.id,
      roomName: room.name,
      state: room.state,
      hostPeerId: room.hostPeerId,
      mapVariant: room.mapVariant,
      nextMapSelectionMode: room.nextMapSelectionMode,
      mapVotes: room.mapVotes,
      votes: room.mapVotes,
      onlinePlayers,
      participants: onlinePlayers,
      playersCount: onlinePlayers.length,
    };
  }

  function tryServeGodotAsset(urlPath: string, res: ServerResponse): boolean {
    const decoded = decodeURIComponent(urlPath);
    let relPath = "";
    if (decoded.startsWith("/assets/models/")) {
      relPath = path.join("frog_arena_25d_godot4", decoded);
    } else if (decoded.startsWith("/media/frog-sounds/")) {
      relPath = path.join("frog_arena_25d_godot4", decoded);
    } else if (decoded.startsWith("/frog_arena_25d_godot4/assets/models/") || decoded.startsWith("/frog_arena_25d_godot4/media/frog-sounds/")) {
      relPath = decoded.slice(1);
    }
    if (!relPath) return false;

    const fullPath = path.resolve(process.cwd(), relPath);
    if (!fullPath.startsWith(path.resolve(process.cwd(), "frog_arena_25d_godot4"))) {
      return false;
    }
    if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
      return false;
    }

    const ext = path.extname(fullPath).toLowerCase();
    const mime = ASSET_MIME[ext] || "application/octet-stream";
    const stat = fs.statSync(fullPath);
    res.writeHead(200, {
      "Content-Type": mime,
      "Content-Length": stat.size,
      "Cache-Control": "public, max-age=3600",
    });
    fs.createReadStream(fullPath).pipe(res);
    return true;
  }

  function attachGateway(
    middlewares: {
      use: (fn: (req: IncomingMessage, res: ServerResponse, next: () => void) => void) => void;
    },
    httpServer: import("node:http").Server | null
  ) {
    middlewares.use(async (req, res, next) => {
      const url = new URL(req.url ?? "/", "http://localhost");

      if (req.method === "GET" && tryServeGodotAsset(url.pathname, res)) {
        return;
      }

      if (req.method === "GET" && (url.pathname === "/api/health" || url.pathname === "/healthz")) {
        sendJson(res, 200, {
          status: "ok",
          rooms: rooms.size,
          maxRooms: 16,
        });
        return;
      }

      if (req.method === "GET" && url.pathname === "/api/rooms") {
        const now = Date.now();
        for (const [id, r] of rooms.entries()) {
          if (r.clients.size === 0 && now - r.lastEmptyAt > 10_000) {
            rooms.delete(id);
          }
        }
        const list = Array.from(rooms.values()).map((r) => ({
          id: r.id,
          name: r.name,
          players: r.clients.size,
          max: 8,
          state: r.state,
          mapVariant: r.mapVariant,
        }));
        sendJson(res, 200, list);
        return;
      }

      if (
        req.method === "POST" &&
        (url.pathname === "/api/rooms" || url.pathname === "/api/rooms/create")
      ) {
        const body = await readJsonBody(req);
        const id = crypto.randomBytes(3).toString("hex");
        const rawName = typeof body.name === "string" ? body.name.trim() : "";
        const name = rawName || `Кочка #${id}`;
        const mapVariant = typeof body.mapVariant === "string" ? body.mapVariant : "wild_swamp";
        const room: GatewayRoom = {
          id,
          name,
          createdAt: Date.now(),
          lastEmptyAt: Date.now(),
          state: "Ожидание",
          hostPeerId: 1,
          mapVariant,
          nextMapSelectionMode: "players_vote",
          mapVotes: {},
          clients: new Map(),
        };
        rooms.set(id, room);
        sendJson(res, 200, {
          id: room.id,
          name: room.name,
          players: 1,
          max: 8,
          state: room.state,
          mapVariant: room.mapVariant,
        });
        return;
      }

      next();
    });

    if (httpServer) {
      httpServer.on("upgrade", (req, socket, head) => {
        const url = new URL(req.url ?? "/", "http://localhost");
        const match = /^\/ws\/room\/([a-zA-Z0-9_-]+)$/.exec(url.pathname);
        if (!match) return;
        const roomId = match[1];
        let room = rooms.get(roomId);
        if (!room) {
          room = {
            id: roomId,
            name: `Болото #${roomId}`,
            createdAt: Date.now(),
            lastEmptyAt: Date.now(),
            state: "Ожидание",
            hostPeerId: 1,
            mapVariant: "wild_swamp",
            nextMapSelectionMode: "players_vote",
            mapVotes: {},
            clients: new Map(),
          };
          rooms.set(roomId, room);
        }

        wss.handleUpgrade(req, socket, head, (ws) => {
          const assignedPeerId = room!.clients.size === 0 ? 1 : nextPeerCounter++;
          const defaultParticipant: RoomParticipant = {
            peerId: assignedPeerId,
            nickname: `Квакер #${assignedPeerId}`,
            colorIndex: (assignedPeerId - 1) % 8,
            modelVariant: (assignedPeerId - 1) % 3,
            teamId: -1,
            isBot: false,
          };
          room!.clients.set(ws, defaultParticipant);

          ws.send(
            JSON.stringify({
              type: "welcome",
              peerId: assignedPeerId,
              roomId: room!.id,
              roomName: room!.name,
              players: room!.clients.size,
              snapshot: buildRoomSnapshot(room!),
            })
          );
          broadcastToRoom(room!, buildRoomSnapshot(room!));

          ws.on("message", (data: RawData, isBinary: boolean) => {
            if (!isBinary) {
              try {
                const parsed = JSON.parse(String(data));
                if (parsed.type === "hello_player" || parsed.type === "join_room") {
                  const current = room!.clients.get(ws);
                  if (current) {
                    current.nickname = String(parsed.nickname || current.nickname).slice(0, 20);
                    current.colorIndex = Number(parsed.colorIndex ?? current.colorIndex);
                    current.modelVariant = Number(parsed.modelVariant ?? current.modelVariant);
                    current.teamId = Number(parsed.teamId ?? current.teamId);
                    room!.clients.set(ws, current);
                  }
                  broadcastToRoom(room!, buildRoomSnapshot(room!));
                  return;
                }
                if (parsed.type === "cast_map_vote" && typeof parsed.mapVariant === "string") {
                  const voterKey = String(parsed.peerId || assignedPeerId);
                  room!.mapVotes[voterKey] = parsed.mapVariant;
                  broadcastToRoom(room!, {
                    type: "map_votes_updated",
                    mapVotes: room!.mapVotes,
                    votes: room!.mapVotes,
                  });
                  return;
                }
                if (parsed.type === "select_next_map" && typeof parsed.mapVariant === "string") {
                  room!.mapVariant = parsed.mapVariant;
                  room!.mapVotes = {};
                  broadcastToRoom(room!, {
                    type: "next_map_selected",
                    mapVariant: room!.mapVariant,
                  });
                  return;
                }
                if (parsed.type === "start_match") {
                  room!.state = "В бою";
                  if (typeof parsed.mapVariant === "string") {
                    room!.mapVariant = parsed.mapVariant;
                  }
                  room!.mapVotes = {};
                  broadcastToRoom(room!, {
                    type: "start_match",
                    mapVariant: room!.mapVariant,
                    hostSettings: parsed.hostSettings,
                    matchMode: parsed.matchMode,
                    participants: parsed.participants,
                    matchSeed: parsed.matchSeed,
                  });
                  return;
                }
              } catch {
                // Relay raw message below
              }
            }

            for (const [peer] of room!.clients.entries()) {
              if (peer !== ws && peer.readyState === WebSocket.OPEN) {
                peer.send(data, { binary: isBinary });
              }
            }
          });

          const cleanup = () => {
            room!.clients.delete(ws);
            room!.lastEmptyAt = Date.now();
            if (room!.clients.size === 0) {
              rooms.delete(room!.id);
            } else {
              broadcastToRoom(room!, buildRoomSnapshot(room!));
            }
          };
          ws.on("close", cleanup);
          ws.on("error", cleanup);
        });
      });
    }
  }

  return {
    name: "frog-arena-gateway",
    configureServer(server) {
      attachGateway(server.middlewares, server.httpServer as unknown as Server | null);
    },
    configurePreviewServer(server) {
      attachGateway(server.middlewares, server.httpServer as unknown as Server | null);
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), createGatewayPlugin()],
  server: {
    host: "0.0.0.0",
    port: 3000,
    allowedHosts: true,
  },
});
