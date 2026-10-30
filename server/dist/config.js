"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
const node_path_1 = __importDefault(require("node:path"));
function envNumber(name, fallback) {
    const raw = process.env[name];
    if (!raw)
        return fallback;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : fallback;
}
const root = node_path_1.default.resolve(__dirname, "..", "..");
exports.config = {
    port: envNumber("PORT", 8080),
    host: process.env.HOST ?? "0.0.0.0",
    webDir: process.env.WEB_DIR ?? process.env.STATIC_DIR ?? node_path_1.default.join(root, "web"),
    godotServerBin: process.env.GODOT_SERVER_BIN ??
        process.env.GODOT_BIN ??
        node_path_1.default.join(root, "build", "server", "frog_server"),
    godotProject: process.env.GODOT_SERVER_PROJECT ?? "",
    maxRooms: envNumber("MAX_ROOMS", 16),
    roomIdleMs: envNumber("ROOM_IDLE_MS", envNumber("ROOM_IDLE_TIMEOUT_MS", 300_000)),
    roomMaxLifetimeMs: envNumber("ROOM_MAX_LIFETIME_MS", 6 * 60 * 60_000),
    roomBasePort: envNumber("ROOM_BASE_PORT", envNumber("GODOT_SERVER_PORT_START", 9100)),
    roomReadyTimeoutMs: envNumber("ROOM_READY_TIMEOUT_MS", 15_000),
    sslCert: process.env.SSL_CERT ?? "",
    sslKey: process.env.SSL_KEY ?? "",
};
