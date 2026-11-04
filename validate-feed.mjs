#!/usr/bin/env node
// Compatibility entry point. The supported implementation lives in scripts/.
import { main } from "./scripts/validate-feed.mjs";
main().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
