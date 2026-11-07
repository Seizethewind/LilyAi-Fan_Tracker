CLAUDE.md — LilyAi Fan Tracker

1. Your Mission

You are the lead software architect and implementation engineer for LilyAi Fan Tracker.

Your task is to build a functional, modular fan-tracking service that integrates:

1. Umamoe Client — retrieves fan-related data from the Umamoe API.
2. Discord Client — connects to Discord, receives events, and performs authorized bot operations.
3. Backend Server — coordinates both clients, manages data, exposes a secure API, and connects to LilyAi's existing AI router.

This is a real software implementation task, not a documentation-only task.

Inspect the repository, understand the available APIs, implement the application, write tests, and maintain clear documentation.

Do not stop after producing a plan unless an essential external dependency or missing credential makes implementation impossible.

---

2. Core Architecture

Build the project around three independent functional components.

                   ┌──────────────────────┐
                   │   LilyAi AI Router   │
                   │                      │
                   │  Router URL /v1      │
                   │  Unified API Key     │
                   └──────────┬───────────┘
                              │
                              ▼
┌─────────────────────────────────────────────┐
│             FAN TRACKER SERVER              │
│                                             │
│  REST API                                   │
│  Authentication and Permissions            │
│  Data Processing                            │
│  Database / Storage                         │
│  AI Router Service                          │
│  Client Coordination                        │
└───────────────┬────────────────┬────────────┘
                │                │
                ▼                ▼
      ┌─────────────────┐  ┌─────────────────┐
      │  Umamoe Client  │  │ Discord Client  │
      │                 │  │                 │
      │ Umamoe API      │  │ Discord Gateway │
      │ Data Retrieval  │  │ Event Handling  │
      │ Data Parsing    │  │ Bot Operations  │
      └─────────────────┘  └─────────────────┘
                ▲                ▲
                └────────┬───────┘
                         │
                         ▼
                ┌─────────────────┐
                │ LilyAi Plugin   │
                │                 │
                │ Tracker Data   │
                │ Status          │
                │ Permitted Tools │
                └─────────────────┘

The diagram represents logical responsibilities. Implement the actual communication through well-defined interfaces and the backend API.

Important architectural rules

- Umamoe and Discord must remain separate clients.
- Both clients communicate with the backend server.
- The backend server is the central data and API layer.
- The AI router is accessed by the backend, not independently by every client.
- LilyAi communicates with the backend through its plugin.
- Do not tightly couple the Discord client to Umamoe.
- Do not require an AI model for ordinary data retrieval or Discord event processing.
- Every component must be independently testable.

---

3. AI Router Integration — Mandatory

The project must use my existing self-hosted AI router.

Do not create a new AI provider integration system.

Do not hardcode individual provider API keys or connect directly to Groq, OpenAI, Anthropic, or other model providers.

Use the router as the single model gateway.

Configuration

Use environment variables:

AI_ROUTER_URL=https://your-router-host/v1
AI_ROUTER_API_KEY=your-router-api-key
AI_MODEL=auto

These are examples. Never commit real credentials.

Router implementation

Create a reusable router service responsible for:

- Sending model requests.
- Handling the router's OpenAI-compatible API format, after verifying its actual compatibility.
- Selecting the configured model.
- Managing request timeouts.
- Handling API errors.
- Handling rate limits.
- Validating responses.
- Logging safe diagnostic information without exposing secrets.

Use the configured router URL rather than hardcoding an endpoint.

Do not assume every router supports every OpenAI API feature. Inspect its available API behavior and implement only supported features.

AI responsibilities

AI may be used for:

- Summarizing fan activity.
- Explaining tracker information.
- Natural-language questions about collected data.
- Generating reports.
- Finding patterns in available information.

AI must not be required for:

- Retrieving Umamoe data.
- Processing ordinary Discord events.
- Saving database records.
- Checking connection status.
- Serving normal API requests.

The tracker must continue functioning when the AI router is unavailable.

---

4. Umamoe Client

Build an independent Umamoe integration module.

Responsibilities:

- Connect to the Umamoe API.
- Retrieve supported fan-related information.
- Handle authentication if required.
- Parse responses.
- Normalize data into internal schemas.
- Handle pagination if supported.
- Handle API errors and rate limits.
- Support scheduled or on-demand data synchronization.

Critical instructions

Before implementation:

1. Inspect the official Umamoe API documentation or the actual API implementation.
2. Identify the supported endpoints.
3. Identify authentication requirements.
4. Inspect real response formats where possible.
5. Document any unknown or unsupported behavior.

Never invent API endpoints, parameters, response fields, or authentication methods.

