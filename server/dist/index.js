"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_fs_1 = __importDefault(require("node:fs"));
const node_http_1 = __importDefault(require("node:http"));
const node_https_1 = __importDefault(require("node:https"));
const ws_1 = require("ws");
const config_1 = require("./config");
const rooms_1 = require("./rooms");
const static_1 = require("./static");
const roomManager = new rooms_1.RoomManager();
const wss = new ws_1.WebSocketServer({ noServer: true });
function sendJson(res, status, payload) {
    const body = JSON.stringify(payload);
    res.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Length": Buffer.byteLength(body),
        "Cache-Control": "no-store",
    });
    res.end(body);
}
function readJsonBody(req, limit = 64 * 1024) {
    return new Promise((resolve, reject) => {
        let size = 0;
        const chunks = [];
        req.on("data", (chunk) => {
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
            }
            catch (error) {
                reject(error);
            }
        });
        req.on("error", reject);
    });
}
async function handleApiRequest(req, res, url) {
    if (req.method === "GET" && (url.pathname === "/api/health" || url.pathname === "/healthz")) {
        sendJson(res, 200, {
            status: "ok",
            rooms: roomManager.getRoomCount(),
            maxRooms: config_1.config.maxRooms,
        });
        return true;
    }
    if (req.method === "GET" && url.pathname === "/api/rooms") {
        sendJson(res, 200, roomManager.listRooms());
        return true;
    }
    if (req.method === "POST" &&
        (url.pathname === "/api/rooms" || url.pathname === "/api/rooms/create")) {
        try {
            const body = (await readJsonBody(req));
            const room = await roomManager.createRoom(body?.name);
            sendJson(res, 200, room);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "Internal error";
            const status = message === "Payload too large" ? 413 : 500;
            sendJson(res, status, { error: message });
        }
        return true;
    }
    return false;
}
async function handleRequest(req, res) {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname.startsWith("/api/") || url.pathname === "/healthz") {
        const handled = await handleApiRequest(req, res, url);
        if (handled)
            return;
    }
    (0, static_1.serveStatic)(req, res, url.pathname);
}
function bridgeClient(client, roomId) {
    const room = roomManager.getRoom(roomId);
    if (!room) {
        client.close(4004, "Комната не найдена");
        return;
    }
    room.clients.add(client);
    const queue = [];
    let closed = false;
    const targetUrl = `ws://127.0.0.1:${room.port}`;
    const upstream = new ws_1.WebSocket(targetUrl);
    const closeBoth = (code = 1000, reason = "") => {
        if (closed)
            return;
        closed = true;
        room.clients.delete(client);
        room.lastEmptyAt = Date.now();
        try {
            if (client.readyState === ws_1.WebSocket.OPEN || client.readyState === ws_1.WebSocket.CONNECTING) {
                client.close(code, reason);
            }
        }
        catch { }
        try {
            if (upstream.readyState === ws_1.WebSocket.OPEN || upstream.readyState === ws_1.WebSocket.CONNECTING) {
                upstream.close(code, reason);
            }
        }
        catch { }
    };
    client.on("message", (data, isBinary) => {
        if (closed)
            return;
        if (upstream.readyState === ws_1.WebSocket.OPEN) {
            upstream.send(data, { binary: isBinary });
        }
        else {
            queue.push({ data, isBinary });
        }
    });
    upstream.on("open", () => {
        if (closed)
            return;
        while (queue.length > 0) {
            const item = queue.shift();
            if (item && upstream.readyState === ws_1.WebSocket.OPEN) {
                upstream.send(item.data, { binary: item.isBinary });
            }
        }
    });
    upstream.on("message", (data, isBinary) => {
        if (closed)
            return;
        if (client.readyState === ws_1.WebSocket.OPEN) {
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
const server = config_1.config.sslCert && config_1.config.sslKey
    ? node_https_1.default.createServer({
        cert: node_fs_1.default.readFileSync(config_1.config.sslCert),
        key: node_fs_1.default.readFileSync(config_1.config.sslKey),
    }, (req, res) => void handleRequest(req, res))
    : node_http_1.default.createServer((req, res) => void handleRequest(req, res));
server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const match = /^\/ws\/room\/([a-zA-Z0-9_-]+)$/.exec(url.pathname);
    const roomId = match ? match[1] : url.searchParams.get("room") ?? "";
    if (!roomId || !roomManager.getRoom(roomId)) {
        socket.write("HTTP/1.1 404 Not Found, ");, socket.destroy());
        return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
        bridgeClient(ws, roomId);
    });
});
server.listen(config_1.config.port, config_1.config.host, () => {
    console.log(`Frog Arena gateway listening on http://${config_1.config.host}:${config_1.config.port}`);
});
