import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import {
  BOAT_COLLECTION_NAME, SHORE_COLLECTION_ID, SCHEDULE_TITLE,
  bootstrapBoatDocs, makeDocsClient, verifyPack
} from "../src/helpscout-boat-bootstrap.mjs";

const SITE_ID = "111111111111111111111111";
const BOAT_ID = "222222222222222222222222";
const ARTICLE_ID = i => `${"a".repeat(23)}${i.toString(16)}`;
const source = await fs.readFile(new URL("../docs/Boat_Diving_Help_Scout_Docs_2026-09-29.md", import.meta.url));
const payload = JSON.parse(await fs.readFile(new URL("../data/helpscout-boat-articles.json", import.meta.url), "utf8"));
const articles = verifyPack(payload, source);

class FakeDocs {
  constructor({ collection = false, refs = [] } = {}) {
    this.collection = collection;
    this.articles = new Map(refs.map(article => [article.id, structuredClone(article)]));
    this.calls = [];
  }

  request = async (method, path, body) => {
    this.calls.push({ method, path, body });
    if (method === "GET" && path === `/collections/${SHORE_COLLECTION_ID}`) {
      return { collection: { id: SHORE_COLLECTION_ID, siteId: SITE_ID,
        visibility: "private", name: "Shore Diving" } };
    }
    if (method === "GET" && path === `/sites/${SITE_ID}`) {
      return { site: { id: SITE_ID, status: "active" } };
    }
    if (method === "GET" && path.startsWith("/collections?")) {
      return { collections: { page: 1, pages: 1,
        items: this.collection ? [{ id: BOAT_ID, siteId: SITE_ID,
          visibility: "private", name: BOAT_COLLECTION_NAME }] : [] } };
    }
    if (method === "POST" && path === "/collections") {
      assert.equal(body.siteId, SITE_ID);
      assert.equal(body.visibility, "private");
      this.collection = true;
      return BOAT_ID;
    }
    if (method === "GET" && path === `/collections/${BOAT_ID}`) {
      return { collection: { id: BOAT_ID, siteId: SITE_ID,
        visibility: "private", name: BOAT_COLLECTION_NAME } };
    }
    if (method === "GET" && path.startsWith(`/collections/${BOAT_ID}/articles?`)) {
      return { articles: { page: 1, pages: 1,
        items: [...this.articles.values()].map(({ id, name }) => ({ id, name })) } };
    }
    if (method === "POST" && path === "/articles") {
      const id = ARTICLE_ID(this.articles.size + 1);
      this.articles.set(id, { id, ...structuredClone(body), hasDraft: false });
      return id;
    }
    const articleId = path.match(/^\/articles\/([0-9a-f]{24})$/)?.[1];
    if (articleId && method === "GET") {
      const article = this.articles.get(articleId);
      assert.ok(article);
      return { article: structuredClone(article) };
    }
    if (articleId && method === "PUT") {
      const article = this.articles.get(articleId);
      assert.ok(article);
      Object.assign(article, structuredClone(body));
      return null;
    }
    throw new Error(`Unexpected mocked request ${method} ${path}`);
  };
}

test("reviewed pack compiles to seven distinct HTML articles with searchable keyword arrays", () => {
  assert.equal(articles.length, 7);
  assert.equal(articles.reduce((count, article) => count + article.keywords.length, 0), 126);
  assert.equal(articles.filter(a => a.name === SCHEDULE_TITLE).length, 1);
  assert.ok(articles.every(a => a.text.startsWith("<h2") && a.keywords.length >= 10));
  assert.ok(articles.some(a => a.keywords.includes("is there a toilet on the dive boat")));
  assert.ok(articles.some(a => a.keywords.includes("are there showers on the dive boat")));
  assert.ok(articles.some(a => a.keywords.includes("get seasick on a dive boat")));
  assert.ok(!articles.some(a => a.text.includes("# Implementation notes")));
  const schedule = articles.find(a => a.name === SCHEDULE_TITLE).text;
  assert.match(schedule, /The schedule is being refreshed/);
  assert.doesNotMatch(schedule, /<table|Schedule checked 29 September/);
  assert.throws(() => verifyPack(payload, Buffer.from("changed source")), /source and compiled articles differ/);
});