Keep the Umamoe API-specific implementation isolated so it can be updated without rewriting the server.

---

5. Discord Client

Build a separate Discord integration module.

Responsibilities:

- Connect to Discord using the official Discord API.
- Receive Gateway events required by the tracker.
- Process permitted messages and events.
- Maintain connection status.
- Handle reconnections.
- Support authorized bot operations.
- Send structured event data to the backend.
- Receive permitted action requests from the backend.

Use the minimum required Discord intents and permissions.

Security

- Never expose the bot token to LilyAi.
- Never return secrets in API responses.
- Do not grant unrestricted Discord control.
- Read-only functionality should be the default.
- Sending messages, mentioning users, and other write operations must require explicit permission.
- Validate every requested action on the server.

Do not implement mass mentions or broad messaging as an unrestricted default feature.

---

6. Backend Server

The backend is the central component of this project.

Use Python with FastAPI unless the existing repository establishes a better justified implementation choice.

Responsibilities:

- Expose REST API endpoints.
- Authenticate incoming requests.
- Enforce permissions.
- Coordinate the Umamoe and Discord clients.
- Store and retrieve tracker information.
- Provide health and connection status.
- Provide the AI router service.
- Validate incoming and outgoing data.
- Handle errors consistently.

Suggested API groups

/api/v1/health

/api/v1/auth/

/api/v1/tracker/
/api/v1/tracker/sync

/api/v1/fans/
/api/v1/fans/{fan_id}

/api/v1/discord/status
/api/v1/discord/events
/api/v1/discord/actions

/api/v1/ai/query
/api/v1/ai/summary

These are proposed route groups, not claims that all corresponding functionality already exists.

Implement only endpoints that have a defined purpose and working backend behavior.

API design rules

- Use consistent JSON responses.
- Validate requests using schemas.
- Return appropriate HTTP status codes.
- Include useful error messages without leaking internal secrets.
- Version the API.
- Keep internal service logic separate from route handlers.
- Add pagination for potentially large result sets.
- Document every implemented endpoint.

---

7. LilyAi Plugin Compatibility

The backend must be designed for consumption by the LilyAi Android plugin system.

LilyAi should not need to understand the internal implementation of the tracker.

It should communicate through documented HTTP endpoints.

The plugin should eventually support:

- Checking server status.
- Checking Discord connection status.
- Retrieving fan-tracking data.
- Requesting a data synchronization.
- Viewing relevant fan information.
- Requesting AI-generated summaries.
- Performing explicitly authorized Discord actions.

Keep plugin-facing responses stable and predictable.

Use authentication for all private endpoints.

Separate read permissions from write permissions.

Do not put the Discord bot token or AI router key in the plugin manifest.

---

8. Suggested Repository Structure

Adapt this structure to the actual repository. Avoid creating unnecessary files or abstractions.

LilyAi-Fan_Tracker/
│
├── clients/
│   ├── umamoe/
│   │   ├── client.py
│   │   ├── models.py
│   │   ├── parser.py
│   │   └── sync.py
│   │
│   └── discord/
│       ├── client.py
│       ├── events.py
│       ├── actions.py
│       └── permissions.py
│
├── server/
│   ├── main.py
│   ├── api/
│   ├── auth/
│   ├── services/
│   ├── storage/
│   └── router/
│       ├── client.py
│       └── service.py
│
├── shared/
│   └── schemas/
│
├── config/
│
├── tests/
│   ├── unit/
│   ├── integration/
│   └── fixtures/
│
├── docs/
│
├── .env.example
├── .gitignore
├── requirements.txt
├── CLAUDE.md
├── ARCHITECTURE.md
└── README.md

---

9. Storage Requirements

Create a clean storage abstraction.

Do not scatter database queries throughout API handlers or client implementations.

Requirements:

- Use structured data models.
- Support safe inserts and updates.
- Prevent duplicate records where appropriate.
- Handle missing or incomplete external data.
- Keep database configuration outside source code.
- Support migrations or a documented schema initialization process.
- Make storage replaceable without rewriting the clients.

Choose a suitable database based on actual deployment requirements. Do not add unnecessary database systems.

If using Turso, keep its connection details in environment variables and use its supported connection method.

---

10. Security Requirements

Security is part of the implementation, not a later improvement.

- Store credentials in environment variables.
- Never commit ".env".
- Provide ".env.example" with placeholder values.
- Authenticate private API requests.
- Use separate permissions for reading and modifying data.
- Validate Discord actions.
- Apply reasonable request limits.
- Avoid logging API keys, bot tokens, or private user information.
- Handle authentication failures safely.
- Restrict CORS to configured origins where applicable.
- Do not expose internal server errors to clients.
- Do not trust plugin-supplied permissions without server-side validation.

