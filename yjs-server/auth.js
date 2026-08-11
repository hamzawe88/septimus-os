import crypto from 'node:crypto';

function decodePart(part) {
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
}

export function verifyJWT(token, secret, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (!secret || typeof token !== 'string') throw new Error('missing JWT configuration');
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('invalid JWT');
  const expected = crypto.createHmac('sha256', secret).update(`${parts[0]}.${parts[1]}`).digest('base64url');
  if (expected.length !== parts[2].length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(parts[2]))) {
    throw new Error('invalid JWT signature');
  }
  const header = decodePart(parts[0]);
  const claims = decodePart(parts[1]);
  if (header.alg !== 'HS256' || !claims.sub || !claims.workspace_id || (claims.exp && claims.exp <= nowSeconds)) {
    throw new Error('invalid JWT claims');
  }
  return { userId: claims.sub, workspaceId: claims.workspace_id };
}

export function validateDocumentId(documentName) {
  const documentId = String(documentName || '');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(documentId)) {
    throw new Error('invalid document name');
  }
  return documentId;
}
