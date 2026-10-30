"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.serveStatic = serveStatic;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const config_1 = require("./config");
const MIME = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".wasm": "application/wasm",
    ".pck": "application/octet-stream",
    ".data": "application/octet-stream",
    ".json": "application/json; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".map": "application/json; charset=utf-8",
    ".txt": "text/plain; charset=utf-8",
};
function applyIsolationHeaders(headers) {
    if (process.env.COOP_COEP === "1") {
        headers["Cross-Origin-Opener-Policy"] = "same-origin";
        headers["Cross-Origin-Embedder-Policy"] = "require-corp";
        headers["Cross-Origin-Resource-Policy"] = "cross-origin";
    }
}
function serveStatic(_req, res, urlPath) {
    const safePath = node_path_1.default.normalize(urlPath).replace(/^(\.\.[\/\])+/, ""));
    let absolute = node_path_1.default.join(config_1.config.webDir, safePath);
    if (!node_fs_1.default.existsSync(absolute) || node_fs_1.default.statSync(absolute).isDirectory()) {
        absolute = node_path_1.default.join(config_1.config.webDir, "index.html");
    }
    if (!node_fs_1.default.existsSync(absolute)) {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Not Found");
        return;
    }
    const ext = node_path_1.default.extname(absolute).toLowerCase();
    const mimeType = MIME[ext] ?? "application/octet-stream";
    const headers = {
        "Content-Type": mimeType,
        "Cache-Control": "no-cache",
    };
    applyIsolationHeaders(headers);
    res.writeHead(200, headers);
    node_fs_1.default.createReadStream(absolute).pipe(res);
}
