# Chat API Baseline Contract (`chat_service.py`)

This document freezes the current Python API behavior for migration parity.

- Capture date: `2026-02-21`
- Base URL: `http://127.0.0.1:8000`
- Server command requested in task: `uv run uvicorn chat_service:app --reload --port 8000`
- Server command used for capture in this workspace: `.venv\Scripts\python -m uvicorn chat_service:app --port 8000`
  Reason: `uv run` fails locally with a uv cache permission error.

## Replay Setup

1. Ensure `chat_service.py` imports resolve (`search_jurisprudencia`, `multi_search_jurisprudencia`).
2. Seed one session so success cases for `GET/DELETE /sessions/{session_id}` are reproducible:

```bash
python - <<'PY'
import json
json.dump(
  {"6aea3889-4005-4157-8a09-090f8f56241a": []},
  open("chat_history.json", "w", encoding="utf-8"),
  ensure_ascii=False,
  indent=2,
)
PY
```

3. Start backend:

```bash
uv run uvicorn chat_service:app --reload --port 8000
```

## Endpoint Contract

## `GET /sessions`

Request:

```bash
curl -i http://127.0.0.1:8000/sessions
```

Success (observed):

- Status: `200`
- Body shape: `Array<{session_id: string, turns: number, last_message: string | null}>`

Example body:

```json
[{"session_id":"6aea3889-4005-4157-8a09-090f8f56241a","turns":2,"last_message":"hola"}]
```

Failed example (wrong method):

```bash
curl -i -X POST http://127.0.0.1:8000/sessions
```

- Status: `405`
- Body:

```json
{"detail":"Method Not Allowed"}
```

Field stability:

- `session_id`: must keep
- `turns`: must keep
- `last_message`: must keep
- extra fields in each item: can extend

## `GET /sessions/{session_id}`

Success (observed):

```bash
curl -i http://127.0.0.1:8000/sessions/6aea3889-4005-4157-8a09-090f8f56241a
```

- Status: `200`
- Body shape: `{session_id: string, history: Array<{role: string, content: string}>}`

Example body:

```json
{"session_id":"6aea3889-4005-4157-8a09-090f8f56241a","history":[{"role":"user","content":"hola"},{"role":"assistant","content":"hola, en que puedo ayudar?"}]}
```

Failure (observed):

```bash
curl -i http://127.0.0.1:8000/sessions/does-not-exist
```

- Status: `404`
- Body:

```json
{"detail":"Sesión no encontrada"}
```

Field stability:

- top-level `session_id`, `history`: must keep
- `history[].role`, `history[].content`: must keep
- extra message-level fields: can extend

## `DELETE /sessions/{session_id}`

Success (observed):

```bash
curl -i -X DELETE http://127.0.0.1:8000/sessions/6aea3889-4005-4157-8a09-090f8f56241a
```

- Status: `200`
- Body:

```json
{"detail":"Sesión '6aea3889-4005-4157-8a09-090f8f56241a' eliminada"}
```

Failure (observed):

```bash
curl -i -X DELETE http://127.0.0.1:8000/sessions/does-not-exist
```

- Status: `404`
- Body:

```json
{"detail":"Sesión no encontrada"}
```

Field stability:

- `detail`: must keep (string)
- wording of message text: can deprecate later

## `GET /sessions/{session_id}/summary`

Observed request:

```bash
curl -i http://127.0.0.1:8000/sessions/6aea3889-4005-4157-8a09-090f8f56241a/summary
```

Observed runtime behavior in this workspace:

- Status: `500`
- Body:

```json
{"detail":"Error al generar el resumen: ... openai.ChatCompletion ... no longer supported in openai>=1.0.0 ..."}
```

Failure (missing session, observed):

```bash
curl -i http://127.0.0.1:8000/sessions/does-not-exist/summary
```

- Status: `404`
- Body:

```json
{"detail":"Sesión no encontrada"}
```

Declared success shape from handler (not observed in this environment due the error above):

- Status: `200`
- Body shape: `{session_id: string, summary: string}`

Field stability:

- `session_id`, `summary` on success: must keep
- `detail` on error: must keep
- specific exception text in `detail`: can deprecate later

## `POST /chat-stream`

Request body schema (`ChatRequest`):

- Required: `session_id` (string), `message` (string) -> must keep
- Optional with defaults -> can extend:
  - `collections: string[] | null = null`
  - `materia: string[] | null = null`
  - `fecha_desde: string | null = null`
  - `fecha_hasta: string | null = null`
  - `dynamic_k: bool = false`
  - `hybrid: bool = false`
  - `alpha: float = 1.0`
  - `beta: float = 1.0`
  - `top_k: int = 3`
  - `chat_model: string = "gpt-3.5-turbo"`
  - `embedding_model: string = "text-embedding-3-small"`
  - `qdrant_host: string = "./qdrant_data"`
  - `qdrant_port: int = 6333`
  - `qdrant_api_key: string | null = null`
  - `openai_api_key: string | null = null`

Observed request (nominal attempt):

```bash
curl -i -X POST http://127.0.0.1:8000/chat-stream -H "Content-Type: application/json" -d "{\"session_id\":\"contract-stream-test\",\"message\":\"Decime brevemente que hace este endpoint\"}"
```

Observed runtime behavior in this workspace:

- Status: `500`
- Body:

```json
{"detail":"Error al refinar la consulta: Connection error."}
```

Failure (validation, observed):

```bash
curl -i -X POST http://127.0.0.1:8000/chat-stream -H "Content-Type: application/json" -d "{\"session_id\":\"only-id\"}"
```

- Status: `422`
- Body:

```json
{"detail":[{"type":"missing","loc":["body","message"],"msg":"Field required","input":{"session_id":"only-id"}}]}
```

Streaming success format from implementation (shape frozen even though not observed live here):

- Response content type: `text/event-stream`
- Headers include: `Cache-Control: no-cache`, `X-Accel-Buffering: no`
- Event frames:

```text
event: start
data: [START]

data: <token>

event: end
data: [END]

```

- Stream-side error frame format:

```text
data: [ERROR] <message>

```

Field stability:

- SSE `start`/token `data`/`end` framing: must keep
- SSE additional event types: can extend
- Optional request fields above: can extend
- `qdrant_port` if unused in Node path: can deprecate later

## Migration Compatibility Summary

Must keep:

- Route paths and HTTP methods.
- Top-level response keys documented above.
- Error code semantics (`404`, `405`, `422`, `500`).
- SSE framing contract for `POST /chat-stream`.

Can extend:

- Additional optional request/response fields.
- Additional SSE event types if current parser remains compatible.

Can deprecate later:

- Exact human-readable error text.
- Optional fields proven unused by all clients.
