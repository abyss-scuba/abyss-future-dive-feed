#!/usr/bin/env node
import fs from "node:fs/promises";
import { validateFeed } from "./validate-feed.mjs";

const feedPath = process.argv[2] || "data/future-dives.json";
const feed = JSON.parse(await fs.readFile(feedPath, "utf8"));
const verification = validateFeed(feed);

const categories = {};
const sources = {};
for (const event of feed.events || []) {
  categories[event.primaryCategory] = (categories[event.primaryCategory] || 0) + 1;
  sources[event.source] = (sources[event.source] || 0) + 1;
}

console.log(`Generated: ${feed.generatedAt}`);
console.log(`Validation: ${verification.valid ? "valid" : "NOT VERIFIED"}`);
console.log(`${verification.valid ? "Reliable checked" : "Declared, unverified"} window: ${feed.window?.startsOn} to ${feed.window?.publicSearchThrough}`);
console.log(`Latest retained listing: ${feed.window && "latestListedDate" in feed.window ? (feed.window.latestListedDate || "none") : "not supplied"}`);
console.log(`Later listings: ${(feed.events || []).filter(event => event.beyondReliableHorizon).length}`);
console.log(`Events: ${feed.eventCount}`);
console.log("By category:", categories);
console.log("By preferred source:", sources);
console.log("Source health:");
for (const [name, source] of Object.entries(feed.sources || {})) {
  console.log(
    `  ${name}: ${source.status}, ${source.rawEventCount} events, ${source.firstDate || "none"} → ${source.lastDate || "none"}, checked through ${source.checkedThrough || "unverified"}, complete=${source.extraction?.complete === true}`
  );
}
