export const COLLECTION_ID = "6ab98d4249f1bc2c6aefca54";
export const SNAPSHOT_TITLE = "Upcoming Sydney dive dates — schedule snapshot";

// Each note answers a different intent. Keep the existing guide body and its
// booking, suitability and longer-range instructions intact.
export const GUIDES = [
  {
    names: ["How do I see boat dives next month or look two months ahead?"],
    marker: "For a quick answer about scheduled dives within the next 56 days",
    note: `For a quick answer about scheduled dives within the next 56 days, ask Beacon to check <strong>${SNAPSHOT_TITLE}</strong>. It can name listed events and share their exact event links. The dated snapshot does not confirm live places, final prices or whether a planned site will go ahead. Use the calendar periods below to explore farther ahead.`
  },
  {
    names: ["How do I check places, price and book a dive from the calendar?"],
    marker: "Beacon can suggest listed options from",
    note: `For a question such as “What dives are on Saturday?”, Beacon can suggest listed options from <strong>${SNAPSHOT_TITLE}</strong> and share their event links. For “Are there two places?”, open the exact booking page and check that it accepts two divers before checkout. The snapshot has no live capacity or final price.`
  },
  {
    names: ["How do I find a course or freediving date on the dive calendar?"],
    marker: "For near-term course and freediving dates, Beacon can check",
    note: `For near-term course and freediving dates, Beacon can check <strong>${SNAPSHOT_TITLE}</strong> for listed course events and their event links. The snapshot covers up to 56 days. Use the training calendar for later intakes, then check the exact course page for requirements, current places and final price.`
  },
  {
    names: ["Where do I find dive trips and travel dates?"],
    marker: "For near-term trip departures, Beacon can check",
    note: `For near-term trip departures, Beacon can check <strong>${SNAPSHOT_TITLE}</strong> for trips listed within its 56-day window. The Travel Hub shows the wider trip range. Open the exact departure page to confirm the itinerary, requirements, current places and price.`
  },
  {
    names: ["How do I find a dive at a particular Sydney site or on a particular date?"],
    marker: "For a particular site or date in the next 56 days, Beacon can check",
    note: `For a particular site or date in the next 56 days, Beacon can check <strong>${SNAPSHOT_TITLE}</strong> and share links to matching listed events. This does not create an exact-date or site filter on the live calendar. An absent listing does not prove no dive is planned, and a planned site can change.`
  },
  {
    names: [
      "Why are there no matching dives or is the calendar not loading?",
      "Why are no dives showing, or where has an event gone?"
    ],
    marker: "If the calendar fails to load, Beacon can offer the dated",
    note: `If the calendar fails to load, Beacon can offer the dated <strong>${SNAPSHOT_TITLE}</strong> as a guide to listed events in its next 56 days. Follow an event link or ask the team to confirm current details. An event missing from the snapshot is not evidence that a booked dive has been cancelled.`
  },
  {
    names: ["When can I join a shark, seadragon, seal or other marine-life dive?"],
    marker: "For a near-term shark, seadragon or seal-focused date, Beacon can check",
    note: `For a near-term shark, seadragon or seal-focused date, Beacon can check <strong>${SNAPSHOT_TITLE}</strong> for matching listed events and share their event links. The listing does not guarantee a wildlife sighting, the planned site, live places or suitability for a particular diver.`
  }
];

