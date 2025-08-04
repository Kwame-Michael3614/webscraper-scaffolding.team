// webscraper.js

import fetch from 'node-fetch';
import { JSDOM } from 'jsdom';
import minimist from 'minimist';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Parse command line arguments to get target URL
const args = minimist(process.argv.slice(2));
const targetUrl = args._[0];

// Exit early if no URL provided, showing usage message
if (!targetUrl) {
  console.error(chalk.red('❌ Usage: node webscraper.js "https://example.com"'));
  process.exit(1);
}

// Setup __dirname for ES modules and prepare output directory
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const domain = new URL(targetUrl).hostname.replace('www.', ''); // Normalize domain name
const timestamp = new Date().toISOString().split('T')[0];       // Date stamp for filenames
const outputPath = path.join(__dirname, 'output', 'sites');
fs.mkdirSync(outputPath, { recursive: true });                  // Ensure output directory exists

// Main async IIFE to run the scraping logic
(async () => {
  try {
    console.log(chalk.blue(`🌍 Fetching ${targetUrl}...`));

    // Fetch the raw HTML content of the target website
    const res = await fetch(targetUrl);
    const html = await res.text();

    // Parse the HTML using JSDOM to simulate a DOM environment
    const dom = new JSDOM(html);
    const document = dom.window.document;
    const base = new URL(targetUrl);  // Base URL for resolving relative links

    // Extract all anchor tag href attributes and convert to absolute URLs
    const links = Array.from(document.querySelectorAll('a[href]'))
      .map(el => new URL(el.href, base).href)
      .filter(link => link.startsWith('http'));  // Keep only http/https URLs

    // Extract all image tag src attributes and convert to absolute URLs
    const images = Array.from(document.querySelectorAll('img[src]'))
      .map(el => new URL(el.src, base).href)
      .filter(src => src.startsWith('http'));

    // Prepare output object with unique, sorted links and images
    const output = {
      scrapedFrom: targetUrl,
      date: new Date().toISOString(),
      links: [...new Set(links)].sort(),
      images: [...new Set(images)].sort()
    };

    // Write the scraped data to a JSON file named by domain and date
    const fileName = `${domain}-${timestamp}.json`;
    const filePath = path.join(outputPath, fileName);

    fs.writeFileSync(filePath, JSON.stringify(output, null, 2));
    console.log(chalk.green(`✅ Done! Saved to output/sites/${fileName}`));
  } catch (err) {
    // Log any errors that occur during the fetch or parsing process
    console.error(chalk.red(`❌ Error: ${err.message}`));
  }
})();
