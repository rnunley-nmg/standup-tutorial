export function parseMoney(value: string | null | undefined) {
  const match = String(value ?? "").match(/[\d,]+/);
  return match ? Number(match[0].replaceAll(",", "")) : null;
}

export function parseNumber(value: string | null | undefined) {
  const match = String(value ?? "").replaceAll(",", "").match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

export function parseHorsepower(value: string | null | undefined) {
  const match = String(value ?? "").match(/(\d+(?:\.\d+)?)\s*HP/i);
  return match ? Number(match[1]) : parseNumber(value);
}

export function parseSeatHeight(value: string | null | undefined) {
  const numbers = String(value ?? "").match(/\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  return numbers.length ? Math.min(...numbers) : null;
}

export type DealerPricing = {
  status: "not-sampled" | "no-sample" | "extrapolated" | "limited-sample" | "sampled";
  sampleCount: number;
  averageAdvertisedPrice: number | null;
  lowestAdvertisedPrice: number | null;
  highestAdvertisedPrice: number | null;
  averageDeltaFromMsrp: number | null;
  averageDeltaPercent: number | null;
  extrapolatedAveragePrice: number | null;
  extrapolatedDeltaFromMsrp: number | null;
  extrapolatedDeltaPercent: number | null;
  pricingBasis: string;
  marketsSampled: string[];
};

export type BikeModel = {
  id: string;
  slug: string;
  url: string;
  name: string;
  modelCode: string;
  modelFamily: string;
  category: string;
  modelYear: number;
  price: string;
  monthly: string;
  image: string | null;
  badges: string[];
  specs: Record<string, string | undefined>;
  specLabels: Record<string, string | undefined>;
  metrics: Record<string, number | null>;
  dealerPricing: DealerPricing;
};

export function effectivePrice(model: BikeModel) {
  return (
    model.dealerPricing.averageAdvertisedPrice ??
    model.dealerPricing.extrapolatedAveragePrice ??
    model.metrics.msrp ??
    null
  );
}

export function hasUsableDealerSample(model: BikeModel) {
  return model.dealerPricing.status === "sampled" || model.dealerPricing.status === "limited-sample";
}
