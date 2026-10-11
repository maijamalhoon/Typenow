import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const exportRoot = resolve(projectRoot, "out");
const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".ttf", "font/ttf"],
  [".txt", "text/plain; charset=utf-8"],
  [".webp", "image/webp"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
]);

const server = createServer(async (request, response) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url ?? "/", "http://127.0.0.1").pathname);
  } catch (error) {
    response.writeHead(400).end("Invalid request path");
    return;
  }

  const requestedPath = resolve(exportRoot, `.${pathname}`);
  if (requestedPath !== exportRoot && !requestedPath.startsWith(`${exportRoot}${sep}`)) {
    response.writeHead(400).end("Invalid request path");
    return;
  }

  try {
    const info = await stat(requestedPath);
    const filePath = info.isDirectory() ? resolve(requestedPath, "index.html") : requestedPath;
    const fileInfo = await stat(filePath);
    if (!fileInfo.isFile()) {
      response.writeHead(404).end("Not found");
      return;
    }

    response.writeHead(200, {
      "Content-Length": fileInfo.size,
      "Content-Type": contentTypes.get(extname(filePath)) ?? "application/octet-stream",
    });
    const stream = createReadStream(filePath);
    stream.on("error", (error) => {
      console.error("Static asset read failed:", error);
      if (!response.headersSent) response.writeHead(500);
      response.end("Unable to read static asset");
    });
    stream.pipe(response);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      response.writeHead(404).end("Not found");
      return;
    }
    console.error("Static request failed:", error);
    response.writeHead(500).end("Unable to serve static asset");
  }
});

server.on("error", (error) => {
  console.error("Static test server failed:", error);
  process.exitCode = 1;
});

server.listen(3000, "127.0.0.1");
