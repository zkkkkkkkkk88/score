const { spawn } = require("child_process");
const fs = require("fs");
const http = require("http");
const path = require("path");

const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || "127.0.0.1";
const UPDATE_INTERVAL_MS = Number(process.env.SCORE_UPDATE_INTERVAL_MS || 60 * 1000);

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mp4": "video/mp4",
};

let updateRunning = false;
let updatePromise = null;

function runUpdate(reason = "interval") {
  if (updatePromise) return updatePromise;
  updateRunning = true;

  updatePromise = new Promise((resolve) => {
    const child = spawn(process.execPath, ["scripts/update-real-data.js"], {
      cwd: process.cwd(),
      stdio: "inherit",
      env: process.env,
    });

    child.on("exit", (code) => {
      updateRunning = false;
      updatePromise = null;
      if (code !== 0) console.warn(`[score] data update failed during ${reason}`);
      resolve(code);
    });
  });

  return updatePromise;
}

async function shouldRefreshData() {
  try {
    const stat = await fs.promises.stat(path.resolve("data/matches.json"));
    return Date.now() - stat.mtimeMs > UPDATE_INTERVAL_MS;
  } catch {
    return true;
  }
}

async function serveLiveData(response) {
  if (await shouldRefreshData()) await runUpdate("api");

  fs.readFile(path.resolve("data/matches.json"), (error, buffer) => {
    if (error) {
      response.writeHead(503, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: "无法读取赛事数据" }));
      return;
    }

    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
      "X-Score-Live": "1",
    });
    response.end(buffer);
  });
}

function safePath(urlPath) {
  const pathname = new URL(urlPath, `http://${HOST}:${PORT}`).pathname;
  const relative = pathname === "/" ? "index.html" : decodeURIComponent(pathname.slice(1));
  const resolved = path.resolve(process.cwd(), relative);
  return resolved.startsWith(process.cwd()) ? resolved : null;
}

const server = http.createServer((request, response) => {
  const pathname = new URL(request.url, `http://${HOST}:${PORT}`).pathname;
  if (pathname === "/api/matches") {
    serveLiveData(response);
    return;
  }

  const filePath = safePath(request.url);
  if (!filePath) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, buffer) => {
    if (error) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }

    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Type": mimeTypes[path.extname(filePath)] || "application/octet-stream",
    });
    response.end(buffer);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`[score] live dashboard: http://${HOST}:${PORT}`);
  console.log(`[score] updating Sporttery data every ${Math.round(UPDATE_INTERVAL_MS / 1000)} seconds`);
  runUpdate("startup");
  setInterval(runUpdate, UPDATE_INTERVAL_MS);
});
