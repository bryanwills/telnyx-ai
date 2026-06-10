const { createReadStream, existsSync } = require("node:fs");
const { extname, join, normalize } = require("node:path");
const http = require("node:http");

const root = existsSync(join(__dirname, "dist")) ? join(__dirname, "dist") : join(__dirname, "src");
const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url || "/", "http://localhost");
  const requested = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
  const relativePath = requested === "/" ? "index.html" : requested.replace(/^[/\\]/, "");
  const filePath = join(root, relativePath);
  const resolvedPath = existsSync(filePath) ? filePath : join(root, "index.html");
  const extension = extname(resolvedPath);

  res.writeHead(200, {
    "content-type": contentTypes[extension] || "application/octet-stream",
    "cache-control": extension === ".html" ? "no-store" : "public, max-age=300",
  });
  createReadStream(resolvedPath).pipe(res);
});

const port = Number(process.env.PORT || 8080);
server.listen(port, "0.0.0.0", () => {
  console.log(`Test Snake Link listening on ${port}`);
});
