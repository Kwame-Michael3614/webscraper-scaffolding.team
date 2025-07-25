import fetch from "node-fetch";
import { JSDOM } from "jsdom";
import { URL } from "url";
import fs from "fs";

// Validate if a string is a valid URL
function isValidUrl(string) {
  try {
    return Boolean(new URL(string));
  } catch (_) {
    return false;
  }
}

// Convert relative URLs to absolute
function toAbsoluteUrl(relativeUrl, baseUrl) {
  try {
    return new URL(relativeUrl, baseUrl).href;
  } catch (_) {
    return null;
  }
}

// Extract unique absolute links
function extractLinks(document, baseUrl) {
  const links = [...document.querySelectorAll("a[href]")]
    .map(a => toAbsoluteUrl(a.getAttribute("href"), baseUrl))
    .filter(Boolean);
  return [...new Set(links)].sort();
}

// Extract unique absolute image URLs
function extractImages(document, baseUrl) {
  const images = [...document.querySelectorAll("img[src]")]
    .map(img => toAbsoluteUrl(img.getAttribute("src"), baseUrl))
    .filter(Boolean);
  return [...new Set(images)].sort();
}

// NEW: Extract email addresses
function extractEmails(document) {
  const textContent = document.body.textContent;
  const mailtoLinks = [...document.querySelectorAll("a[href^='mailto:']")]
    .map(a => a.getAttribute("href").replace(/^mailto:/i, ""))
    .filter(Boolean);

  const regexEmails = Array.from(new Set(
    [...textContent.matchAll(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g)].map(m => m[0])
  ));

  const allEmails = [...new Set([...mailtoLinks, ...regexEmails])].sort();
  return allEmails;
}

// Extract everything
function extractUniqueContent(document, baseUrl) {
  const links = extractLinks(document, baseUrl);
  const images = extractImages(document, baseUrl);
  const emails = extractEmails(document);
  return { links, images, emails };
}

// Scraping function
async function scrapeWebsite(url) {
  try {
    console.log(`🔎 Scraping: ${url}`);
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      },
    });

    if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);

    const html = await response.text();
    const dom = new JSDOM(html, { url });
    const { document } = dom.window;

    const { links, images, emails } = extractUniqueContent(document, url);

    const results = {
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
    };

    return results;
  } catch (error) {
    console.error("❌ Error:", error.message);
    throw error;
  }
}

// Display nicely in console
function displayResults(results) {
  console.log(`\n📊 SCRAPING RESULTS`);
  console.log("=".repeat(60));
  console.log(`🌐 URL: ${results.originalUrl}`);
  console.log(`🕒 Time: ${results.timestamp}`);
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

  console.log("\n🖼️  IMAGES:");
  results.images.forEach((img, i) => {
    console.log(`${i + 1}. ${img.alt || "No alt text"}`);
    console.log(`   URL: ${img.url}`);
    console.log(`   Size: ${img.width} x ${img.height}`);
    if (img.title) console.log(`   Title: ${img.title}`);
    console.log("");
  });

  console.log("\n📧 EMAILS:");
  results.emails.forEach((email, i) => {
    console.log(`${i + 1}. ${email}`);
  });
}

// CLI runner
async function main() {
  const url = process.argv[2];
  const customFilename = process.argv[3]; // Optional filename

  if (!url) {
    console.error("❌ Please provide a URL as an argument");
    console.log('Usage: node webscraper.js "https://example.com" [optional-filename]');
    process.exit(1);
  }

  if (!isValidUrl(url)) {
    console.error("❌ Invalid URL format");
    process.exit(1);
  }

  try {
    const results = await scrapeWebsite(url);
    displayResults(results);

    // Use custom filename or default timestamped filename
    const filename = customFilename
      ? (customFilename.endsWith(".json") ? customFilename : `${customFilename}.json`)
      : `scrape_results_${Date.now()}.json`;

    fs.writeFileSync(filename, JSON.stringify(results, null, 2));
    console.log(`\n💾 Saved to: ${filename}`);
  } catch (error) {
    console.error("❌ Scraper failed:", error.message);
  }
}


main();
