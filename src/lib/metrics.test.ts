import { describe, expect, it } from "vitest";
import { parseHorsepower, parseMoney, parseNumber, parseSeatHeight } from "./metrics";

describe("metric parsing", () => {
  it("parses money", () => {
    expect(parseMoney("$23,999")).toBe(23999);
    expect(parseMoney("+ $1,150")).toBe(1150);
  });

  it("parses leading numbers with units", () => {
    expect(parseNumber("128 ft-lbs")).toBe(128);
    expect(parseNumber("1,184 lb.")).toBe(1184);
  });

  it("parses horsepower before metric conversion text", () => {
    expect(parseHorsepower("114 HP / 85 kW @ 5000 rpm")).toBe(114);
  });

  it("uses the low seat height from adjustable seat strings", () => {
    expect(parseSeatHeight("Low/High Seat Position; 31.1 in./32 in.")).toBe(31.1);
  });
});
