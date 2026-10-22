/**
 * Local integration checks for the journal API. This intentionally refuses
 * production URLs. Start the local Next.js server with a disposable DATA_DIR and
 * ADMIN_SETUP_TOKEN_HASH set to SHA256(JOURNAL_TEST_SETUP_TOKEN) in the
 * server environment. Pass the same test token to this script, then run:
 *   node scripts/verify-journal.mjs [http://127.0.0.1:3000]
 * Only disposable posts created by this run are removed. Settings are restored
 * in finally; a tiny uploaded QA image is retained for manual storage inspection.
 * Set JOURNAL_TEST_SETUP_TOKEN to a fresh random token for each isolated run.
 * Passwords are generated at runtime unless supplied in the test environment.
 * Use only with an isolated disposable local instance. Loopback URL checks
 * cannot detect SSH tunnels forwarding to a production server.
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

const base = new URL(process.argv[2] || "http://127.0.0.1:3000");
assert.equal(base.protocol, "http:", "Verification is restricted to local HTTP previews.");
assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(base.hostname), "Refusing a non-loopback target.");
assert.equal(base.pathname, "/", "Supply the preview origin without a path.");
assert.ok(!base.username && !base.password && !base.search && !base.hash, "Supply only the local preview origin.");

const origin = base.origin;
const LOCAL_SETUP_TOKEN = process.env.JOURNAL_TEST_SETUP_TOKEN || "";
assert.match(LOCAL_SETUP_TOKEN, /^[A-Za-z0-9_-]{32,256}$/, "Supply JOURNAL_TEST_SETUP_TOKEN for a disposable local test server.");
const LOCAL_USERNAME = process.env.JOURNAL_TEST_USERNAME || `qa-${randomBytes(6).toString("hex")}`;
const LOCAL_PASSWORD = process.env.JOURNAL_TEST_PASSWORD || randomBytes(24).toString("base64url");
const CHANGED_PASSWORD = randomBytes(24).toString("base64url");
const runId = `qa-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const disposableIds = new Set();
let cookie = "";
let originalSettings;
let settingsModified = false;
let uploadUrl = "";
let checks = 0;

async function request(path, { authenticated = false, json, form, originHeader = origin, headers = {}, ...options } = {}) {
  const requestHeaders = new Headers(headers);
  if (authenticated) {
    assert.ok(cookie, "Local authentication cookie is missing.");
    requestHeaders.set("cookie", cookie);
  }
  if (options.method && !["GET", "HEAD"].includes(options.method)) {
    if (originHeader !== null) requestHeaders.set("origin", originHeader);
  }
  if (json !== undefined) requestHeaders.set("content-type", "application/json");
  return fetch(new URL(path, base), {
    ...options, headers: requestHeaders, redirect: "manual",
    ...(json !== undefined ? { body: JSON.stringify(json) } : {}),
    ...(form ? { body: form } : {}),
    signal: AbortSignal.timeout(90_000),
  });
}

async function readJson(response, status, label) {
  const text = await response.text();
  assert.equal(response.status, status, `${label}: expected HTTP ${status}, got ${response.status}: ${text.slice(0, 500)}`);
  try { return JSON.parse(text); }
  catch { assert.fail(`${label}: expected JSON: ${text.slice(0, 500)}`); }
}

function passed(label) {
  checks++;
  console.log(`PASS ${label}`);
}

function sessionCookie(response, label) {
  const values = response.headers.getSetCookie();
  const value = values.find((item) => /(?:^|;)\s*(?:__Host-)?journal[_-]session=/i.test(item)) ?? values.find((item) => /HttpOnly/i.test(item));
  assert.ok(value, `${label}: a session cookie must be set.`);
  assert.match(value, /;\s*HttpOnly(?:;|$)/i, `${label}: HttpOnly is required.`);
  assert.match(value, /;\s*SameSite=Strict(?:;|$)/i, `${label}: SameSite=Strict is required.`);
  assert.match(value, /;\s*Path=\/(?:;|$)/i, `${label}: cookie path must be root.`);
  assert.ok(!/;\s*Secure(?:;|$)/i.test(value), `${label}: loopback HTTP uses the local non-Secure cookie.`);
  const pair = value.split(";", 1)[0];
  assert.ok(pair.split("=")[1], `${label}: session token must not be empty.`);
  return pair;
}

async function login(password = LOCAL_PASSWORD, username = LOCAL_USERNAME) {
  const response = await request("/api/auth/login", { method: "POST", json: { username, password } });
  const data = await readJson(response, 200, "password login");
  const nextCookie = sessionCookie(response, "password login");
  assert.equal(data.session.isAdmin, true);
  assert.equal(data.session.username, LOCAL_USERNAME);
  return nextCookie;
}

async function assertAnonymousCookie(value, label) {
  const session = await readJson(await request("/api/session", { headers: { cookie: value } }), 200, label);
  assert.equal(session.authenticated, false, label);
  assert.equal(session.isAdmin, false, label);
  assert.equal(session.username, null, label);
}

const draftPayload = {
  title: `${runId} disposable draft`, slug: runId,
  excerpt: "Disposable local integration verification content.",
  content: `## Verification\n\n${runId} body marker.\n\n**Markdown** remains readable.`,
  category: "测试", tags: ["local-qa"], kind: "article", status: "draft", coverImage: "",
};

try {
  const publicPosts = await readJson(await request("/api/posts"), 200, "anonymous published list");
  assert.ok(Array.isArray(publicPosts.posts));
  assert.ok(publicPosts.posts.every((post) => post.status === "published"));
  const publicSettings = await readJson(await request("/api/settings"), 200, "anonymous settings");
  assert.ok(publicSettings.settings?.name);
  passed("anonymous visitors can read published posts and public settings");

  const anonymousSession = await readJson(await request("/api/session"), 200, "anonymous session");
  assert.equal(anonymousSession.authenticated, false);
  assert.equal(anonymousSession.isAdmin, false);
  assert.equal(anonymousSession.username, null);
  assert.equal(typeof anonymousSession.setupRequired, "boolean");
  assert.ok(!("email" in anonymousSession), "Legacy identity fields must not be returned.");
  await readJson(await request("/api/posts?scope=all"), 401, "anonymous admin list");
  await readJson(await request("/api/posts", { method: "POST", json: draftPayload }), 401, "anonymous post write");
  await readJson(await request("/api/settings", { method: "PUT", json: publicSettings.settings }), 401, "anonymous settings write");
  passed("anonymous visitors cannot write or inspect draft lists");

  const spoofedSession = await readJson(await request("/api/session", {
    headers: { "oai-authenticated-user-id": "local_seedy", "oai-authenticated-user-email": "seedy@sites.test" },
  }), 200, "spoofed identity headers");
  assert.equal(spoofedSession.authenticated, false);
  assert.equal(spoofedSession.isAdmin, false);
  passed("caller-supplied identity headers cannot authorize an administrator");

  await assertAnonymousCookie("journal_session=invalid-forged-token", "invalid session token");
  const loginBody = { username: LOCAL_USERNAME, password: LOCAL_PASSWORD };
  assert.equal((await request("/api/auth/login", { method: "POST", json: loginBody, originHeader: "https://untrusted.example" })).status, 403);
  assert.equal((await request("/api/auth/login", { method: "POST", json: loginBody, originHeader: null })).status, 403);
  passed("login requires a same-origin request and rejects forged cookies");

  if (anonymousSession.setupRequired) {
    await readJson(await request("/api/auth/setup", { method: "POST", json: { token: "wrong-local-bootstrap-token-2026-invalid", ...loginBody } }), 403, "invalid setup token");
    await readJson(await request("/api/auth/setup", { method: "POST", json: { token: LOCAL_SETUP_TOKEN, ...loginBody, password: "short" } }), 400, "short setup password");
    const setup = await request("/api/auth/setup", { method: "POST", json: { token: LOCAL_SETUP_TOKEN, ...loginBody } });
    const initialized = await readJson(setup, 201, "administrator setup");
    cookie = sessionCookie(setup, "administrator setup");
    assert.equal(initialized.session.username, LOCAL_USERNAME);
    assert.equal(initialized.session.setupRequired, false);
    passed("a valid one-time setup token creates the local owner with a safe session cookie");
  } else {
    cookie = await login();
    passed("the configured local owner can sign in with an independent password");
  }
  await readJson(await request("/api/auth/setup", { method: "POST", json: { token: LOCAL_SETUP_TOKEN, ...loginBody } }), 409, "repeat setup");
  await readJson(await request("/api/auth/login", { method: "POST", json: { ...loginBody, password: "wrong-local-password-2026!" } }), 401, "wrong login password");
  cookie = await login(LOCAL_PASSWORD, LOCAL_USERNAME.toUpperCase());
  const session = await readJson(await request("/api/session", { authenticated: true }), 200, "admin session");
  assert.equal(session.authenticated, true);
  assert.equal(session.isAdmin, true);
  assert.equal(session.username, LOCAL_USERNAME);
  assert.equal(session.setupRequired, false);
  await assertAnonymousCookie(`${cookie.split("=", 1)[0]}=forged-token-with-the-real-cookie-name`, "forged session value");
  passed("setup cannot be reused; wrong passwords fail and the owner username is normalized");

  const created = await readJson(await request("/api/posts", { authenticated: true, method: "POST", json: draftPayload }), 201, "create draft");
  const draft = created.post;
  assert.ok(draft.id);
  disposableIds.add(draft.id);
  assert.equal(draft.status, "draft");
  assert.equal(draft.publishedAt, "");
  assert.ok(draft.createdAt && draft.updatedAt);
  const adminPosts = await readJson(await request(`/api/posts?scope=all&q=${encodeURIComponent(runId)}`, { authenticated: true }), 200, "admin draft list");
  assert.ok(adminPosts.posts.some((post) => post.id === draft.id && post.status === "draft"));
  const afterDraft = await readJson(await request("/api/posts"), 200, "public after draft");
  assert.ok(!afterDraft.posts.some((post) => post.id === draft.id));
  const privateDraft = await request(`/posts/${draft.slug}`);
  assert.equal(privateDraft.status, 404, "Public article URLs must hide drafts.");
  passed("drafts persist for the administrator and stay hidden from public lists and URLs");

  const publishedPayload = { ...draftPayload, title: `${runId} published title`, status: "published" };
  const updated = await readJson(await request(`/api/posts/${draft.id}`, { authenticated: true, method: "PUT", json: publishedPayload }), 200, "publish draft");
  assert.equal(updated.post.status, "published");
  assert.ok(updated.post.publishedAt);
  assert.equal(updated.post.id, draft.id);
  const afterPublish = await readJson(await request("/api/posts"), 200, "public after publish");
  assert.ok(afterPublish.posts.some((post) => post.id === draft.id && post.title === publishedPayload.title));
  const article = await request(`/posts/${draft.slug}`);
  assert.equal(article.status, 200, "Published article page should load.");
  assert.ok((await article.text()).includes(`${runId} body marker`), "Published article page should contain the stored body.");
  passed("publishing updates the public API and rendered article page");

  await readJson(await request("/api/posts", { authenticated: true, method: "POST", json: publishedPayload }), 409, "duplicate slug");
  await readJson(await request("/api/posts", { authenticated: true, method: "POST", json: { ...draftPayload, slug: `${runId}-invalid`, title: "" } }), 400, "invalid title");
  await readJson(await request("/api/posts", { authenticated: true, method: "POST", json: { ...draftPayload, slug: "../invalid" } }), 400, "invalid slug");
  passed("duplicate URLs and invalid content are rejected with clear validation responses");

  // The development framework may reject a hostile Origin before the API runs,
  // with its own plain-text response. The security contract is the 403 status.
  assert.equal((await request(`/api/posts/${draft.id}`, { authenticated: true, method: "PUT", json: draftPayload, originHeader: "https://untrusted.example" })).status, 403, "Cross-origin writes must be rejected.");
  await readJson(await request(`/api/posts/${draft.id}`, { authenticated: true, method: "DELETE", originHeader: null }), 403, "missing-origin write");
  passed("authenticated cross-origin and missing-origin mutations are rejected");

  await readJson(await request(`/api/posts/${draft.id}`, { authenticated: true, method: "PUT", json: draftPayload }), 200, "return to draft");
  const afterUnpublish = await readJson(await request("/api/posts"), 200, "public after unpublish");
  assert.ok(!afterUnpublish.posts.some((post) => post.id === draft.id));
  assert.equal((await request(`/posts/${draft.slug}`)).status, 404);
  passed("returning a post to draft removes it from public lists and article URLs");

  const note = await readJson(await request("/api/posts", {
    authenticated: true, method: "POST",
    json: { ...publishedPayload, slug: `${runId}-note`, title: `${runId} note`, kind: "note" },
  }), 201, "publish note");
  disposableIds.add(note.post.id);
  const notes = await readJson(await request("/api/posts?kind=note"), 200, "note filter");
  assert.ok(notes.posts.some((post) => post.id === note.post.id));
  assert.ok(notes.posts.every((post) => post.kind === "note" && post.status === "published"));
  passed("published notes persist and support kind filtering");

  originalSettings = (await readJson(await request("/api/settings"), 200, "settings before modification")).settings;
  const newSettings = { ...originalSettings, bio: `Local verification ${runId}` };
  await readJson(await request("/api/settings", { authenticated: true, method: "PUT", json: newSettings }), 200, "update settings");
  settingsModified = true;
  const changedSettings = (await readJson(await request("/api/settings"), 200, "settings after modification")).settings;
  assert.equal(changedSettings.bio, newSettings.bio);
  await readJson(await request("/api/settings", { authenticated: true, method: "PUT", json: originalSettings }), 200, "restore settings");
  settingsModified = false;
  passed("settings persist publicly and the original values are restored");

  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=", "base64");
  const imageForm = new FormData();
  imageForm.set("file", new File([png], `${runId}.png`, { type: "image/png" }));
  const uploaded = await readJson(await request("/api/upload", { authenticated: true, method: "POST", form: imageForm }), 201, "upload PNG");
  uploadUrl = uploaded.url;
  assert.match(uploadUrl, /^\/media\/[a-f0-9-]{36}\.png$/);
  const image = await request(uploadUrl);
  assert.equal(image.status, 200);
  assert.equal(image.headers.get("content-type"), "image/png");
  assert.equal(image.headers.get("x-content-type-options"), "nosniff");
  assert.deepEqual(Buffer.from(await image.arrayBuffer()), png);
  const cachedImage = await request(uploadUrl, { headers: { "if-none-match": image.headers.get("etag") } });
  assert.equal(cachedImage.status, 304);
  passed("PNG uploads survive local file storage and round-trip byte-for-byte with safe media headers");

  const svg = new FormData();
  svg.set("file", new File(["<svg xmlns='http://www.w3.org/2000/svg'></svg>"], "unsafe.svg", { type: "image/svg+xml" }));
  await readJson(await request("/api/upload", { authenticated: true, method: "POST", form: svg }), 415, "reject SVG");
  const disguised = new FormData();
  disguised.set("file", new File(["<svg xmlns='http://www.w3.org/2000/svg'></svg>"], "disguised.png", { type: "image/png" }));
  await readJson(await request("/api/upload", { authenticated: true, method: "POST", form: disguised }), 415, "reject disguised image");
  passed("SVG uploads and false image MIME types are rejected");
} finally {
  const cleanupErrors = [];
  if (settingsModified && originalSettings && cookie) {
    try {
      await readJson(await request("/api/settings", { authenticated: true, method: "PUT", json: originalSettings }), 200, "finally restore settings");
    } catch (error) { cleanupErrors.push(error); }
  }
  for (const id of disposableIds) {
    try {
      await readJson(await request(`/api/posts/${id}`, { authenticated: true, method: "DELETE" }), 200, "delete disposable post");
      const deleted = await request(`/api/posts/${id}`, { authenticated: true });
      assert.equal(deleted.status, 404, "Deleted disposable post should be absent.");
    } catch (error) { cleanupErrors.push(error); }
  }
  if (uploadUrl) console.log(`Retained local QA asset: ${uploadUrl}`);
  if (cleanupErrors.length) throw new AggregateError(cleanupErrors, "Local verification cleanup failed; inspect the disposable QA records.");
  if (disposableIds.size) console.log(`Cleaned up ${disposableIds.size} disposable QA posts.`);
}

let activePassword = LOCAL_PASSWORD;
try {
  const oldCookieA = cookie;
  const oldCookieB = await login();
  assert.notEqual(oldCookieA, oldCookieB, "Every login must issue a fresh opaque token.");
  await readJson(await request("/api/auth/password", { authenticated: true, method: "POST", json: { currentPassword: "wrong-password", newPassword: CHANGED_PASSWORD } }), 401, "wrong current password");
  const changed = await request("/api/auth/password", { authenticated: true, method: "POST", json: { currentPassword: LOCAL_PASSWORD, newPassword: CHANGED_PASSWORD } });
  const nextCookie = sessionCookie(changed, "password change");
  await readJson(changed, 200, "password change");
  cookie = nextCookie;
  activePassword = CHANGED_PASSWORD;
  await assertAnonymousCookie(oldCookieA, "first old session revoked");
  await assertAnonymousCookie(oldCookieB, "second old session revoked");
  await readJson(await request("/api/posts?scope=all", { headers: { cookie: oldCookieB } }), 401, "revoked session cannot read drafts");
  const changedSession = await readJson(await request("/api/session", { authenticated: true }), 200, "replacement session after password change");
  assert.equal(changedSession.isAdmin, true);
  passed("password changes revoke every earlier session and issue one replacement session");

  await readJson(await request("/api/auth/login", { method: "POST", json: { username: LOCAL_USERNAME, password: LOCAL_PASSWORD } }), 401, "old password no longer works");
  cookie = await login(CHANGED_PASSWORD);
  const restored = await request("/api/auth/password", { authenticated: true, method: "POST", json: { currentPassword: CHANGED_PASSWORD, newPassword: LOCAL_PASSWORD } });
  const restoredCookie = sessionCookie(restored, "restore local test password");
  await readJson(restored, 200, "restore local test password");
  cookie = restoredCookie;
  activePassword = LOCAL_PASSWORD;
  await assertAnonymousCookie(nextCookie, "replacement session revoked by next password change");
  passed("new passwords work, old passwords fail, and the local test password is restored");

  const loggedOutCookie = cookie;
  const logout = await request("/api/auth/logout", { authenticated: true, method: "POST", json: {} });
  const logoutData = await readJson(logout, 200, "logout");
  assert.equal(logoutData.ok, true);
  assert.ok(logout.headers.getSetCookie().some((value) => /Max-Age=0|Expires=Thu, 01 Jan 1970/i.test(value)), "Logout should clear the browser cookie.");
  await assertAnonymousCookie(loggedOutCookie, "logged-out session revoked");
  passed("logout clears the cookie and revokes its server-side session");
} finally {
  if (activePassword !== LOCAL_PASSWORD) {
    cookie = await login(activePassword);
    const response = await request("/api/auth/password", { authenticated: true, method: "POST", json: { currentPassword: activePassword, newPassword: LOCAL_PASSWORD } });
    const restoredCookie = sessionCookie(response, "finally restore local test password");
    await readJson(response, 200, "finally restore local test password");
    cookie = restoredCookie;
    await readJson(await request("/api/auth/logout", { authenticated: true, method: "POST", json: {} }), 200, "finally logout");
  }
}

console.log(`Local integration verification passed: ${checks} checks.`);
