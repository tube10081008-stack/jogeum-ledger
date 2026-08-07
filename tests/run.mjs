// 테스트 실행기 — 정적 서버를 띄우고 tests/*.test.mjs 를 순서대로 돌린다.
//   npm test
// 로컬에 크로미움이 따로 있으면: CHROMIUM_PATH=/opt/pw-browsers/chromium npm test
import { chromium } from "playwright";
import { startServer, collector } from "./harness.mjs";

import * as smoke from "./smoke.test.mjs";
import * as syncSafety from "./sync-safety.test.mjs";
import * as insights from "./insights.test.mjs";
import * as jars from "./jars.test.mjs";
import * as durability from "./durability.test.mjs";
import * as yearRollover from "./year-rollover.test.mjs";
import * as pwa from "./pwa.test.mjs";
import * as gdrive from "./gdrive.test.mjs";

const SUITES = [smoke, syncSafety, insights, jars, durability, yearRollover, pwa, gdrive];

const { server, baseURL } = await startServer();
const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});

let passed = 0, failed = 0;
for (const suite of SUITES) {
  const { results, check } = collector();
  process.stdout.write(`\n▶ ${suite.name}\n`);
  try {
    await suite.run({ browser, baseURL, check });
  } catch (e) {
    check(`실행 중 예외: ${e.message}`, false);
  }
  for (const r of results) {
    console.log(`   ${r.ok ? "✓" : "✗"} ${r.label}`);
    r.ok ? passed++ : failed++;
  }
}

await browser.close();
server.close();

console.log(`\n${failed === 0 ? "통과" : "실패"} — ${passed}개 성공, ${failed}개 실패\n`);
process.exit(failed === 0 ? 0 : 1);
