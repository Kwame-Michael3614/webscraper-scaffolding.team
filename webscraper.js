// webscraper.js
import fetch from "node-fetch";
import { JSDOM } from "jsdom";
import { URL } from "url";
import fs from "fs";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
puppeteer.use(StealthPlugin());

const COOKIES_PATH = "./cookies.json";
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

function isValidUrl(string) {
  try {
    return Boolean(new URL(string));
  } catch (_) {
    return false;
  }
}

function toAbsoluteUrl(relativeUrl, baseUrl) {
  try {
    return new URL(relativeUrl, baseUrl).href;
  } catch (_) {
    return null;
  }
}

function extractLinks(document, baseUrl) {
  return [...new Set(
    [...document.querySelectorAll("a[href]")]
      .map(a => toAbsoluteUrl(a.getAttribute("href"), baseUrl))
      .filter(Boolean)
  )].sort();
}

function extractImages(document, baseUrl) {
  return [...new Set(
    [...document.querySelectorAll("img[src]")]
      .map(img => toAbsoluteUrl(img.getAttribute("src"), baseUrl))
      .filter(Boolean)
  )].sort();
}

function extractEmails(document) {
  const textContent = document.body.textContent;
  const mailtoLinks = [...document.querySelectorAll("a[href^='mailto:']")]
    .map(a => a.getAttribute("href").replace(/^mailto:/i, ""))
    .filter(Boolean);
  const regexEmails = Array.from(new Set([
    ...textContent.matchAll(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g)
  ].map(m => m[0])));
  return [...new Set([...mailtoLinks, ...regexEmails])].sort();
}

function buildResults(document, url, extraData = {}) {
  const links = extractLinks(document, url);
  const images = extractImages(document, url);
  const emails = extractEmails(document);
  return {
    originalUrl: url,
    timestamp: new Date().toISOString(),
    stats: {
      totalLinks: links.length,
      totalImages: images.length,
      totalEmails: emails.length,
      externalLinks: links.filter(link => !link.startsWith(new URL(url).origin)).length,
      internalLinks: links.filter(link => link.startsWith(new URL(url).origin)).length,
    },
    links,
    images: images.map(src => {
      const img = document.querySelector(`img[src="${src}"]`);
      return {
        url: src,
        alt: img?.getAttribute("alt") || "",
        title: img?.getAttribute("title") || "",
        width: img?.getAttribute("width") || "unknown",
        height: img?.getAttribute("height") || "unknown",
      };
    }),
    emails,
    ...extraData,
  };
}

async function saveCookies(page) {
  const cookies = await page.cookies();
  fs.writeFileSync(COOKIES_PATH, JSON.stringify(cookies, null, 2));
  console.log("💾 Cookies saved to", COOKIES_PATH);
}

async function loadCookies(page) {
  if (!fs.existsSync(COOKIES_PATH)) return false;
  const cookies = JSON.parse(fs.readFileSync(COOKIES_PATH));
  await page.setCookie(...cookies);
  console.log("📥 Cookies loaded from", COOKIES_PATH);
  return true;
}

async function simulateHuman(page) {
  await page.setViewport({ width: 1366, height: 768 });
  await page.mouse.move(100, 100);
  await wait(300);
  await page.mouse.move(300, 300, { steps: 20 });
  await page.evaluate(async () => {
    await new Promise(resolve => {
      let totalHeight = 0;
      const distance = 100;
      const timer = setInterval(() => {
        window.scrollBy(0, distance);
        totalHeight += distance;
        if (totalHeight >= document.body.scrollHeight) {
          clearInterval(timer);
          resolve();
        }
      }, 200);
    });
  });
  await wait(1500);
}

