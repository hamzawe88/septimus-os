import { Server } from '@hocuspocus/server';
import * as Y from 'yjs';
import { validateDocumentId, verifyJWT } from './auth.js';

const port = Number(process.env.PORT || 1234);
const jwtSecret = process.env.JWT_SECRET || '';
const backendUrl = process.env.BACKEND_URL || 'http://backend-core:4000';
const internalToken = process.env.INTERNAL_API_TOKEN || '';

async function backendRequest(path, options = {}) {
  if (!internalToken) throw new Error('Yjs internal authentication is not configured');
  const response = await fetch(`${backendUrl}${path}`, {
    ...options,
    headers: {
      'X-Internal-Token': internalToken,
      ...options.headers,
    },
    signal: AbortSignal.timeout(10_000),
  });
  return response;
}

function workspaceFromContext(data) {
  const workspaceId = data.context?.workspaceId;
  if (typeof workspaceId !== 'string' || !/^[0-9a-f-]{36}$/i.test(workspaceId)) {
    throw new Error('missing document workspace context');
  }
  return workspaceId;
}

const server = new Server({
  port,
  async onAuthenticate(data) {
    const token = data.token || data.request?.headers?.authorization?.replace(/^Bearer\s+/i, '');
    const identity = verifyJWT(token, jwtSecret);
    const documentId = validateDocumentId(data.documentName);
    const response = await backendRequest(`/internal/workdocs/${documentId}/access`, {
      headers: {
        'X-Workspace-ID': identity.workspaceId,
        'X-User-ID': identity.userId,
      },
    });
    if (!response.ok) throw new Error('document access denied');
    return identity;
  },
  async onConnect(data) {
    console.log(`Authenticated client connected: ${data.documentName}`);
  },
  async onLoadDocument(data) {
    const documentId = validateDocumentId(data.documentName);
    const response = await backendRequest(`/internal/workdocs/${documentId}/state`, {
      headers: { 'X-Workspace-ID': workspaceFromContext(data) },
    });
    if (!response.ok) throw new Error('failed to load persistent document state');
    const { state } = await response.json();
    if (state) Y.applyUpdate(data.document, Buffer.from(state, 'base64'));
  },
  async onStoreDocument(data) {
    const documentId = validateDocumentId(data.documentName);
    const state = Buffer.from(Y.encodeStateAsUpdate(data.document)).toString('base64');
    const response = await backendRequest(`/internal/workdocs/${documentId}/state`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Workspace-ID': workspaceFromContext(data),
      },
      body: JSON.stringify({ state }),
    });
    if (!response.ok) throw new Error('failed to persist document state');
  },
});

server.listen().then(() => {
  console.log(`Hocuspocus Server listening on ws://0.0.0.0:${port}`);
});
