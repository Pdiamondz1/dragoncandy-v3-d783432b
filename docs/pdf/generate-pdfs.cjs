const path = require("path");
const puppeteer = require(
  path.join(
    process.env.npm_config_prefix || path.join(require("os").homedir(), "AppData", "Roaming", "npm"),
    "node_modules", "md-to-pdf", "node_modules", "puppeteer"
  )
);

async function generatePDF(htmlFile, outputFile) {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  const filePath = path.resolve(__dirname, htmlFile);
  await page.goto(`file:///${filePath.replace(/\\/g, "/")}`, { waitUntil: "networkidle0", timeout: 60000 });

  // Wait for Mermaid to render
  await page.evaluate(() => {
    return new Promise((resolve) => {
      if (document.querySelector(".mermaid svg")) return resolve();
      setTimeout(resolve, 3000);
    });
  });

  await page.pdf({
    path: path.resolve(__dirname, outputFile),
    format: "A4",
    margin: { top: "20mm", bottom: "20mm", left: "18mm", right: "18mm" },
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: `<div style="width:100%;font-size:8px;color:#999;padding:0 20mm;display:flex;justify-content:space-between;"><span>DragonCandy — Confidential</span><span></span></div>`,
    footerTemplate: `<div style="width:100%;font-size:8px;color:#999;padding:0 20mm;display:flex;justify-content:space-between;"><span>© 2026 DragonCandy Inc.</span><span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`,
  });

  await browser.close();
  console.log(`Generated: ${outputFile}`);
}

(async () => {
  await generatePDF("donny-ai-cost-architecture.html", "Donny_AI_Cost_Architecture.pdf");
  await generatePDF("social-media-integration.html", "DragonCandy_Social_Media_Integration.pdf");
})();
