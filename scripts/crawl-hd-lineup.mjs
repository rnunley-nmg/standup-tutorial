import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const BASE = "https://www.harley-davidson.com";
const INDEX_URL = `${BASE}/us/en/motorcycles/index.html`;
const OUTPUT = path.resolve("src/data/harley-lineup.json");
const FALLBACK_SLUGS = [
  "street-bob",
  "low-rider-s",
  "heritage-classic",
  "fat-boy",
  "breakout",
  "low-rider-st",
  "street-glide",
  "road-glide",
  "street-glide-limited",
  "road-glide-limited",
  "cvo-street-glide-st",
  "cvo-road-glide-st",
  "cvo-street-glide",
  "cvo-street-glide-limited",
  "nightster",
  "nightster-special",
  "sportster-s",
  "road-glide-3",
  "street-glide-3-limited",
  "cvo-street-glide-3-limited",
  "pan-america-1250-special",
  "pan-america-1250-st",
  "pan-america-1250-limited",
];

const wantedSpecCodes = new Set([
  "msrpBase",
  "freight",
  "engine",
  "displacement",
  "compressionRatio",
  "engineTorque",
  "engineTorqueRpm",
  "motorHorsepower",
  "weightIn",
  "seatHeight",
  "groundClearance",
  "wheelbase",
  "fuelCapacity",
  "fuelEconomy",
  "leftAngleRight",
  "leftAngleLeft",
  "luggageCapacity",
  "primaryDrive",
  "gearRatioFirst",
  "gearRatioSixth",
  "frontFork",
  "rearShocks",
  "brakeCaliperType",
  "brakeType",
  "tiresFront",
  "tiresRear",
  "gauges",
]);

function stripTags(value = "") {
  return String(value).replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

function parseMoney(value) {
  const match = String(value ?? "").match(/[\d,]+/);
  return match ? Number(match[0].replaceAll(",", "")) : null;
}

function parseNumber(value) {
  const match = String(value ?? "").replaceAll(",", "").match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function parseSeatHeight(value) {
  const numbers = String(value ?? "").match(/\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  if (!numbers.length) return null;
  return Math.min(...numbers);
}

function parseHorsepower(value) {
  const match = String(value ?? "").match(/(\d+(?:\.\d+)?)\s*HP/i);
  return match ? Number(match[1]) : parseNumber(value);
}

function cleanSpecMap(specs) {
  return Object.fromEntries(
    Object.entries(specs).map(([key, value]) => [key, stripTags(value)])
  );
}

function computeMetrics(model) {
  const specs = model.specs;
  const msrp = parseMoney(model.price);
  const hp = parseHorsepower(specs.motorHorsepower);
  const torque = parseNumber(specs.engineTorque);
  const weight = parseNumber(specs.weightIn);
  const fuelCapacity = parseNumber(specs.fuelCapacity);
  const mpg = parseNumber(specs.fuelEconomy);
  const leanAngles = [parseNumber(specs.leftAngleLeft), parseNumber(specs.leftAngleRight)].filter(
    (value) => typeof value === "number"
  );
  const leanAngle = leanAngles.length ? Math.min(...leanAngles) : null;

  return {
    msrp,
    monthlyEstimate: parseMoney(model.monthly),
    horsepower: hp,
    horsepowerRpm: parseNumber(String(specs.motorHorsepower ?? "").split("@")[1]),
    torque,
    torqueRpm: parseNumber(specs.engineTorqueRpm),
    runningWeight: weight,
    displacementCi: parseNumber(specs.displacement),
    compressionRatio: parseNumber(specs.compressionRatio),
    seatHeight: parseSeatHeight(specs.seatHeight),
    groundClearance: parseNumber(specs.groundClearance),
    wheelbase: parseNumber(specs.wheelbase),
    fuelCapacity,
    fuelEconomy: mpg,
    estimatedRange: fuelCapacity && mpg ? Number((fuelCapacity * mpg).toFixed(1)) : null,
    leanAngle,
    luggageCapacity: parseNumber(specs.luggageCapacity),
    firstGearRatio: parseNumber(specs.gearRatioFirst),
    sixthGearRatio: parseNumber(specs.gearRatioSixth),
    powerToWeight: hp && weight ? Number((hp / weight).toFixed(4)) : null,
    torqueToWeight: torque && weight ? Number((torque / weight).toFixed(4)) : null,
    costPerHp: msrp && hp ? Math.round(msrp / hp) : null,
    costPerTorque: msrp && torque ? Math.round(msrp / torque) : null,
  };
}

function categoryFromFamily(family) {
  const value = String(family ?? "").toUpperCase();
  if (value.includes("TOURING")) return "Grand American Touring";
  if (value.includes("TRIKE")) return "Trike";
  if (value.includes("ADVENTURE")) return "Adventure Touring";
  if (value.includes("STREET")) return "Sport";
  return "Cruiser";
}

function getNextData(html, url) {
  const match = html.match(
    /<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/
  );
  if (!match) {
    throw new Error(`Missing __NEXT_DATA__ on ${url}`);
  }
  return JSON.parse(match[1]);
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/537.36 Chrome Safari",
    },
  });
  if (!response.ok) {
    throw new Error(`Fetch failed ${response.status} for ${url}`);
  }
  return response.text();
}