function plainText(value) {
  return String(value || "").replace(/<[^>]*>/g, " ")
    .replace(/&(?:nbsp|#160);/gi, " ")
    .replace(/&(?:amp|#38);/gi, "&")
    .replace(/\s+/g, " ").trim().toLowerCase();
}

function sameList(a, b) {
  return JSON.stringify([...(a || [])].sort()) === JSON.stringify([...(b || [])].sort());
}

export async function updateCalendarGuides(apiKey, snapshotId, fetchImpl = fetch, options = {}) {
  if (!apiKey) throw new Error("HELP_SCOUT_DOCS_API_KEY is not configured");
  if (!/^[a-f0-9]{24}$/i.test(snapshotId || "")) throw new Error("HELP_SCOUT_ARTICLE_ID is not configured");
  const headers = {
    Authorization: `Basic ${Buffer.from(`${apiKey}:X`).toString("base64")}`,
    Accept: "application/json"
  };
  const request = async (path, method = "GET", body) => {
    const response = await fetchImpl(`https://docsapi.helpscout.net/v1${path}`, {
      method,
      headers: { ...headers, ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(30_000)
    });
    if (!response.ok) throw new Error(`Help Scout ${method} ${path} returned HTTP ${response.status}`);
    return method === "GET" ? response.json() : null;
  };

  const listing = (await request(`/collections/${COLLECTION_ID}/articles?pageSize=100`)).articles;
  if (!listing || listing.page !== 1 || listing.pages !== 1 || !Array.isArray(listing.items)) {
    throw new Error("Could not inspect the complete Sydney Dive Calendar collection; no articles changed");
  }
  const snapshot = (await request(`/articles/${snapshotId}`)).article;
  if (snapshot?.id !== snapshotId || snapshot?.collectionId !== COLLECTION_ID ||
      snapshot?.name !== SNAPSHOT_TITLE || snapshot?.status !== "published" || snapshot?.hasDraft) {
    throw new Error("The published schedule snapshot does not match the expected article; no articles changed");
  }

  // Fetch and validate every target before performing any PUT. In particular,
  // an editor's unpublished draft must never be overwritten by this updater.
  const plans = [];
  for (const guide of GUIDES) {
    const matches = listing.items.filter((item) => guide.names.includes(item.name));
    if (matches.length !== 1) {
      throw new Error(`Expected exactly one article for ${guide.names[0]}; no articles changed`);
    }
    const ref = matches[0];
    const current = (await request(`/articles/${ref.id}`)).article;
    if (current?.id !== ref.id || current?.collectionId !== COLLECTION_ID ||
        current?.name !== ref.name || current?.status !== "published" || current?.hasDraft ||
        typeof current?.text !== "string" || current.text.length < 80 ||
        !Array.isArray(current.related)) {
      throw new Error(`${ref.name}: identity, publication, draft or body check failed; no articles changed`);
    }
    const needsText = !plainText(current.text).includes(guide.marker.toLowerCase());
    const needsRelated = !current.related.includes(snapshotId);
    const nextText = needsText ? `<p>${guide.note}</p>\n${current.text}` : current.text;
    const nextRelated = needsRelated ? [...current.related, snapshotId] : current.related;
    plans.push({ guide, current, needsText, needsRelated, nextText, nextRelated });
  }

  const summary = plans.map(({ current, needsText, needsRelated }) => ({
    title: current.name, change: needsText || needsRelated ? "update" : "unchanged"
  }));
  if (options.dryRun) return { status: "dry-run", articles: summary };

  for (const plan of plans) {
    if (!plan.needsText && !plan.needsRelated) continue;
    const payload = {
      ...(plan.needsText ? { text: plan.nextText } : {}),
      ...(plan.needsRelated ? { related: plan.nextRelated } : {})
    };
    // Catch an editor's change between the initial inspection and this write.
    const latest = (await request(`/articles/${plan.current.id}`)).article;
    if (latest?.name !== plan.current.name || latest?.collectionId !== COLLECTION_ID ||
        latest?.status !== "published" || latest?.hasDraft ||
        latest?.text !== plan.current.text ||
        !sameList(latest?.related, plan.current.related) ||
        !sameList(latest?.categories, plan.current.categories) ||
        !sameList(latest?.keywords, plan.current.keywords)) {
      throw new Error(`${plan.current.name}: changed since inspection; inspect the article before retrying`);
    }
    await request(`/articles/${plan.current.id}`, "PUT", payload);
    const verified = (await request(`/articles/${plan.current.id}`)).article;
    if (verified?.id !== plan.current.id || verified?.collectionId !== COLLECTION_ID ||
        verified?.name !== plan.current.name || verified?.status !== "published" || verified?.hasDraft ||
        plainText(verified?.text) !== plainText(plan.nextText) ||
        !sameList(verified.related, plan.nextRelated) ||
        !sameList(verified.categories, plan.current.categories) ||
        !sameList(verified.keywords, plan.current.keywords)) {
      throw new Error(`${plan.current.name}: published readback failed; inspect this article before retrying`);
    }
  }
  return { status: "updated", articles: summary };
}