test("creates a private collection and seven published articles, then verifies each readback", async () => {
  const docs = new FakeDocs();
  const target = await bootstrapBoatDocs({ request: docs.request, articles });
  assert.deepEqual(target, {
    articleId: ARTICLE_ID(2), collectionId: BOAT_ID,
    articleTitle: SCHEDULE_TITLE, siteId: SITE_ID
  });
  assert.equal(docs.calls.filter(c => c.method === "POST" && c.path === "/collections").length, 1);
  const creates = docs.calls.filter(c => c.method === "POST" && c.path === "/articles");
  assert.equal(creates.length, 7);
  for (const create of creates) {
    assert.equal(create.body.collectionId, BOAT_ID);
    assert.equal(create.body.status, "published");
    assert.ok(Array.isArray(create.body.keywords));
    assert.ok(create.body.text.includes("<h2"));
  }
});

test("repeated bootstrap keeps the scheduled article's newer daily snapshot", async () => {
  const docs = new FakeDocs();
  const target = await bootstrapBoatDocs({ request: docs.request, articles });
  const schedule = docs.articles.get(target.articleId);
  schedule.text = `<h2>${SCHEDULE_TITLE}</h2><p>Updated today.</p><!-- ABYSS_BOAT_SNAPSHOT_V1 -->`;
  schedule.keywords.reverse(); // Help Scout may reorder keywords without changing membership.
  docs.calls = [];
  assert.deepEqual(await bootstrapBoatDocs({ request: docs.request, articles, existingTarget: target }), target);
  assert.equal(schedule.text.includes("Updated today"), true);
  assert.equal(docs.calls.filter(c => c.method === "POST" || c.method === "PUT").length, 0);
});

test("staff edits to an evergreen article stop a rerun before any article write", async () => {
  const docs = new FakeDocs();
  const target = await bootstrapBoatDocs({ request: docs.request, articles });
  docs.articles.get(ARTICLE_ID(5)).text += "<p>Staff clarification.</p>";
  docs.calls = [];
  await assert.rejects(bootstrapBoatDocs({ request: docs.request, articles, existingTarget: target }),
    /body readback mismatch/);
  assert.equal(docs.calls.filter(c => c.method === "POST" || c.method === "PUT").length, 0);
});

test("a changed keyword strategy stops a rerun before any article write", async () => {
  const docs = new FakeDocs();
  const target = await bootstrapBoatDocs({ request: docs.request, articles });
  docs.articles.get(target.articleId).keywords.push("new staff keyword");
  docs.calls = [];
  await assert.rejects(bootstrapBoatDocs({ request: docs.request, articles, existingTarget: target }),
    /Keyword readback mismatch/);
  assert.equal(docs.calls.filter(c => c.method === "POST" || c.method === "PUT").length, 0);
});

test("preflight rejects a title/slug collision before changing any article", async () => {
  const conflicting = { id: ARTICLE_ID(1), collectionId: BOAT_ID,
    name: articles[6].name, slug: "wrong-slug", status: "published", hasDraft: false,
    keywords: articles[6].keywords, text: articles[6].text };
  const docs = new FakeDocs({ collection: true, refs: [conflicting] });
  await assert.rejects(bootstrapBoatDocs({ request: docs.request, articles }), /title\/slug collision/);
  assert.equal(docs.calls.filter(c => c.method === "POST" || c.method === "PUT").length, 0);
});

test("an existing target pointing elsewhere fails before article changes", async () => {
  const docs = new FakeDocs({ collection: true });
  await assert.rejects(bootstrapBoatDocs({ request: docs.request, articles, existingTarget: {
    articleId: ARTICLE_ID(2), collectionId: "f".repeat(24),
    articleTitle: SCHEDULE_TITLE, siteId: SITE_ID
  } }), /another collection or site/);
  assert.equal(docs.calls.filter(c => c.path === "/articles" || c.method === "PUT").length, 0);
});

test("API client uses Basic authentication and exposes only HTTP status on failure", async () => {
  const request = makeDocsClient("test-key", async (url, options) => {
    assert.equal(url, "https://docsapi.helpscout.net/v1/collections/example");
    assert.equal(options.headers.Authorization,
      `Basic ${Buffer.from("test-key:X").toString("base64")}`);
    return { ok: false, status: 403 };
  });
  await assert.rejects(request("GET", "/collections/example"), /HTTP 403/);
});
