import express from "express";
import fs from "node:fs";
import path from "node:path";

export async function attachFrontend(app: express.Express): Promise<void> {
  const distDir = path.resolve(process.cwd(), "dist_frontend");
  const isProd = process.env.NODE_ENV === "production";

  if (!isProd) {
    const vitePromise = import("vite").then(({ createServer }) =>
      createServer({
        server: { middlewareMode: true, hmr: false },
        appType: "spa",
      })
    );
    app.use((req, res, next) => {
      vitePromise
        .then((vite) => vite.middlewares(req, res, next))
        .catch(next);
    });
    return;
  }

  if (fs.existsSync(distDir)) {
    app.use(express.static(distDir));
    app.get("/{*splat}", (_req, res) => {
      res.sendFile(path.join(distDir, "index.html"));
    });
  }
}