async function scrapeIBBABrokers(url) {
  const browser = await puppeteer.launch({ headless: false, args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await loadCookies(page);

  await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36");
  await page.setExtraHTTPHeaders({ "Accept-Language": "en-US,en;q=0.9" });
  console.log("🌐 Visiting IBBA Broker Directory...");
  await page.goto(url, { waitUntil: "domcontentloaded" });

  try {
    await page.waitForSelector("#location", { timeout: 60000 });
  } catch (e) {
    console.error("❌ #location selector not found. Saving debug HTML...");
    const html = await page.content();
    fs.writeFileSync("debug_page.html", html);
    throw new Error("Element #location not found in time.");
  }

  await simulateHuman(page);
  await page.type("#location", "California");
  await page.keyboard.press("Enter");
  await wait(6000);
  await saveCookies(page);

  const loadMoreSelector = "button.load-more";
  while (await page.$(loadMoreSelector)) {
    const isHidden = await page.evaluate(sel => {
      const btn = document.querySelector(sel);
      return !btn || btn.disabled || btn.offsetParent === null;
    }, loadMoreSelector);
    if (isHidden) break;
    console.log("➡️ Clicking 'Load More'...");
    await page.click(loadMoreSelector);
    await wait(2000);
  }

  console.log("✅ All brokers loaded.");
  const profileUrls = await page.$$eval(".broker-listing a.broker-name", links => links.map(a => a.href));
  console.log(`🔗 Found ${profileUrls.length} broker profiles.`);

  const brokers = [];
  for (let i = 0; i < profileUrls.length; i++) {
    const profileUrl = profileUrls[i];
    console.log(`🔍 Scraping ${i + 1}/${profileUrls.length}: ${profileUrl}`);
    const brokerPage = await browser.newPage();
    try {
      await brokerPage.goto(profileUrl, { waitUntil: "domcontentloaded" });
      const broker = await brokerPage.evaluate(() => {
        const getText = sel => document.querySelector(sel)?.textContent.trim() || "";
        const firm = getText(".broker-firm-name");
        const contact = getText(".broker-contact-name");
        const emailEl = document.querySelector("a[href^='mailto:']");
        const email = emailEl ? emailEl.getAttribute("href").replace(/^mailto:/i, "") : "";
        return { firm, contact, email };
      });
      brokers.push({ url: profileUrl, ...broker });
    } catch {
      console.warn(`⚠️ Failed profile: ${profileUrl}`);
    } finally {
      await brokerPage.close();
    }
  }

  const html = await page.content();
  const dom = new JSDOM(html, { url });
  const { document } = dom.window;
  await browser.close();
  return buildResults(document, url, { brokers });
}

async function scrapeWebsite(url) {
  console.log(`🔎 Scraping: ${url}`);
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 Chrome/91 Safari/537.36"
      }
    });
    if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
    const html = await response.text();
    const dom = new JSDOM(html, { url });
    return buildResults(dom.window.document, url);
  } catch (err) {
    console.warn("⚠️ Static scraping failed. Falling back to Puppeteer...");
    return url.includes("ibba.org") ? await scrapeIBBABrokers(url) : await scrapeWithPuppeteer(url);
  }
}

function displayResults(results) {
  console.log(`\n📊 SCRAPING RESULTS\n${"=".repeat(60)}`);
  console.log(`🌐 URL: ${results.originalUrl}\n🕒 Time: ${results.timestamp}`);
  console.log(`🔗 Total Links: ${results.stats.totalLinks}`);
  console.log(`   └─ Internal: ${results.stats.internalLinks}`);
  console.log(`   └─ External: ${results.stats.externalLinks}`);
  console.log(`🖼️  Total Images: ${results.stats.totalImages}`);
  console.log(`📧 Total Emails: ${results.stats.totalEmails}`);

  console.log("\n📋 LINKS:");
  results.links.forEach((link, i) => {
    const type = link.startsWith(new URL(results.originalUrl).origin) ? "🏠" : "🌍";
    console.log(`${i + 1}. ${type} ${link}`);
  });

  if (results.brokers) {
    console.log(`\n🤝 BROKERS (${results.brokers.length}):`);
    results.brokers.forEach((b, i) => {
      console.log(`${i + 1}. Firm: ${b.firm}, Contact: ${b.contact}, Email: ${b.email || "N/A"}`);
      console.log(`   Profile: ${b.url}`);
    });
  }
}

(async () => {
  const url = process.argv[2];
  if (!url || !isValidUrl(url)) return console.error("❌ Invalid or missing URL");
  try {
    const results = await scrapeWebsite(url);
    displayResults(results);
    const filename = `scrape_results_${Date.now()}.json`;
    fs.writeFileSync(filename, JSON.stringify(results, null, 2));
    console.log(`\n💾 Saved to: ${filename}`);
  } catch (err) {
    console.error("❌ Scraper failed:", err.message);
  }
})();
