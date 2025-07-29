// gamesScraper.js

import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

// Enable stealth plugin to help evade bot detection
puppeteer.use(StealthPlugin());

// Setup __dirname for ES modules and output directory path
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(__dirname, "output", "games");

// Ensure output directory exists before writing files
await fs.mkdir(OUTPUT_DIR, { recursive: true });

// Target IGDB coming soon games page URL
const TARGET_URL = "https://www.igdb.com/games/coming_soon";

// Timestamp to uniquely name output files
const timestamp = new Date().toISOString().split("T")[0];

// Launch headless browser instance
const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();

// Navigate to the target page and wait until network is idle (page fully loaded)
await page.goto(TARGET_URL, { waitUntil: "networkidle2" });

// Wait for the main game cards container to appear on the page
await page.waitForSelector(".media");

// Extract a list of game card URLs and cover image URLs from the main page
const cards = await page.$$eval(".media", (cards) =>
  cards.map((card) => ({
    gameUrl: card.querySelector(".media-body > a")?.href || "",
    gameCoverUrl: card.querySelector(".media-left .game_cover img")?.src || "",
  }))
);

const games = [];

// Loop through first 10 game cards (or less if fewer available)
for (let i = 0; i < Math.min(cards.length, 5); i++) {
  const { gameUrl, gameCoverUrl } = cards[i];
  console.log(`🔎 [${i + 1}] Fetching game: ${gameUrl}`);

  // Navigate to individual game page to scrape detailed info
  await page.goto(gameUrl, { waitUntil: "networkidle2" });

  // Extract the game name from the <h1> element
  const name = await page.$eval("h1", (el) => el.textContent.trim());

  // Extract all tags inside specified typography class (genres + platforms)
  const tags = await page.$$eval(".MuiTypography-body1 > a", (els) =>
    els.map((el) => el.textContent.trim())
  );

  // Extract release date or default to "Unknown" if not found
  const releaseDate = await page
    .$eval(
      ".MuiTypography-body1.sc-bRoQge",
      (el) => el.textContent.trim()
    )
    .catch(() => "Unknown");

  // Extract publishers by finding the paragraph starting with "Publishers:"
  const publishers = await page.$$eval("p", (paras) => {
    const p = paras.find((p) =>
      p.textContent.trim().startsWith("Publishers:")
    );
    return p
      ? Array.from(p.querySelectorAll("a")).map((a) => a.textContent.trim())
      : [];
  });

  // Push the scraped game data into the results array
  games.push({
    name,
    genres: tags.slice(0, -1),     // All tags except last are genres
    platforms: tags.slice(-1),     // Last tag is platform
    releaseDate,
    publishers,
    gameCoverUrl,
    gameUrl,
  });
}

// Write the collected games data to a JSON file in the output directory
const outputFile = path.join(OUTPUT_DIR, `games-${timestamp}.json`);
await fs.writeFile(outputFile, JSON.stringify(games, null, 2), "utf8");
console.log(`✅ Stored ${games.length} games to ${outputFile}`);

// Close the browser to free resources
await browser.close();
