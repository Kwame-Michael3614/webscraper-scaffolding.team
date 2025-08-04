import fetch from "node-fetch";
import { JSDOM } from "jsdom";
import { URL } from "url";
import fs from "fs";

// Function to validate if a string is a valid URL
function isValidUrl(string) {
  try {
    // eslint-disable-next-line no-new
    return Boolean(new URL(string));
  } catch (_) {
    return false;
  }
}

// Function to convert relative URLs to absolute URLs
function resolveUrl(baseUrl, relativeUrl) {
  try {
    return new URL(relativeUrl, baseUrl).href;
  } catch (error) {
    return null;
  }
}

// Scraping function
async function scrapeWebsite(url) {
  try {
    console.log(`Starting to scrape: ${url}`);
    console.log("Downloading HTML...");

    // Download the HTML content
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      },
    });

    // Check if the request was successful
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    // Get the HTML text
    const html = await response.text();
    console.log(`HTML downloaded successfully (${html.length} characters)`);

    // Parse HTML with JSDOM
    console.log("Parsing HTML with JSDOM...");
    const dom = new JSDOM(html, { url });
    const { document } = dom.window;
    console.log("HTML parsed successfully");

    // Extract all links
    console.log("Extracting links...");
    const linkElements = document.querySelectorAll("a[href]");
    const links = [];

    linkElements.forEach((link) => {
      const href = link.getAttribute("href");
      const text = link.textContent.trim();

      // Convert relative URLs to absolute URLs
      const absoluteUrl = resolveUrl(url, href);

      if (absoluteUrl) {
        links.push({
          url: absoluteUrl,
          text: text || "No text",
          isExternal: !absoluteUrl.startsWith(new URL(url).origin),
        });
      }
    });

    console.log(`✅ Found ${links.length} links`);

    // Extracting images
    console.log("🖼️  Extracting images...");
    const imageElements = document.querySelectorAll("img[src]");
    const images = [];

    imageElements.forEach((img) => {
      const src = img.getAttribute("src");
      const alt = img.getAttribute("alt") || "";
      const title = img.getAttribute("title") || "";

      // Convert relative URLs to absolute URLs
      const absoluteUrl = resolveUrl(url, src);

      if (absoluteUrl) {
        images.push({
          url: absoluteUrl,
          alt,
          title,
          width: img.getAttribute("width") || "unknown",
          height: img.getAttribute("height") || "unknown",
        });
      }
    });

    console.log(`✅ Found ${images.length} images`);

    // Return structured results
    return {
      originalUrl: url,
      timestamp: new Date().toISOString(),
      stats: {
        totalLinks: links.length,
        totalImages: images.length,
        externalLinks: links.filter((link) => link.isExternal).length,
        internalLinks: links.filter((link) => !link.isExternal).length,
      },
      links,
      images,
    };
  } catch (error) {
    console.error("❌ Error scraping website:", error.message);
    throw error;
  }
}

// Function to display results in a readable format
function displayResults(results) {
  console.log(`\n${"=".repeat(60)}`);
  console.log("📊 SCRAPING RESULTS");
  console.log("=".repeat(60));
  console.log(`🌐 Website: ${results.originalUrl}`);
  console.log(`⏰ Scraped at: ${results.timestamp}`);
  console.log(`🔗 Total Links: ${results.stats.totalLinks}`);
  console.log(`   └─ Internal: ${results.stats.internalLinks}`);
  console.log(`   └─ External: ${results.stats.externalLinks}`);
  console.log(`🖼️  Total Images: ${results.stats.totalImages}`);

  console.log("\n📋 LINKS FOUND:");
  console.log("-".repeat(40));
  results.links.forEach((link, index) => {
    console.log(`${index + 1}. ${link.isExternal ? "🌍" : "🏠"} ${link.text}`);
    console.log(`   URL: ${link.url}`);
    console.log("");
  });

  console.log("\n🖼️  IMAGES FOUND:");
  console.log("-".repeat(40));
  results.images.forEach((image, index) => {
    console.log(`${index + 1}. ${image.alt || "No alt text"}`);
    console.log(`   URL: ${image.url}`);
    console.log(`   Size: ${image.width} x ${image.height}`);
    if (image.title) {
      console.log(`   Title: ${image.title}`);
    }
    console.log("");
  });
}

async function main() {
  // Get URL from command line arguments
  const url = process.argv[2];

  // input validation
  if (!url) {
    console.error("❌ Please provide a URL as an argument");
    console.log('Usage: node webscraper.js "https://example.com"');
    process.exit(1);
  }

  if (!isValidUrl(url)) {
    console.error("❌ Please provide a valid URL");
    console.log('Example: node webscraper.js "https://www.apple.com"');
    process.exit(1);
  }

  try {
    // Run the scraper
    const results = await scrapeWebsite(url);

    // Display results
    displayResults(results);

    // Optional: Save results to JSON file
    const filename = `scrape_results_${Date.now()}.json`;
    fs.writeFileSync(filename, JSON.stringify(results, null, 2));
    console.log(`\n💾 Results saved to: ${filename}`);
  } catch (error) {
    console.error("❌ Scraping failed:", error.message);
    process.exit(1);
  }
}

// Run the program
main();
