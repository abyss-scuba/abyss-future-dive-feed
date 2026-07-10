#!/usr/bin/env node
import fs from "node:fs/promises";

const feedPath = process.argv[2] || "data/future-dives.json";
const feed = JSON.parse(await fs.readFile(feedPath, "utf8"));

const categories = {};
const sources = {};
for (const event of feed.events || []) {
  categories[event.primaryCategory] = (categories[event.primaryCategory] || 0) + 1;
  sources[event.source] = (sources[event.source] || 0) + 1;
}

console.log(`Generated: ${feed.generatedAt}`);
console.log(`Window: ${feed.window?.startsOn} to ${feed.window?.publicSearchThrough}`);
console.log(`Events: ${feed.eventCount}`);
console.log("By category:", categories);
console.log("By preferred source:", sources);
console.log("Source health:");
for (const [name, source] of Object.entries(feed.sources || {})) {
  console.log(
    `  ${name}: ${source.status}, ${source.rawEventCount} events, ${source.firstDate} → ${source.lastDate}`
  );
}
