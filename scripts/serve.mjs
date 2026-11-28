#!/usr/bin/env node
/** 로컬 미리보기 서버 (의존성 0). `npm run build` 후 dist/ 를 서빙한다. */
import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..", "dist");
const port = Number(process.env.PORT || 4173);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${port}`);
    let file = path.join(root, decodeURIComponent(url.pathname));
    if (!file.startsWith(root)) {
      res.writeHead(403).end("forbidden");
      return;
    }
    let s = null;
    try { s = await stat(file); } catch { s = null; }
    // 디렉터리는 그 안의 index.html (프리렌더 /c/{id}/ 가 여기에 해당한다)
    if (s && s.isDirectory()) {
      file = path.join(file, "index.html");
      try { s = await stat(file); } catch { s = null; }
    }
    if (!s) {
      file = path.join(root, "index.html");
      s = await stat(file);
    }
    res.writeHead(200, {
      "content-type": MIME[path.extname(file)] || "application/octet-stream",
      "content-length": s.size,
      "cache-control": "no-cache",
    });
    createReadStream(file).pipe(res);
  } catch (e) {
    res.writeHead(500).end(String(e.message));
  }
});

server.listen(port, () => {
  console.log(`CourseBrief preview → http://localhost:${port}`);
});
