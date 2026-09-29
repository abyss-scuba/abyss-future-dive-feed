#!/usr/bin/env node
import fs from "node:fs/promises";
import { bootstrapBoatDocs, makeDocsClient, verifyPack } from "../src/helpscout-boat-bootstrap.mjs";

const sourcePath = new URL("../docs/Boat_Diving_Help_Scout_Docs_2026-09-29.md", import.meta.url);
const payloadPath = new URL("../data/helpscout-boat-articles.json", import.meta.url);
const targetPath = new URL("../data/helpscout-boat-target.json", import.meta.url);

async function main() {
  const [source, payloadText] = await Promise.all([fs.readFile(sourcePath), fs.readFile(payloadPath, "utf8")]);
  const articles = verifyPack(JSON.parse(payloadText), source);
  const existingTarget = await fs.readFile(targetPath, "utf8").then(JSON.parse).catch(error => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  const target = await bootstrapBoatDocs({
    request: makeDocsClient(process.env.HELP_SCOUT_DOCS_API_KEY),
    articles,
    existingTarget
  });
  const next = `${JSON.stringify(target, null, 2)}\n`;
  if (next !== (existingTarget ? `${JSON.stringify(existingTarget, null, 2)}\n` : null)) {
    await fs.writeFile(new URL("../data/helpscout-boat-target.json.tmp", import.meta.url), next);
    await fs.rename(new URL("../data/helpscout-boat-target.json.tmp", import.meta.url), targetPath);
  }
  const summary = `Verified private Boat Diving collection and seven published articles; schedule target ${target.articleId}.`;
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) {
    await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, `${summary}\n\nThe scheduled updater reads data/helpscout-boat-target.json.\n`);
  }
}

main().catch(error => {
  console.error(`Boat Diving Docs bootstrap failed: ${error.message}`);
  process.exitCode = 1;
});
