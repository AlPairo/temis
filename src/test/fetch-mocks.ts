type ResponseInitLike = {
  status?: number;
  statusText?: string;
  headers?: HeadersInit;
};

export function createJsonResponse(body: unknown, init: ResponseInitLike = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    statusText: init.statusText,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {})
    }
  });
}

export function createTextResponse(body: string, init: ResponseInitLike = {}): Response {
  return new Response(body, {
    status: init.status ?? 200,
    statusText: init.statusText,
    headers: init.headers
  });
}

export function createSseResponse(frames: string[], init: ResponseInitLike = {}): Response {
  const encoder = new TextEncoder();
  const payload = frames.join("");
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(payload));
      controller.close();
    }
  });

  return new Response(stream, {
    status: init.status ?? 200,
    statusText: init.statusText,
    headers: {
      "Content-Type": "text/event-stream",
      ...(init.headers ?? {})
    }
  });
}
