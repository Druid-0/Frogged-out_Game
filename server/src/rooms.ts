import { spawn, type ChildProcessByStdio } from "node:child_process";
import type { Readable } from "node:stream";
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import type WebSocket from "ws";
import { config } from "./config";

export interface RoomInfo {
  id: string;
  name: string;
  players: number;
  max: number;
  state: string;
}

export interface Room {
  id: string;
  name: string;
  port: number;
  createdAt: number;
  lastEmptyAt: number;
  child: ChildProcessByStdio<null, Readable, Readable> | null;
  clients: Set<WebSocket>;
}

function makeRoomId(): string {
  return crypto.randomBytes(3).toString("hex");
}

async function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once("error", () => resolve(false));
    probe.once("listening", () => {
      probe.close(() => resolve(true));
    });
    probe.listen(port, "127.0.0.1");
  });
}

async function findFreePort(start: number): Promise<number> {
  for (let port = start; port < start + 400; port += 1) {
    if (await isPortFree(port)) return port;
  }
  throw new Error("Не удалось найти свободный порт для комнаты");
}

export class RoomManager {
  private rooms = new Map<string, Room>();

  constructor() {
    setInterval(() => this.cleanupIdleRooms(), 10_000).unref();
  }

  getRoomCount(): number {
    return this.rooms.size;
  }

  getRoom(id: string): Room | undefined {
    return this.rooms.get(id);
  }

  listRooms(): RoomInfo[] {
    const result: RoomInfo[] = [];
    for (const room of this.rooms.values()) {
      result.push({
        id: room.id,
        name: room.name,
        players: room.clients.size,
        max: 8,
        state: "Ожидание",
      });
    }
    return result;
  }

  async createRoom(name?: string): Promise<RoomInfo> {
    if (this.rooms.size >= config.maxRooms) {
      throw new Error("Достигнут лимит комнат");
    }

    const port = await findFreePort(config.roomBasePort);
    const id = makeRoomId();
    const roomName = name?.trim() || `Комната ${id}`;

    const args: string[] = ["--headless"];
    if (config.godotProject) {
      args.push("--path", config.godotProject);
    }
    args.push("--", "--server", `--port=${port}`, `--room=${id}`);

    let child: ChildProcessByStdio<null, Readable, Readable> | null = null;
    if (fs.existsSync(config.godotServerBin)) {
      child = spawn(config.godotServerBin, args, {
        stdio: ["ignore", "pipe", "pipe"],
      });
    }

    const room: Room = {
      id,
      name: roomName,
      port,
      createdAt: Date.now(),
      lastEmptyAt: Date.now(),
      child,
      clients: new Set(),
    };

    if (child) {
      child.stdout?.on("data", (data: Buffer) => {
        console.log(`[room ${id}:${port}] ${data.toString().trim()}`);
      });
      child.stderr?.on("data", (data: Buffer) => {
        console.error(`[room ${id}:${port} err] ${data.toString().trim()}`);
      });
      child.on("exit", (code) => {
        console.log(`[room ${id}] exited with code ${code}`);
        this.destroyRoom(id);
      });
    }

    this.rooms.set(id, room);

    return {
      id: room.id,
      name: room.name,
      players: 0,
      max: 8,
      state: "Ожидание",
    };
  }

  destroyRoom(id: string): void {
    const room = this.rooms.get(id);
    if (!room) return;
    this.rooms.delete(id);
    if (room.child && !room.child.killed) {
      try {
        room.child.kill("SIGTERM");
      } catch {}
    }
  }

  private cleanupIdleRooms(): void {
    const now = Date.now();
    for (const [id, room] of this.rooms.entries()) {
      if (room.clients.size > 0) {
        room.lastEmptyAt = now;
        continue;
      }
      if (
        now - room.lastEmptyAt > config.roomIdleMs ||
        now - room.createdAt > config.roomMaxLifetimeMs
      ) {
        this.destroyRoom(id);
      }
    }
  }

  shutdown(): void {
    for (const id of Array.from(this.rooms.keys())) {
      this.destroyRoom(id);
    }
  }
}
