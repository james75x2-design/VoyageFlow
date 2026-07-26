// VoyageFlow MCP Client Adapter (Phase 2 skeleton)
// Worker-safe JSON-RPC 2.0 client for calling MCP-like HTTP endpoints.
// This module is transport-injected so tests can run without network access.

export class McpClientError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'McpClientError';
    this.details = details;
  }
}

export function createMcpClient({ endpoint, headers = {}, fetchImpl = fetch, timeoutMs = 10000, logEvent = () => {} } = {}) {
  if (!endpoint && !fetchImpl.__isMockTransport) {
    throw new McpClientError('MCP endpoint is required unless a mock transport is injected');
  }

  let nextId = 1;

  async function request(method, params = {}) {
    const id = nextId++;
    const body = { jsonrpc: '2.0', id, method, params };
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeoutId = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

    try {
      const response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body),
        signal: controller ? controller.signal : undefined
      });

      if (!response || typeof response.json !== 'function') {
        throw new McpClientError('MCP transport returned an invalid response object');
      }

      const payload = await response.json();
      if (!response.ok) {
        throw new McpClientError(`MCP HTTP ${response.status}`, { status: response.status, payload });
      }
      if (payload.error) {
        throw new McpClientError(payload.error.message || 'MCP JSON-RPC error', { error: payload.error });
      }
      if (payload.id !== id) {
        throw new McpClientError('MCP response id mismatch', { expected: id, actual: payload.id });
      }
      return payload.result;
    } catch (err) {
      const message = err && err.name === 'AbortError' ? `MCP request timed out after ${timeoutMs}ms` : err.message;
      logEvent('warn', 'mcp_request_failed', { method, error: message });
      if (err instanceof McpClientError) throw err;
      throw new McpClientError(message, { method });
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }

  return {
    request,
    initialize: (clientInfo = { name: 'voyageflow', version: 'phase2' }) => request('initialize', { clientInfo }),
    listTools: () => request('tools/list', {}),
    callTool: (name, argumentsObj = {}) => request('tools/call', { name, arguments: argumentsObj })
  };
}

export async function callMcpToolSafely({ client, name, args, fallback = null, logEvent = () => {} }) {
  try {
    const result = await client.callTool(name, args);
    return { ok: true, result };
  } catch (err) {
    logEvent('warn', 'mcp_tool_failed', { name, error: err.message });
    return { ok: false, result: fallback, error: err.message };
  }
}

export function makeMockMcpTransport(handler) {
  const mock = async (_endpoint, options) => {
    const request = JSON.parse(options.body);
    const resultOrError = await handler(request);
    if (resultOrError && resultOrError.__httpError) {
      return mockJsonResponse(resultOrError.status || 500, { jsonrpc: '2.0', id: request.id, error: resultOrError.error });
    }
    if (resultOrError && resultOrError.__rpcError) {
      return mockJsonResponse(200, { jsonrpc: '2.0', id: request.id, error: resultOrError.error });
    }
    return mockJsonResponse(200, { jsonrpc: '2.0', id: request.id, result: resultOrError });
  };
  mock.__isMockTransport = true;
  return mock;
}

function mockJsonResponse(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload
  };
}
