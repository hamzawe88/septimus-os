import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';

import { validateDocumentId, verifyJWT } from './auth.js';

function sign(claims, secret, alg = 'HS256') {
  const header = Buffer.from(JSON.stringify({ alg, typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${signature}`;
}

test('verifyJWT accepts a valid HS256 identity', () => {
  const token = sign({ sub: 'user-1', workspace_id: 'workspace-1', exp: 2_000 }, 'secret');
  assert.deepEqual(verifyJWT(token, 'secret', 1_000), { userId: 'user-1', workspaceId: 'workspace-1' });
});

test('verifyJWT rejects an expired or forged identity', () => {
  const expired = sign({ sub: 'user-1', workspace_id: 'workspace-1', exp: 10 }, 'secret');
  assert.throws(() => verifyJWT(expired, 'secret', 11), /claims/);
  assert.throws(() => verifyJWT(expired, 'wrong-secret', 1), /signature/);
});

test('validateDocumentId requires a canonical UUID', () => {
  assert.equal(validateDocumentId('550e8400-e29b-41d4-a716-446655440000'), '550e8400-e29b-41d4-a716-446655440000');
  assert.throws(() => validateDocumentId('../../etc/passwd'), /invalid document/);
});
