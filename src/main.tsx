import React, { useMemo, useState } from "react";
import ReactDOM from "react-dom/client";
import {
  ArrowDownUp,
  BadgeDollarSign,
  Gauge,
  GitCompare,
  Search,
  Settings2,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import data from "./data/harley-lineup.json";
import { formatCurrency, formatNumber, formatPercent, formatSignedCurrency } from "./lib/format";
import { BikeModel, dealerPriceLabel, effectivePrice, hasUsableDealerSample } from "./lib/metrics";
import "./styles.css";

type SortKey =
  | "msrp"
  | "dealer"
  | "power"
  | "torque"
  | "powerWeight"
  | "costHp"
  | "range"
  | "weight"
  | "lean"
  | "luggage";

const lineup = data.models as BikeModel[];
const categories = ["All", ...Array.from(new Set(lineup.map((model) => model.category)))];

const presets = {
  Performance: ["horsepower", "torque", "powerToWeight", "leanAngle", "groundClearance"],
  Touring: ["estimatedRange", "luggageCapacity", "fuelCapacity", "runningWeight", "seatHeight"],
  Value: ["msrp", "dealerAverage", "costPerHp", "costPerTorque", "averageDeltaPercent"],
  Ergonomics: ["seatHeight", "groundClearance", "wheelbase", "leanAngle", "runningWeight"],
  Mechanical: ["displacementCi", "compressionRatio", "torqueRpm", "firstGearRatio", "sixthGearRatio"],
} as const;

const metricLabels: Record<string, string> = {
  horsepower: "HP",
  torque: "Torque",
  powerToWeight: "HP/LB",
  leanAngle: "Lean",
  groundClearance: "Clearance",
  estimatedRange: "Range",
  luggageCapacity: "Cargo",
  fuelCapacity: "Fuel",
  runningWeight: "Weight",
  seatHeight: "Seat",
  msrp: "MSRP",
  dealerAverage: "Dealer/Est.",
  costPerHp: "$/HP",
  costPerTorque: "$/LB-FT",
  averageDeltaPercent: "Dealer Delta",
  wheelbase: "Wheelbase",
  displacementCi: "CI",
  compressionRatio: "Compression",
  torqueRpm: "Torque RPM",
  firstGearRatio: "1st Gear",
  sixthGearRatio: "6th Gear",
};

const sortOptions: Array<{ key: SortKey; label: string; direction: "asc" | "desc" }> = [
  { key: "powerWeight", label: "Power-to-weight", direction: "desc" },
  { key: "dealer", label: "Dealer/est. price", direction: "asc" },
  { key: "costHp", label: "Cost per HP", direction: "asc" },
  { key: "torque", label: "Torque", direction: "desc" },
  { key: "range", label: "Estimated range", direction: "desc" },
  { key: "lean", label: "Lean angle", direction: "desc" },
  { key: "luggage", label: "Cargo volume", direction: "desc" },
  { key: "weight", label: "Running weight", direction: "asc" },
  { key: "msrp", label: "MSRP", direction: "asc" },
  { key: "power", label: "Horsepower", direction: "desc" },
];

function metricValue(model: BikeModel, key: string) {
  if (key === "dealerAverage") return effectivePrice(model);
  if (key === "averageDeltaPercent") {
    return model.dealerPricing.averageDeltaPercent ?? model.dealerPricing.extrapolatedDeltaPercent;
  }
  return model.metrics[key];
}

function sortValue(model: BikeModel, sort: SortKey) {
  switch (sort) {
    case "dealer":
      return effectivePrice(model);
    case "power":
      return model.metrics.horsepower;
    case "torque":
      return model.metrics.torque;
    case "powerWeight":
      return model.metrics.powerToWeight;
    case "costHp":
      return model.metrics.costPerHp;
    case "range":
      return model.metrics.estimatedRange;
    case "weight":
      return model.metrics.runningWeight;
    case "lean":
      return model.metrics.leanAngle;
    case "luggage":
      return model.metrics.luggageCapacity;
    case "msrp":
    default:
      return model.metrics.msrp;
  }
}

function displayMetric(key: string, value: number | null | undefined) {
  if (key === "msrp" || key === "dealerAverage" || key === "costPerHp" || key === "costPerTorque") {
    return formatCurrency(value);
  }
  if (key === "averageDeltaPercent") return formatPercent(value);
  if (key === "powerToWeight") return value == null ? "—" : value.toFixed(3);
  if (key === "compressionRatio") return value == null ? "—" : `${value.toFixed(1)}:1`;
  if (key === "estimatedRange") return value == null ? "—" : `${formatNumber(value, 0)} mi`;
  if (key === "luggageCapacity") return value == null ? "—" : `${formatNumber(value, 1)} cu ft`;
  if (key === "fuelCapacity") return value == null ? "—" : `${formatNumber(value, 1)} gal`;
  if (key === "runningWeight") return value == null ? "—" : `${formatNumber(value)} lb`;
  if (key === "seatHeight" || key === "groundClearance" || key === "wheelbase") {
    return value == null ? "—" : `${formatNumber(value, 1)} in`;
  }
  if (key === "leanAngle") return value == null ? "—" : `${formatNumber(value, 1)}°`;
  return formatNumber(value, key.includes("Ratio") ? 2 : 0);
}

function dealerStatus(model: BikeModel) {
  const pricing = model.dealerPricing;
  if (pricing.status === "sampled") return `${pricing.sampleCount} listings`;
  if (pricing.status === "limited-sample") return `${pricing.sampleCount} listings, limited`;
  if (pricing.status === "extrapolated") return "Extrapolated";
  if (pricing.status === "no-sample") return "No crawlable listings";
  return "Not sampled";
}

function App() {
  const [category, setCategory] = useState("All");
  const [preset, setPreset] = useState<keyof typeof presets>("Performance");
  const [sortKey, setSortKey] = useState<SortKey>("powerWeight");
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [activeModelId, setActiveModelId] = useState(lineup[0]?.id ?? "");

  const sort = sortOptions.find((option) => option.key === sortKey) ?? sortOptions[0];
  const visibleModels = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return lineup
      .filter((model) => category === "All" || model.category === category)
      .filter((model) => {
        if (!normalizedQuery) return true;
        return [model.name, model.modelCode, model.category, model.specs.engine, ...model.badges]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);
      })
      .sort((a, b) => {
        const aValue = sortValue(a, sortKey);
        const bValue = sortValue(b, sortKey);
        if (aValue == null && bValue == null) return a.name.localeCompare(b.name);
        if (aValue == null) return 1;
        if (bValue == null) return -1;
        return sort.direction === "asc" ? aValue - bValue : bValue - aValue;
      });
  }, [category, query, sort.direction, sortKey]);

  const activeModel = visibleModels.find((model) => model.id === activeModelId) ?? visibleModels[0] ?? null;
  const selectedModels = selectedIds
    .map((id) => lineup.find((model) => model.id === id))
    .filter(Boolean) as BikeModel[];

  function toggleSelected(model: BikeModel) {
    setSelectedIds((ids) => {
      if (ids.includes(model.id)) return ids.filter((id) => id !== model.id);
      return [...ids.slice(-3), model.id];
    });
  }

  return (
    <div className="app">
      <header className="masthead">
        <div className="utility">Latest official U.S. lineup · Data generated {new Date(data.generatedAt).toLocaleDateString()}</div>
        <div className="brandRow">
          <div>
            <p className="eyebrow">Technical Lineup Compare</p>
            <h1>Harley-Davidson 2026</h1>
          </div>
          <div className="sourceBlock">
            <span>{lineup.length} models</span>
            <a href={data.source.lineupUrl} target="_blank" rel="noreferrer">
              Official source
            </a>
          </div>
        </div>
      </header>

      <main>
        <section className="controls" aria-label="Comparison controls">
          <div className="tabs">
            {categories.map((item) => (
              <button
                className={item === category ? "active" : ""}
                key={item}
                onClick={() => setCategory(item)}
              >
                {item}
              </button>
            ))}
          </div>

          <div className="toolGrid">
            <label className="searchBox">
              <Search size={18} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search model, engine, feature"
              />
            </label>

            <label className="selectBox">
              <ArrowDownUp size={18} />
              <select value={sortKey} onChange={(event) => setSortKey(event.target.value as SortKey)}>
                {sortOptions.map((option) => (
                  <option value={option.key} key={option.key}>
                    Sort: {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="presetRow">
            {Object.keys(presets).map((item) => (
              <button
                className={item === preset ? "active" : ""}
                key={item}
                onClick={() => setPreset(item as keyof typeof presets)}
              >
                {item}
              </button>
            ))}
          </div>
        </section>

        <section className="summaryStrip" aria-label="Lineup summary">
          <MetricTile icon={<Gauge />} label="Highest HP" model={topBy("horsepower")} valueSuffix=" HP" metric="horsepower" />
          <MetricTile icon={<Wrench />} label="Best HP/LB" model={topBy("powerToWeight")} metric="powerToWeight" />
          <MetricTile icon={<BadgeDollarSign />} label="Lowest $/HP" model={lowBy("costPerHp")} metric="costPerHp" currency />
          <MetricTile icon={<ShieldCheck />} label="Longest Range" model={topBy("estimatedRange")} valueSuffix=" mi" metric="estimatedRange" />
        </section>

        <section className="contentGrid">
          <div className="modelGrid" aria-label="Motorcycle cards">
            {visibleModels.length === 0 && (
              <div className="emptyState">
                <strong>No matching models</strong>
                <span>Try a different category or search term.</span>
              </div>
            )}
            {visibleModels.map((model) => (
              <article
                className={`modelCard ${model.id === activeModel?.id ? "active" : ""}`}
                key={model.id}
                onClick={() => setActiveModelId(model.id)}
              >
                <div className="imageStage">
                  {model.image ? <img src={model.image} alt={model.name} /> : <span>No image</span>}
                </div>
                <div className="cardBody">
                  <div className="cardTitleRow">
                    <div>
                      <p>{model.category}</p>
                      <h2>{model.name}</h2>
                    </div>
                    <button
                      className={`compareButton ${selectedIds.includes(model.id) ? "selected" : ""}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        toggleSelected(model);
                      }}
                      title="Toggle compare"
                    >
                      <GitCompare size={17} />
                    </button>
                  </div>

                  <div className="priceRow">
                    <div>
                      <span>MSRP</span>
                      <strong>{formatCurrency(model.metrics.msrp)}</strong>
                    </div>
                    <div>
                      <span>{dealerPriceLabel(model)}</span>
                      <strong>{formatCurrency(effectivePrice(model))}</strong>
                    </div>
                  </div>

                  <dl className="quickSpecs">
                    <div>
                      <dt>HP</dt>
                      <dd>{formatNumber(model.metrics.horsepower)}</dd>
                    </div>
                    <div>
                      <dt>Torque</dt>
                      <dd>{formatNumber(model.metrics.torque)} lb-ft</dd>
                    </div>
                    <div>
                      <dt>Weight</dt>
                      <dd>{formatNumber(model.metrics.runningWeight)} lb</dd>
                    </div>
                    <div>
                      <dt>Range</dt>
                      <dd>{formatNumber(model.metrics.estimatedRange)} mi</dd>
                    </div>
                  </dl>

                  <div className="badgeRow">
                    {model.badges.slice(0, 3).map((badge) => (
                      <span key={badge}>{badge}</span>
                    ))}
                  </div>
                </div>
              </article>
            ))}
          </div>

          {activeModel ? (
            <aside className="detailPanel">
              <div className="panelHeader">
                <p>{activeModel.modelCode}</p>
                <h2>{activeModel.name}</h2>
                <a href={activeModel.url} target="_blank" rel="noreferrer">
                  View official page
                </a>
              </div>

              <div className="dealerBox">
                <div>
                  <p>{hasUsableDealerSample(activeModel) ? "Dealer advertised average" : "Estimated price"}</p>
                  <strong>{formatCurrency(effectivePrice(activeModel))}</strong>
                </div>
                <span className={hasUsableDealerSample(activeModel) ? "sampled" : "unsampled"}>
                  {dealerStatus(activeModel)}
                </span>
                <small>
                  Delta vs MSRP:{" "}
                  {formatSignedCurrency(
                    activeModel.dealerPricing.averageDeltaFromMsrp ??
                      activeModel.dealerPricing.extrapolatedDeltaFromMsrp
                  )}{" "}
                  (
                  {formatPercent(
                    activeModel.dealerPricing.averageDeltaPercent ??
                      activeModel.dealerPricing.extrapolatedDeltaPercent
                  )}
                  )
                </small>
                <small>{activeModel.dealerPricing.pricingBasis}</small>
              </div>

              <div className="metricList">
                {(presets[preset] as readonly string[]).map((key) => (
                  <div key={key}>
                    <span>{metricLabels[key]}</span>
                    <strong>{displayMetric(key, metricValue(activeModel, key))}</strong>
                  </div>
                ))}
              </div>

              <div className="specBlock">
                <h3>Mechanical Notes</h3>
                <dl>
                  <div>
                    <dt>Engine</dt>
                    <dd>{activeModel.specs.engine}</dd>
                  </div>
                  <div>
                    <dt>Front</dt>
                    <dd>{activeModel.specs.frontFork}</dd>
                  </div>
                  <div>
                    <dt>Rear</dt>
                    <dd>{activeModel.specs.rearShocks}</dd>
                  </div>
                  <div>
                    <dt>Brakes</dt>
                    <dd>{activeModel.specs.brakeCaliperType}</dd>
                  </div>
                </dl>
              </div>
            </aside>
          ) : (
            <aside className="detailPanel emptyState">
              <strong>No model selected</strong>
              <span>Adjust the filters to show matching motorcycles.</span>
            </aside>
          )}
        </section>

        <section className="tableSection">
          <div className="sectionTitle">
            <Settings2 size={20} />
            <h2>Sortable Technical Table</h2>
          </div>
          <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  <th>Model</th>
                  <th>Category</th>
                  <th>MSRP</th>
                  <th>Dealer/Est.</th>
                  <th>Delta</th>
                  <th>HP</th>
                  <th>Torque</th>
                  <th>HP/LB</th>
                  <th>$/HP</th>
                  <th>Range</th>
                  <th>Weight</th>
                  <th>Lean</th>
                  <th>Cargo</th>
                </tr>
              </thead>
              <tbody>
                {visibleModels.map((model) => (
                  <tr key={model.id}>
                    <th>
                      <button onClick={() => setActiveModelId(model.id)}>{model.name}</button>
                      <small>{model.modelCode}</small>
                    </th>
                    <td>{model.category}</td>
                    <td>{formatCurrency(model.metrics.msrp)}</td>
                    <td>
                      {formatCurrency(effectivePrice(model))}
                      <small>{dealerStatus(model)}</small>
                    </td>
                    <td>
                      {formatPercent(
                        model.dealerPricing.averageDeltaPercent ??
                          model.dealerPricing.extrapolatedDeltaPercent
                      )}
                    </td>
                    <td>{formatNumber(model.metrics.horsepower)}</td>
                    <td>{formatNumber(model.metrics.torque)}</td>
                    <td>{displayMetric("powerToWeight", model.metrics.powerToWeight)}</td>
                    <td>{formatCurrency(model.metrics.costPerHp)}</td>
                    <td>{displayMetric("estimatedRange", model.metrics.estimatedRange)}</td>
                    <td>{displayMetric("runningWeight", model.metrics.runningWeight)}</td>
                    <td>{displayMetric("leanAngle", model.metrics.leanAngle)}</td>
                    <td>{displayMetric("luggageCapacity", model.metrics.luggageCapacity)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {selectedModels.length > 0 && (
          <section className="compareDock" aria-label="Selected model comparison">
            <div className="compareTitle">
              <GitCompare size={18} />
              <strong>Compare {selectedModels.length}</strong>
              <button onClick={() => setSelectedIds([])}>Clear</button>
            </div>
            <div className="compareModels">
              {selectedModels.map((model) => (
                <div key={model.id}>
                  <span>{model.name}</span>
                  <strong>{formatCurrency(effectivePrice(model))}</strong>
                  <small>
                    {formatNumber(model.metrics.horsepower)} HP · {formatNumber(model.metrics.torque)} lb-ft ·{" "}
                    {formatNumber(model.metrics.runningWeight)} lb
                  </small>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function topBy(metric: string) {
  return lineup.reduce((best, model) => {
    const current = model.metrics[metric] ?? -Infinity;
    const bestValue = best.metrics[metric] ?? -Infinity;
    return current > bestValue ? model : best;
  }, lineup[0]);
}

function lowBy(metric: string) {
  return lineup.reduce((best, model) => {
    const current = model.metrics[metric] ?? Infinity;
    const bestValue = best.metrics[metric] ?? Infinity;
    return current < bestValue ? model : best;
  }, lineup[0]);
}

function MetricTile({
  icon,
  label,
  model,
  metric,
  valueSuffix = "",
  currency,
}: {
  icon: React.ReactNode;
  label: string;
  model: BikeModel;
  metric: string;
  valueSuffix?: string;
  currency?: boolean;
}) {
  const value = model.metrics[metric];
  return (
    <div className="metricTile">
      <span>{icon}</span>
      <div>
        <p>{label}</p>
        <strong>{currency ? formatCurrency(value) : `${formatNumber(value, metric === "powerToWeight" ? 3 : 0)}${valueSuffix}`}</strong>
        <small>{model.name}</small>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
