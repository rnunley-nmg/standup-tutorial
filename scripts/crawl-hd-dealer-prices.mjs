import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const INPUT = path.resolve("src/data/harley-lineup.json");
const MARKETS = ["10001", "02108", "30303", "33131", "60601", "75201", "80202", "85004", "90015", "98101"];
const INVENTORY_URL = "https://www.harley-davidson.com/us/en/motorcycles/dealer-inventory";
const DEFAULT_FREIGHT = 895;

function parseMoney(value) {
  const match = String(value ?? "").match(/\$?\s*([\d,]{4,6})(?:\.\d{2})?/);
  return match ? Number(match[1].replaceAll(",", "")) : null;
}

function uniqueBy(items, keyFn) {
  const seen = new Set();
  return items.filter((item) => {
    const key = keyFn(item);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function extrapolateDealerPrice(model) {
  const msrp = model.metrics?.msrp ?? parseMoney(model.price);
  if (!msrp) return null;
  const freight = parseMoney(model.specs?.freight) ?? DEFAULT_FREIGHT;
  return msrp + freight;
}

async function fetchInventoryHtml(modelId, zip) {
  const params = new URLSearchParams({
    model: modelId,
    condition: "new",
    search: zip,
    zipCode: zip,
  });
  const response = await fetch(`${INVENTORY_URL}?${params}`, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/537.36 Chrome Safari",
    },
  });
  if (!response.ok) return "";
  return response.text();
}

function extractVisibleListings(html, model) {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<style[\s\S]*?<\/style>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");

  if (/Dealer Needed|Please select a dealer/i.test(text)) {
    return [];
  }

  const listings = [];
  const lowerName = model.name.toLowerCase().replace(/[®™]/g, "");
  const chunks = text.split(/(?=20\d{2}\s+Harley-Davidson|Harley-Davidson)/i);
  for (const chunk of chunks) {
    const normalized = chunk.toLowerCase().replace(/[®™]/g, "");
    if (!normalized.includes(lowerName.split(" ")[0])) continue;
    const price = parseMoney(chunk);
    if (!price || price < 5000) continue;
    listings.push({
      modelId: model.id,
      price,
      rawSnippet: chunk.slice(0, 240).trim(),
    });
  }
  return uniqueBy(listings, (listing) => `${listing.modelId}:${listing.price}:${listing.rawSnippet}`);
}

function summarize(model, listings, marketsSampled) {
  if (!listings.length) {
    const estimate = extrapolateDealerPrice(model);
    const msrp = model.metrics?.msrp ?? null;
    const delta = estimate && msrp ? estimate - msrp : null;
    return {
      status: "extrapolated",
      sampleCount: 0,
      marketsSampled,
      averageAdvertisedPrice: null,
      lowestAdvertisedPrice: null,
      highestAdvertisedPrice: null,
      averageDeltaFromMsrp: null,
      averageDeltaPercent: null,
      extrapolatedAveragePrice: estimate,
      extrapolatedDeltaFromMsrp: delta,
      extrapolatedDeltaPercent: msrp && delta !== null ? Number(((delta / msrp) * 100).toFixed(1)) : null,
      pricingBasis: `No crawlable advertised listings; extrapolated as MSRP plus estimated freight (${DEFAULT_FREIGHT}).`,
      listings: [],
    };
  }

  const prices = listings.map((listing) => listing.price);
  const average = Math.round(prices.reduce((sum, price) => sum + price, 0) / prices.length);
  const msrp = model.metrics?.msrp ?? null;
  const delta = msrp ? average - msrp : null;
  return {
    status: listings.length < 3 ? "limited-sample" : "sampled",
    sampleCount: listings.length,
    marketsSampled,
    averageAdvertisedPrice: average,
    lowestAdvertisedPrice: Math.min(...prices),
    highestAdvertisedPrice: Math.max(...prices),
    averageDeltaFromMsrp: delta,
    averageDeltaPercent: msrp && delta !== null ? Number(((delta / msrp) * 100).toFixed(1)) : null,
    extrapolatedAveragePrice: null,
    extrapolatedDeltaFromMsrp: null,
    extrapolatedDeltaPercent: null,
    pricingBasis: "Advertised listing prices collected from sampled official inventory pages.",
    listings: listings.slice(0, 25),
  };
}

async function main() {
  const data = JSON.parse(await readFile(INPUT, "utf8"));
  const dealerGeneratedAt = new Date().toISOString();

  for (const model of data.models) {
    const listings = [];
    const sampled = [];
    for (const zip of MARKETS) {
      process.stderr.write(`Sampling ${model.id} in ${zip}\n`);
      const html = await fetchInventoryHtml(model.id, zip);
      sampled.push(zip);
      listings.push(
        ...extractVisibleListings(html, model).map((listing) => ({
          ...listing,
          market: zip,
          sourceUrl: `${INVENTORY_URL}?model=${encodeURIComponent(model.id)}&zipCode=${zip}`,
        }))
      );
    }
    model.dealerPricing = summarize(
      model,
      uniqueBy(listings, (listing) => `${listing.market}:${listing.price}:${listing.rawSnippet}`),
      sampled
    );
  }

  data.dealerPricing = {
    generatedAt: dealerGeneratedAt,
    marketsSampled: MARKETS,
    note: "Best-effort advertised pricing from official Harley-Davidson dealer inventory pages. Missing samples mean the site required dealer selection or exposed no crawlable listing price.",
  };

  await writeFile(INPUT, `${JSON.stringify(data, null, 2)}\n`);
  process.stdout.write(`Updated dealer pricing in ${INPUT}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
