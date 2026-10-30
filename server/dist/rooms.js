"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RoomManager = void 0;
const node_child_process_1 = require("node:child_process");
const node_crypto_1 = __importDefault(require("node:crypto"));
const node_fs_1 = __importDefault(require("node:fs"));
const node_net_1 = __importDefault(require("node:net"));
const config_1 = require("./config");
function makeRoomId() {
    return node_crypto_1.default.randomBytes(3).toString("hex");
}
async function isPortFree(port) {
    return new Promise((resolve) => {
        const probe = node_net_1.default.createServer();
        probe.once("error", () => resolve(false));
        probe.once("listening", () => {
            probe.close(() => resolve(true));
        });
        probe.listen(port, "127.0.0.1");
    });
}
async function findFreePort(start) {
    for (let port = start; port < start + 400; port += 1) {
        if (await isPortFree(port))
            return port;
    }
    throw new Error("Не удалось найти свободный порт для комнаты");
}
class RoomManager {
    rooms = new Map();
    constructor() {
        setInterval(() => this.cleanupIdleRooms(), 10_000).unref();
    }
    getRoomCount() {
        return this.rooms.size;
    }
    getRoom(id) {
        return this.rooms.get(id);
    }
    listRooms() {
        const result = [];
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
    async createRoom(name) {
        if (this.rooms.size >= config_1.config.maxRooms) {
            throw new Error("Достигнут лимит комнат");
        }
        const port = await findFreePort(config_1.config.roomBasePort);
        const id = makeRoomId();
        const roomName = name?.trim() || `Комната ${id}`;
        const args = ["--headless"];
        if (config_1.config.godotProject) {
            args.push("--path", config_1.config.godotProject);
        }
        args.push("--", "--server", `--port=${port}`, `--room=${id}`);
        let child = null;
        if (node_fs_1.default.existsSync(config_1.config.godotServerBin)) {
            child = (0, node_child_process_1.spawn)(config_1.config.godotServerBin, args, {
                stdio: ["ignore", "pipe", "pipe"],
            });
        }
        const room = {
            id,
            name: roomName,
            port,
            createdAt: Date.now(),
            lastEmptyAt: Date.now(),
            child,
            clients: new Set(),
        };
        if (child) {
            child.stdout?.on("data", (data) => {
                console.log(`[room ${id}:${port}] ${data.toString().trim()}`);
            });
            child.stderr?.on("data", (data) => {
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
    destroyRoom(id) {
        const room = this.rooms.get(id);
        if (!room)
            return;
        this.rooms.delete(id);
        if (room.child && !room.child.killed) {
            try {
                room.child.kill("SIGTERM");
            }
            catch { }
        }
    }
    cleanupIdleRooms() {
        const now = Date.now();
        for (const [id, room] of this.rooms.entries()) {
            if (room.clients.size > 0) {
                room.lastEmptyAt = now;
                continue;
            }
            if (now - room.lastEmptyAt > config_1.config.roomIdleMs ||
                now - room.createdAt > config_1.config.roomMaxLifetimeMs) {
                this.destroyRoom(id);
            }
        }
    }
    shutdown() {
        for (const id of Array.from(this.rooms.keys())) {
            this.destroyRoom(id);
        }
    }
}
exports.RoomManager = RoomManager;
