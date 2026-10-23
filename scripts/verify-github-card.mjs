/** Exercise the real route with controlled upstream responses, without external requests. */
import assert from 'node:assert/strict';
import { register } from 'tsx/esm/api';
const unregister = register();
const originalFetch = globalThis.fetch;
try {
  const { GET } = await import('../app/api/github-card/route.ts');
  const request = query => GET(new Request(`http://localhost/api/github-card?${query}`));
  globalThis.fetch = async () => { throw new Error('Validation must precede network access.'); };
  for (const query of ['repo=../private', 'repo=owner/..', 'repo=owner/repo&repo=other/repo', 'repo=https://invalid.example/repo', 'repo=owner/repo%3Ftoken%3Dsecret']) {
    assert.equal((await request(query)).status, 400);
  }
  console.log('PASS invalid or duplicate repository parameters cannot reach an upstream host');
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'https://api.github.com/repos/Axi404/Axi-Theme');
    assert.equal(options.next.revalidate, 3600);
    return Response.json({ description: 'Axi theme', stargazers_count: 27, forks_count: 8, license: { spdx_id: 'Apache-2.0' }, owner: { avatar_url: 'https://avatars.githubusercontent.com/u/123' }, language: 'Astro', archived: false, secret: 'must not be exposed' });
  };
  let response = await request('repo=Axi404/Axi-Theme');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { description: 'Axi theme', stars: 27, forks: 8, license: 'Apache-2.0', avatarUrl: 'https://avatars.githubusercontent.com/u/123', language: 'Astro', archived: false });
  globalThis.fetch = async () => Response.json({ owner: { avatar_url: 'https://invalid.example/avatar.png' } });
  assert.equal((await (await request('repo=Axi404/Axi-Theme')).json()).avatarUrl, null);
  console.log('PASS public card fields are filtered and avatar hosts are constrained');
  for (const status of [404, 429, 500]) {
    globalThis.fetch = async () => new Response(null, { status });
    assert.equal((await request('repo=Axi404/Axi-Theme')).status, status === 404 ? 404 : 503);
  }
  globalThis.fetch = async () => { throw new Error('Simulated offline connection'); };
  assert.equal((await request('repo=Axi404/Axi-Theme')).status, 503);
  globalThis.fetch = async () => new Response('Invalid JSON', { headers: { 'content-type': 'application/json' } });
  assert.equal((await request('repo=Axi404/Axi-Theme')).status, 503);
  console.log('PASS unavailable, rate-limited and malformed upstream responses have a controlled fallback');
} finally {
  globalThis.fetch = originalFetch;
  unregister();
}
