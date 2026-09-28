import test from "node:test";
import assert from "node:assert/strict";
import {
  COLLECTION_ID, GUIDES, SNAPSHOT_TITLE, updateCalendarGuides
} from "../src/calendar-guide-updates.mjs";

const snapshotId = "6ab9ce4e49f1bc2c6aefca6f";
const guideId = (index) => index.toString(16).padStart(24, "0");

function fixture() {
  const snapshot = {
    id: snapshotId, collectionId: COLLECTION_ID, name: SNAPSHOT_TITLE,
    status: "published", hasDraft: false, text: "Schedule snapshot checked today"
  };
  const articles = GUIDES.map((guide, index) => ({
    id: guideId(index + 1), collectionId: COLLECTION_ID, name: guide.names[0],
    status: "published", hasDraft: false,
    text: `<h2>Original guidance ${index + 1}</h2><p>Check the booking page for the current information. These instructions should remain unchanged.</p>`,
    categories: ["category-a"], related: ["existing-related"],
    keywords: ["existing keyword"]
  }));
  const relatedFallback = new Map();
  const calls = [];
  const fetchImpl = async (url, options) => {
    const parsed = new URL(url);
    const path = parsed.pathname;
    const method = options.method;
    calls.push({ method, path, body: options.body && JSON.parse(options.body) });
    if (path === `/v1/collections/${COLLECTION_ID}/articles`) {
      return Response.json({ articles: {
        page: 1, pages: 1, count: articles.length,
        items: articles.map(({ id, name }) => ({ id, name }))
      } });
    }
    if (path.endsWith("/related")) {
      const id = path.split("/").at(-2);
      const article = articles.find((item) => item.id === id);
      const ids = article?.related ?? relatedFallback.get(id) ?? [];
      return Response.json({ articles: {
        page: 1, pages: 1, count: ids.length,
        items: ids.map((id) => ({ id }))
      } });
    }
    const id = path.split("/").at(-1);
    const article = id === snapshotId ? snapshot : articles.find((item) => item.id === id);
    if (!article) return new Response("missing", { status: 404 });
    if (method === "GET") return Response.json({ article: structuredClone(article) });
    if (method === "PUT") {
      Object.assign(article, JSON.parse(options.body));
      return new Response(null, { status: 200 });
    }
    throw new Error(`Unexpected ${method}`);
  };
  return { snapshot, articles, relatedFallback, calls, fetchImpl };
}

test("dry run inspects seven live articles without changing them", async () => {
  const state = fixture();
  const result = await updateCalendarGuides("test-key", snapshotId, state.fetchImpl, { dryRun: true });
  assert.equal(result.status, "dry-run");
  assert.equal(result.articles.length, 7);
  assert.equal(result.articles.filter((item) => item.change === "update").length, 7);
  assert.equal(state.calls.filter((call) => call.method === "PUT").length, 0);
});

test("live update preserves article body and metadata, adds the note and related snapshot once", async () => {
  const state = fixture();
  const originals = state.articles.map((item) => structuredClone(item));
  const result = await updateCalendarGuides("test-key", snapshotId, state.fetchImpl);
  assert.equal(result.status, "updated");
  const puts = state.calls.filter((call) => call.method === "PUT");
  assert.equal(puts.length, 7);
  for (let index = 0; index < state.articles.length; index++) {
    const now = state.articles[index];
    const original = originals[index];
    assert.ok(now.text.endsWith(original.text));
    assert.ok(now.text.includes(SNAPSHOT_TITLE));
    assert.deepEqual(now.related, ["existing-related", snapshotId]);
    assert.deepEqual(now.categories, original.categories);
    assert.deepEqual(now.keywords, original.keywords);
    assert.deepEqual(Object.keys(puts[index].body).sort(), ["related", "text"]);
  }
  state.calls.length = 0;
  const again = await updateCalendarGuides("test-key", snapshotId, state.fetchImpl);
  assert.equal(again.articles.filter((item) => item.change === "unchanged").length, 7);
  assert.equal(state.calls.filter((call) => call.method === "PUT").length, 0);
});

test("an unpublished draft in any target blocks the whole batch before a write", async () => {
  const state = fixture();
  state.articles.at(-1).hasDraft = true;
  await assert.rejects(
    updateCalendarGuides("test-key", snapshotId, state.fetchImpl),
    /has an unpublished draft/
  );
  assert.equal(state.calls.filter((call) => call.method === "PUT").length, 0);
});

test("missing related field is read separately before preserving existing links", async () => {
  const state = fixture();
  const first = state.articles[0];
  state.relatedFallback.set(first.id, ["existing-related"]);
  delete first.related;
  await updateCalendarGuides("test-key", snapshotId, state.fetchImpl);
  assert.deepEqual(first.related, ["existing-related", snapshotId]);
  assert.ok(state.calls.some((call) => call.path === `/v1/articles/${first.id}/related`));
});

test("a mismatched snapshot identity or missing guide blocks all writes", async () => {
  const state = fixture();
  state.snapshot.name = "Unexpected title";
  await assert.rejects(updateCalendarGuides("test-key", snapshotId, state.fetchImpl), /published schedule snapshot/);
  assert.equal(state.calls.filter((call) => call.method === "PUT").length, 0);

  state.snapshot.name = SNAPSHOT_TITLE;
  state.articles.pop();
  await assert.rejects(updateCalendarGuides("test-key", snapshotId, state.fetchImpl), /Expected exactly one article/);
  assert.equal(state.calls.filter((call) => call.method === "PUT").length, 0);
});