---

11. Deployment

The service is intended to run on Render.

Prepare it for a straightforward deployment.

Provide:

- A working application entry point.
- A production start command.
- Dependency installation instructions.
- Environment variable documentation.
- A health-check endpoint.
- Graceful shutdown behavior.
- Connection recovery where appropriate.
- Persistent storage configuration if required.

Do not assume local development resources are always available.

The project should be buildable and testable through GitHub Actions.

---

12. Development Phases

Implement the project in the following order.

Phase 1 — Repository inspection and foundation

- Inspect the complete repository.
- Read existing documentation.
- Identify existing code and dependencies.
- Establish the implementation stack.
- Create the project foundation.
- Create configuration and shared schemas.
- Prepare ".env.example".

Do not overwrite useful existing work without understanding it.

Phase 2 — Backend

- Implement the FastAPI server.
- Add health endpoints.
- Add authentication.
- Add shared response schemas.
- Add storage abstraction.
- Add API documentation.

The backend must run before proceeding.

Phase 3 — Umamoe Client

- Research the real API.
- Implement authentication and requests.
- Parse and normalize actual responses.
- Implement synchronization.
- Add tests using real documented response formats or clearly labeled fixtures.

Phase 4 — Discord Client

- Implement Discord connection.
- Implement required Gateway events.
- Implement connection status.
- Implement controlled actions.
- Add permission validation.
- Test reconnect and failure behavior.

Phase 5 — AI Router

- Implement the reusable router client.
- Read URL, key, and model from environment variables.
- Verify compatibility with the configured router.
- Add AI query and summary services.
- Test timeout and unavailable-router behavior.

Phase 6 — Integration

- Connect both clients to the server.
- Verify data flow.
- Verify storage.
- Verify API authentication.
- Verify plugin-facing responses.
- Verify that normal tracking works without AI.

Phase 7 — Production readiness

- Run all tests.
- Fix implementation errors.
- Add GitHub Actions CI.
- Prepare Render deployment.
- Update README and architecture documentation.
- Report anything that still requires real credentials or external API access.

---

13. Testing Requirements

Write tests throughout development.

At minimum, test:

- Server startup.
- Health endpoint.
- Authentication success and failure.
- Invalid request handling.
- Umamoe response parsing.
- Umamoe API failure.
- Discord connection failure and recovery logic.
- Unauthorized Discord actions.
- Storage operations.
- Router request formatting.
- Router timeout and error handling.
- AI functionality when the router is unavailable.
- Full integration of the server and both clients.

Use mocks for external services when credentials are unavailable.

Do not claim an external integration works just because a mocked test passes.

Clearly distinguish mocked tests from real-service verification.

---

14. Working Rules for Claude

Follow these rules throughout implementation:

1. Build, don't just plan. Make actual code changes and verify them.
2. Inspect existing files before editing.
3. Do not rewrite working components without a reason.
4. Do not invent external API behavior.
5. Do not introduce LangChain or another agent framework unless a specific requirement justifies it.
6. Keep dependencies minimal.
7. Prefer simple, modular Python implementations.
8. Keep Umamoe, Discord, server, storage, and AI router responsibilities separate.
9. Avoid circular dependencies.
10. Never hardcode credentials.
11. Do not leave placeholder functions presented as completed features.
12. Do not silently swallow exceptions.
13. Add tests for important behavior.
14. Update documentation when implementation changes.
15. Do not claim deployment or real API verification without evidence.

When blocked by missing credentials or undocumented external behavior, implement everything that can be completed independently and clearly identify the remaining blocker.

Do not repeatedly ask the user for information already present in the repository or environment.

---

15. Final Deliverables

The completed repository should contain:

- A functioning backend server.
- An independent Umamoe client.
- An independent Discord client.
- A reusable AI router integration using my router URL "/v1" and API key.
- Storage implementation.
- Authentication and permission controls.
- Documented API endpoints for LilyAi.
- Automated tests.
- GitHub Actions workflow.
- Render deployment instructions.
- Updated README.
- Updated ARCHITECTURE.md.
- ".env.example".

At completion, provide a report containing:

1. What was implemented.
2. Which files were created or modified.
3. How the three components communicate.
4. How to configure the router.
5. How to configure Umamoe and Discord.
6. How to run locally.
7. How to deploy on Render.
8. Which tests passed.
9. Which features still need real credentials or external verification.

Final instruction: Build this as a clean, maintainable service for LilyAi. Keep the architecture modular so that future tracker capabilities and additional LilyAi plugins can be added without rebuilding the entire system.
