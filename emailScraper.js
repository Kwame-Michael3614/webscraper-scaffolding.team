// emailScraper.js

import { connect } from "puppeteer-real-browser";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import puppeteerExtra from "puppeteer-extra";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

puppeteerExtra.use(StealthPlugin());

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEBSITE_URL = "https://www.ibba.org/find-a-business-broker";
const DATA_API_URL = "https://www.ibba.org/wp-json/brokers/all";
const OUTPUT_DIR = path.join(__dirname, "output", "brokers");

fs.mkdirSync(OUTPUT_DIR, { recursive: true });
const timestamp = new Date().toISOString().split("T")[0];
const outPath = path.join(OUTPUT_DIR, `ibba-${timestamp}.json`);

/**
 * Main scraping function
 * - Connects to a real browser session with stealth settings to bypass bot detection
 * - Navigates to the IBBA brokers page
 * - Waits for potential CAPTCHA and allows manual solving if needed
 * - Fetches broker data from the site's internal API endpoint
 * - Cleans and formats the data
 * - Saves the results to a JSON file
 */
async function scrapEmails() {
  let browser;

  try {
    // Connect to a stealth-enabled real browser instance
    const response = await connect({
      headless: false,
      fingerprint: true,
      turnstile: true,
      plugins: [StealthPlugin()],
    });

    browser = response.browser;
    const page = response.page;

    // Navigate to target website and wait for network idle to ensure full load
    console.log("🔍 Navigating to IBBA site...");
    await page.goto(WEBSITE_URL, { waitUntil: "networkidle2" });

    // Check for CAPTCHA iframe and pause for manual solving if detected
    console.log("✅ Page loaded. Waiting for CAPTCHA (if any)...");
    try {
      await page.waitForSelector('iframe[src*="recaptcha"]', { timeout: 30000 });
      console.log("⚠️ CAPTCHA detected. Handle it manually, then continue...");
      await page.waitForTimeout(20000); // pause for manual CAPTCHA solving
    } catch {
      console.log("✅ No CAPTCHA iframe found.");
    }

    // Fetch the brokers data JSON from the internal API endpoint within the page context
    console.log("📦 Fetching broker data from API...");
    const brokers = await page.evaluate(async (url) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
      return await res.json();
    }, DATA_API_URL);

    // Clean and format raw broker data to desired output structure
    const cleaned = brokers.map((b) => ({
      name: `${b.first_name || ""} ${b.last_name || ""}`.trim(),
      firm: b.company || "N/A",
      email: b.email || "N/A",
      phone: b.phone || "N/A",
      location: `${b.city || ""}, ${b.state || ""}`.trim(),
    }));

    // Save cleaned broker data to JSON file
    fs.writeFileSync(outPath, JSON.stringify(cleaned, null, 2));
    console.log(`✅ Saved ${cleaned.length} brokers to ${outPath}`);

    // Display first 5 brokers as a console table preview
    console.table(cleaned.slice(0, 5));
  } catch (error) {
    console.error("❌ Error during scraping:", error);
  } finally {
    // Ensure browser closes to free resources
    if (browser) await browser.close();
  }
}

// Immediately run the scraping function
scrapEmails();
