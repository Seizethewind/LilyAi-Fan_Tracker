# AI replies to @mentions

Mention the bot and it answers through your AI router.

- `@bot what is guy saying for` as a **reply** to a message: the bot focuses on the message
  you replied to and on you (the person asking).
- `@bot <question>` without a reply: it just answers the question.
- `@bot` alone, not replying to anything: it explains how to use it.

## Configuration

| Variable | Value |
| --- | --- |
| `AI_ROUTER_URL` | Your router URL, ending in `/v1` |
| `AI_ROUTER_API_KEY` | The unified router key (set it in the Render dashboard, never in the repo) |
| `AI_MODEL` | `auto` (default) |
| `AI_USER_COOLDOWN_SECONDS` | Seconds between questions from one person (default 10) |

Leave `AI_ROUTER_URL` and `AI_ROUTER_API_KEY` unset and the feature is off. A value that does
not start with `http://` or `https://` (for example a placeholder) also leaves it off, with a
warning in the log; it never stops the app.

The client calls `POST <AI_ROUTER_URL>/chat/completions` with `Authorization: Bearer <key>` and
`{"model": ..., "messages": [...]}`. It assumes the router is OpenAI-compatible and sends
nothing optional (no streaming, no `max_tokens`).

## When the router is unavailable

The bot answers: *"Lily can't answer right now. Please wait about N before talking to me
again."* N comes from the router's `Retry-After` header, or one minute if it sends none.
During that time every mention gets the same message with the remaining time, and the router
is not called again. Fan tracking and slash commands are not affected.

## Message Content intent

To read the message being replied to, the bot asks for Discord's **Message Content** intent.
Turn it on in the Developer Portal: Applications, your bot, **Bot**, Privileged Gateway
Intents. If it is off, the bot logs a warning and runs without it. Slash commands and answers
to the mention itself still work, but the replied-to message's text may come through empty.

## Limits

- Only text is read, plus the **names** of attached files. Images, embeds and links are not
  opened.
- Replied-to text is cut at 2000 characters and answers at 1900.
- Messages from other bots are ignored.
- Message text is treated as untrusted data in the prompt, which reduces but does not remove
  the risk of prompt injection.

## Testing

`tests/test_ai.py` is **mocked**: a fake router returning hand-written responses. It does not
show that your real router accepts the request or that the Discord handler works in a server.
