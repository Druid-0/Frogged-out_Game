import fs from "node:fs";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { config } from "./config";

const MIME: Record<string, string> = {
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

function applyIsolationHeaders(headers: Record<string, string>): void {
  if (process.env.COOP_COEP === "1") {
    headers["Cross-Origin-Opener-Policy"] = "same-origin";
    headers["Cross-Origin-Embedder-Policy"] = "require-corp";
    headers["Cross-Origin-Resource-Policy"] = "cross-origin";
  }
}

export function serveStatic(_req: IncomingMessage, res: ServerResponse, urlPath: string): void {
  const safePath = path.normalize(urlPath).replace(/^(\.\.[\/\])+/, "");
  let absolute = path.join(config.webDir, safePath);

  if (!fs.existsSync(absolute) || fs.statSync(absolute).isDirectory()) {
    absolute = path.join(config.webDir, "index.html");
  }

  if (!fs.existsSync(absolute)) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not Found");
    return;
  }

  const ext = path.extname(absolute).toLowerCase();
  const mimeType = MIME[ext] ?? "application/octet-stream";
  const headers: Record<string, string> = {
    "Content-Type": mimeType,
    "Cache-Control": "no-cache",
  };

  applyIsolationHeaders(headers);
  res.writeHead(200, headers);
  fs.createReadStream(absolute).pipe(res);
}
