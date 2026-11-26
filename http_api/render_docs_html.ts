import { VERSION } from "../domain_models/types.js";

export function renderDocsHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>LilyAi Fan Tracker API</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; max-width: 780px; margin: 40px auto; padding: 0 20px; line-height: 1.5; color: #1f2937; }
    h1 { margin-bottom: 4px; }
    code { background: #f3f4f6; padding: 2px 6px; border-radius: 4px; font-size: 0.9em; }
    .endpoint { border: 1px solid #e5e7eb; border-radius: 8px; padding: 14px 16px; margin: 12px 0; }
    .method { font-weight: 700; margin-right: 8px; }
    .get { color: #059669; }
    .post { color: #2563eb; }
    .muted { color: #6b7280; font-size: 0.92em; }
  </style>
</head>
<body>
  <h1>LilyAi Fan Tracker API <span class="muted">v${VERSION}</span></h1>
  <p class="muted">OpenAPI spec: <a href="/api/v1/openapi.json"><code>/api/v1/openapi.json</code></a></p>
  <div class="endpoint">
    <div><span class="method get">GET</span><code>/health</code> <span class="muted">(public)</span></div>
    <p>Cheap liveness check returning server status and version.</p>
  </div>
  <div class="endpoint">
    <div><span class="method get">GET</span><code>/api/v1/status</code> <span class="muted">(Bearer read/write key)</span></div>
    <p>Server time, Discord connection state, and per-club sync status.</p>
  </div>
  <div class="endpoint">
    <div><span class="method get">GET</span><code>/api/v1/clubs/{club}/leaderboard?period=daily&amp;top=30</code> <span class="muted">(Bearer read/write key)</span></div>
    <p><code>club</code> is <code>club1</code>, <code>club2</code>, or a configured club ID. <code>period</code> is <code>daily</code>, <code>weekly</code>, or <code>monthly</code>. <code>top</code> is 1–30.</p>
  </div>
  <div class="endpoint">
    <div><span class="method get">GET</span><code>/api/v1/members/{trainer_id}</code> <span class="muted">(Bearer read/write key)</span></div>
    <p>Daily, weekly, and monthly gain &amp; rank for an active club member.</p>
  </div>
  <div class="endpoint">
    <div><span class="method get">GET</span><code>/api/v1/chat/context</code> <span class="muted">(Bearer read/write key)</span></div>
    <p>Returns whether AI replies are enabled plus live club summary context.</p>
  </div>
  <div class="endpoint">
    <div><span class="method post">POST</span><code>/api/v1/chat</code> <span class="muted">(Bearer read/write key)</span></div>
    <p>Mention-aware AI chat reply with reply context, cooldowns, and short-term channel memory.</p>
  </div>
  <div class="endpoint">
    <div><span class="method post">POST</span><code>/api/v1/sync</code> <span class="muted">(Bearer write key)</span></div>
    <p>Triggers an immediate refresh of both clubs (30-second cooldown).</p>
  </div>
</body>
</html>`;
}
