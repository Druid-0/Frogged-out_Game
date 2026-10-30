import path from "node:path";

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const root = path.resolve(__dirname, "..", "..");
const distDir = path.join(root, "dist");

export const config = {
  port: envNumber("PORT", 3000),
  host: process.env.HOST ?? "0.0.0.0",
  webDir: process.env.WEB_DIR ?? process.env.STATIC_DIR ?? distDir,
  godotServerBin:
    process.env.GODOT_SERVER_BIN ??
    process.env.GODOT_BIN ??
    path.join(root, "build", "server", "frog_server"),
  godotProject: process.env.GODOT_SERVER_PROJECT ?? "",
  maxRooms: envNumber("MAX_ROOMS", 16),
  roomIdleMs: envNumber("ROOM_IDLE_MS", envNumber("ROOM_IDLE_TIMEOUT_MS", 300_000)),
  roomMaxLifetimeMs: envNumber("ROOM_MAX_LIFETIME_MS", 6 * 60 * 60_000),
  roomBasePort: envNumber("ROOM_BASE_PORT", envNumber("GODOT_SERVER_PORT_START", 9100)),
  roomReadyTimeoutMs: envNumber("ROOM_READY_TIMEOUT_MS", 15_000),
  sslCert: process.env.SSL_CERT ?? "",
  sslKey: process.env.SSL_KEY ?? "",
};
