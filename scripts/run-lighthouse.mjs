import lighthouse from 'lighthouse';
import * as chromeLauncher from 'chrome-launcher';
import fs from 'fs';

const url = process.argv[2] || 'https://dragoncandy.io/landing';
const preset = process.argv[3] || 'desktop';
const outputPath = process.argv[4] || `./docs/lighthouse-prod2/${preset}-2026-05-08.json`;

const chrome = await chromeLauncher.launch({
  chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu'],
});

const options = {
  logLevel: 'error',
  output: 'json',
  port: chrome.port,
};

if (preset === 'desktop') {
  options.formFactor = 'desktop';
  options.screenEmulation = { mobile: false, width: 1350, height: 940, deviceScaleFactor: 1, disabled: false };
  options.throttling = { rttMs: 40, throughputKbps: 10240, cpuSlowdownMultiplier: 1 };
  options.emulatedUserAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36';
}

const result = await lighthouse(url, options);

fs.writeFileSync(outputPath, result.report);
console.log(`Scores for ${preset}:`);
const cats = result.lhr.categories;
console.log(`  Performance:    ${Math.round(cats.performance.score * 100)}`);
console.log(`  Accessibility:  ${Math.round(cats.accessibility.score * 100)}`);
console.log(`  Best Practices: ${Math.round(cats['best-practices'].score * 100)}`);
console.log(`  SEO:            ${Math.round(cats.seo.score * 100)}`);

const audits = result.lhr.audits;
console.log(`\nCore Metrics:`);
console.log(`  FCP:  ${audits['first-contentful-paint']?.displayValue || 'N/A'}`);
console.log(`  LCP:  ${audits['largest-contentful-paint']?.displayValue || 'N/A'}`);
console.log(`  TBT:  ${audits['total-blocking-time']?.displayValue || 'N/A'}`);
console.log(`  CLS:  ${audits['cumulative-layout-shift']?.displayValue || 'N/A'}`);
console.log(`  SI:   ${audits['speed-index']?.displayValue || 'N/A'}`);

const failed = Object.values(audits).filter(a => a.score === 0 && a.scoreDisplayMode === 'binary');
if (failed.length) {
  console.log(`\nFailed audits (${failed.length}):`);
  failed.forEach(a => console.log(`  FAIL: ${a.title}`));
}

const warnings = Object.values(audits).filter(a => a.score !== null && a.score > 0 && a.score < 1 && a.scoreDisplayMode === 'binary');
if (warnings.length) {
  console.log(`\nWarnings (${warnings.length}):`);
  warnings.forEach(a => console.log(`  WARN: ${a.title}`));
}

try { await chrome.kill(); } catch {}