function extractSlugs(indexHtml) {
  const slugs = new Set();
  const linkPattern = /href=["']([^"']*\/us\/en\/motorcycles\/([^/"'?]+)\.html[^"']*)["']/g;
  let match;
  while ((match = linkPattern.exec(indexHtml))) {
    const slug = match[2];
    if (!slug || slug === "index" || slug === "2025") continue;
    if (["cruiser", "touring", "sport", "trike", "adventure-touring"].includes(slug)) continue;
    slugs.add(slug);
  }
  return slugs.size ? [...slugs] : FALLBACK_SLUGS;
}

function extractSpecs(bikeProductDetails) {
  const groups =
    bikeProductDetails.specOptionsCollection?.items?.[0]?.specGroupsCollection?.items ?? [];
  const specs = {};
  const specLabels = {};
  for (const group of groups) {
    for (const entry of group.specEntriesCollection?.items ?? []) {
      if (!wantedSpecCodes.has(entry.code)) continue;
      specs[entry.code] = entry.formattedValue || entry.value || "";
      specLabels[entry.code] = entry.label || entry.code;
    }
  }
  return { specs: cleanSpecMap(specs), specLabels };
}

function extractImage(state) {
  const selected = state.bikeProductSelections?.selectedColorOption;
  return (
    selected?.product360Images?.[0] ||
    state.bikeProductDetails?.colorOptions?.[0]?.product360Images?.[0] ||
    null
  );
}

function badgesFor(model) {
  const text = [
    model.specs.engine,
    model.specs.frontFork,
    model.specs.rearShocks,
    model.specs.brakeCaliperType,
    model.specs.gauges,
    model.category,
  ]
    .join(" ")
    .toLowerCase();
  return [
    text.includes("milwaukee-eight") && "Milwaukee-Eight",
    text.includes("revolution") && "Revolution Max",
    text.includes("high output") && "High Output",
    text.includes("vvt") && "VVT",
    text.includes("semi-active") && "Semi-active suspension",
    text.includes("radial") && "Radial brakes",
    text.includes("tft") && "TFT display",
    text.includes("trike") && "Trike",
  ].filter(Boolean);
}

async function crawlModel(slug) {
  const url = `${BASE}/us/en/motorcycles/${slug}.html`;
  const html = await fetchText(url);
  const state = getNextData(html, url).props.pageProps.initialState;
  const details = state.bikeProductDetails;
  const { specs, specLabels } = extractSpecs(details);
  const model = {
    id: details.bikeId,
    slug,
    url,
    name: stripTags(details.formattedName),
    modelCode: details.modelCode || "",
    modelFamily: details.modelFamily || "",
    category: categoryFromFamily(details.modelFamily),
    modelYear: details.modelYear,
    price: details.priceFormatted || specs.msrpBase || "",
    monthly: details.monthlyPriceFormatted || "",
    image: extractImage(state),
    specs,
    specLabels,
    metrics: {},
    badges: [],
    dealerPricing: {
      status: "not-sampled",
      sampleCount: 0,
      marketsSampled: [],
      averageAdvertisedPrice: null,
      lowestAdvertisedPrice: null,
      highestAdvertisedPrice: null,
      averageDeltaFromMsrp: null,
      averageDeltaPercent: null,
      extrapolatedAveragePrice: null,
      extrapolatedDeltaFromMsrp: null,
      extrapolatedDeltaPercent: null,
      pricingBasis: "not-sampled",
      listings: [],
    },
  };
  model.metrics = computeMetrics(model);
  model.badges = badgesFor(model);
  return model;
}

async function main() {
  const indexHtml = await fetchText(INDEX_URL);
  const slugs = extractSlugs(indexHtml);
  const models = [];
  for (const slug of slugs) {
    process.stderr.write(`Crawling ${slug}\n`);
    models.push(await crawlModel(slug));
  }

  const output = {
    generatedAt: new Date().toISOString(),
    source: {
      lineupUrl: INDEX_URL,
      modelYear: 2026,
      note: "Official Harley-Davidson U.S. model pages parsed from __NEXT_DATA__.",
    },
    dealerPricing: {
      generatedAt: null,
      marketsSampled: [],
      note: "Run npm run crawl:dealer-prices to collect best-effort advertised dealer pricing.",
    },
    models,
  };

  await mkdir(path.dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, `${JSON.stringify(output, null, 2)}\n`);
  process.stdout.write(`Wrote ${models.length} models to ${OUTPUT}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
