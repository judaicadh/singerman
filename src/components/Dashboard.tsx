import { useEffect, useMemo, useRef, useState } from "react";

/* ------------------------------------------------------------------ *
 * Types — compact record format emitted by visualize.astro.
 *   places: [name, lat, lng][]  (indexed by placeIdx)
 *   records: [year, placeIdx, langIdx][]
 *   langs:  language bucket names (indexed by langIdx)
 * ------------------------------------------------------------------ */
type Place = [string, number, number];
// [placeIdx, primaryLang, isSerial, years[], langMask, isDigitized] — years[0]
// is the primary year; langMask is a bitmask of every language bucket in the work.
type Record = [number, number, number, number[], number, number];
type Format = "all" | "serial" | "mono";

interface Props {
  places: Place[];
  records: Record[];
  langs: string[];
  minYear: number;
  maxYear: number;
  cartoKey?: string;
  topAuthors: [string, number][];
  topContributors: [string, number][];
  growth: {
    pre1801: number;
    inc1801_1825: number;
    growth1: number;
    inc1826_1850: number;
    growth2: number;
    cw1860_1865: number;
    cw1861_1865: number;
    by1865: number;
    doubleYear: number;
    doubleCount: number;
    doubleGrowth: number;
  };
}

/* Categorical palette — colour-blind-friendly, tuned for both themes.
   Indices line up with the `langs` array built in visualize.astro. */
const LANG_COLORS: string[] = [
  "#2563eb", // English  — blue
  "#b91c1c", // Yiddish  — scholar red (brand)
  "#059669", // Hebrew   — green
  "#d97706", // German   — amber
  "#7c3aed", // Other    — violet
];

/* Distinct palette for the city-comparison lines (kept separate from the
   language colours so the two charts never look like they share a key). */
const CITY_COLORS: string[] = [
  "#0ea5e9", "#e11d48", "#16a34a", "#d97706", "#7c3aed", "#0d9488", "#db2777", "#4f46e5",
];
const MAX_CITIES = 6;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/* The n place indices with the most records — used to seed the comparison. */
function topPlacesByCount(records: Record[], n: number): number[] {
  const counts = new Map<number, number>();
  for (const r of records) counts.set(r[0], (counts.get(r[0]) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map((e) => e[0]);
}

/* Light-gray "Positron" canvas that makes the coloured markers pop.
   With a CARTO key we use CARTO Positron; without one the CARTO CDN now
   watermarks tiles, so we fall back to Esri's key-free light-gray canvas
   (visually equivalent, {z}/{y}/{x} order, no watermark). */
const CARTO_VECTOR_STYLE = "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";
const CARTO_ATTR =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';
const ESRI_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}";
const ESRI_ATTR = "Tiles &copy; Esri";

/* Wait for the Leaflet global injected by the page <head>. */
function useLeaflet(): any | null {
  const [L, setL] = useState<any | null>(
    typeof window !== "undefined" ? (window as any).L ?? null : null,
  );
  useEffect(() => {
    if (L) return;
    let done = false;
    const id = setInterval(() => {
      const g = (window as any).L;
      if (g && !done) {
        done = true;
        clearInterval(id);
        setL(g);
      }
    }, 50);
    return () => clearInterval(id);
  }, [L]);
  return L;
}

export default function Dashboard({
  places,
  records,
  langs,
  minYear,
  maxYear,
  cartoKey,
  topAuthors,
  topContributors,
  growth,
}: Props) {
  // Round to the nearest ten for the "~" figures in the narrative.
  const round10 = (n: number) => Math.round(n / 10) * 10;

  // Reusable ranked horizontal-bar list for the "top N" charts.
  const BarRows = ({ data, color }: { data: [string, number][]; color: string }) => {
    const max = data.length ? data[0][1] : 1;
    return (
      <ul className="space-y-1.5">
        {data.map(([label, count]) => (
          <li key={label} className="flex items-center gap-3 text-sm">
            <span className="w-32 sm:w-40 shrink-0 truncate font-bold text-[#1a1a1a] dark:text-[#e5e5e5]" title={label}>{label}</span>
            <span className="flex-grow h-3.5 bg-gray-100 dark:bg-gray-800 rounded overflow-hidden">
              <span className="block h-full rounded" style={{ width: `${(count / max) * 100}%`, backgroundColor: color }} />
            </span>
            <span className="w-12 text-right tabular-nums text-gray-500 dark:text-gray-400">{count.toLocaleString()}</span>
          </li>
        ))}
      </ul>
    );
  };
  const L = useLeaflet();

  // Selected time window [start, end].
  const [start, setStart] = useState(minYear);
  const [end, setEnd] = useState(maxYear);
  // Which language buckets are active (all on by default).
  const [activeLangs, setActiveLangs] = useState<boolean[]>(() =>
    langs.map(() => true),
  );
  const [playing, setPlaying] = useState(false);
  // Serial / monograph filter.
  const [format, setFormat] = useState<Format>("all");
  // How multi-dated records (serials with several publication years) are counted:
  //  "first" — count each title once by its primary year (matches a standard,
  //            one-record-per-title tally);
  //  "all"   — count a title in every year of its run (shows serial longevity).
  const [countMode, setCountMode] = useState<"first" | "all">("first");
  // Timeline shape: per-year bars, or a cumulative running total (growth curve).
  const [timelineMode, setTimelineMode] = useState<"year" | "cumulative">("year");
  // Timeline x-axis view domain (zoom). Defaults to the full range.
  const [view, setView] = useState<[number, number]>([minYear, maxYear]);
  const viewStart = view[0];
  const viewEnd = view[1];
  // Cities being compared in the trend chart (place indices, up to MAX_CITIES).
  const [selectedPlaces, setSelectedPlaces] = useState<number[]>(() =>
    topPlacesByCount(records, 4),
  );

  const toggleCity = (pi: number) =>
    setSelectedPlaces((s) =>
      s.includes(pi) ? s.filter((x) => x !== pi) : s.length >= MAX_CITIES ? s : [...s, pi],
    );

  // Build a bibliography (search) URL that carries the current place plus the
  // dashboard's year window and language selection, so browsing the actual
  // records reflects what's on screen. ("Other" has no single search facet, so
  // it's skipped; the year is only added when the window is narrowed.)
  const bibliographyUrl = (placeName?: string): string => {
    const params = new URLSearchParams();
    if (placeName) params.set("place", placeName);
    if (!activeLangs.every(Boolean)) {
      // langs 0–3 (English, Yiddish, Hebrew, German) map 1:1 to search facets.
      for (let i = 0; i < 4; i++) if (activeLangs[i]) params.append("language", langs[i]);
    }
    if (start > minYear) params.set("start", String(start));
    if (end < maxYear) params.set("end", String(end));
    return `/search/?${params.toString()}`;
  };

  const matchesFormat = (isSerial: number) =>
    format === "all" || (format === "serial" ? isSerial === 1 : isSerial === 0);

  // Bitmask of the currently-enabled languages.
  const activeMask = useMemo(
    () => activeLangs.reduce((m, on, i) => (on ? m | (1 << i) : m), 0),
    [activeLangs],
  );

  // Whether a record falls in the window. In "first" mode only its primary year
  // counts (one title, one date); in "all" mode any year of its run qualifies.
  const inWindow = (years: number[]) =>
    countMode === "all"
      ? years.some((y) => y >= start && y <= end)
      : years[0] >= start && years[0] <= end;

  const toggleLang = (i: number) =>
    setActiveLangs((a) => a.map((v, idx) => (idx === i ? !v : v)));

  /* ----------------------------- Playback ----------------------------- *
   * "Scroll over time": sweep the END of the window forward from the
   * current start to maxYear, revealing the record set as it grows. */
  useEffect(() => {
    if (!playing) return;
    if (end >= maxYear) {
      // Restart from the beginning of the current window.
      setEnd(clamp(start + 1, minYear, maxYear));
      return;
    }
    const t = setTimeout(() => {
      setEnd((e) => clamp(e + Math.max(1, Math.round((maxYear - minYear) / 120)), minYear, maxYear));
    }, 90);
    return () => clearTimeout(t);
  }, [playing, end, start, minYear, maxYear]);

  const play = () => {
    if (end >= maxYear) setEnd(clamp(start + 1, minYear, maxYear));
    setPlaying(true);
  };

  /* -------------------- Yearly totals per language -------------------- *
   * counts[year - minYear][langIdx], by the record's primary language and
   * honouring the format filter (but not the language toggles, so toggling a
   * language recolours the timeline without reflowing bar heights). Every year
   * of a serial's run contributes. */
  const yearLangCounts = useMemo(() => {
    const width = maxYear - minYear + 1;
    const grid: number[][] = Array.from({ length: width }, () =>
      new Array(langs.length).fill(0),
    );
    for (const [, li, isSerial, years] of records) {
      if (!matchesFormat(isSerial)) continue;
      const ys = countMode === "all" ? years : [years[0]];
      for (const y of ys) {
        const row = grid[y - minYear];
        if (row) row[li]++;
      }
    }
    return grid;
  }, [records, minYear, maxYear, langs.length, format, countMode]);

  // Running cumulative totals per language (for the "Cumulative" timeline view),
  // which makes the overall growth of the corpus legible.
  const cumulativeCounts = useMemo(() => {
    const run = new Array(langs.length).fill(0);
    return yearLangCounts.map((row) => {
      for (let i = 0; i < row.length; i++) run[i] += row[i];
      return [...run];
    });
  }, [yearLangCounts, langs.length]);

  const displayGrid = timelineMode === "cumulative" ? cumulativeCounts : yearLangCounts;
  const maxYearTotal = useMemo(
    () => Math.max(1, ...displayGrid.map((r) => r.reduce((a, b) => a + b, 0))),
    [displayGrid],
  );

  /* --------- Records visible under the current window + filters -------- *
   * A record is kept when it matches the format, overlaps the window, and is
   * in at least one enabled language (bilingual works count for each). */
  const visible = useMemo(
    () =>
      records.filter(
        ([, , isSerial, years, mask]) =>
          (mask & activeMask) !== 0 && matchesFormat(isSerial) && inWindow(years),
      ),
    [records, start, end, activeMask, format, countMode],
  );

  /* Aggregate visible records by place → per-language membership counts.
     A work in "English | Hebrew" counts toward both, restricted to the
     enabled languages so the map colour reflects what is currently shown. */
  const placeAgg = useMemo(() => {
    const map = new Map<number, { total: number; byLang: number[] }>();
    for (const [pi, , , , mask] of visible) {
      let e = map.get(pi);
      if (!e) {
        e = { total: 0, byLang: new Array(langs.length).fill(0) };
        map.set(pi, e);
      }
      e.total++;
      for (let i = 0; i < langs.length; i++)
        if (mask & (1 << i) & activeMask) e.byLang[i]++;
    }
    return map;
  }, [visible, langs.length, activeMask]);

  const stats = useMemo(() => {
    let top = { name: "—", count: 0 };
    for (const [pi, e] of placeAgg) {
      if (e.total > top.count) top = { name: places[pi]?.[0] ?? "—", count: e.total };
    }
    return { total: visible.length, cities: placeAgg.size, top };
  }, [placeAgg, visible.length, places]);

  // Legend counts: works containing each language within the current window +
  // format (independent of the language toggles, so the numbers stay stable).
  // Bilingual works count toward every language they contain, so these can sum
  // to more than the imprint total.
  const langTotals = useMemo(() => {
    const t = new Array(langs.length).fill(0);
    for (const [, , isSerial, years, mask] of records) {
      if (!matchesFormat(isSerial) || !inWindow(years)) continue;
      for (let i = 0; i < langs.length; i++) if (mask & (1 << i)) t[i]++;
    }
    return t;
  }, [records, start, end, format, langs.length, countMode]);

  /* ------------------ City comparison (imprints per year) ------------------ *
   * For each selected city, a per-year count honouring the format + language
   * filters (every year of a serial's run contributes, as on the timeline). */
  const topCities = useMemo(() => topPlacesByCount(records, 10), [records]);
  const width = maxYear - minYear + 1;
  const citySeries = useMemo(
    () =>
      selectedPlaces.map((pi) => {
        const arr = new Array(width).fill(0);
        for (const [p, , isSerial, years, mask] of records) {
          if (p !== pi || !matchesFormat(isSerial) || (mask & activeMask) === 0) continue;
          const ys = countMode === "all" ? years : [years[0]];
          for (const y of ys) {
            const idx = y - minYear;
            if (idx >= 0 && idx < width) arr[idx]++;
          }
        }
        return arr;
      }),
    [selectedPlaces, records, minYear, width, format, activeMask, countMode],
  );
  const maxCityVal = useMemo(
    () => Math.max(1, ...citySeries.flat()),
    [citySeries],
  );
  const cityTotals = useMemo(
    () => citySeries.map((s) => s.reduce((a, b) => a + b, 0)),
    [citySeries],
  );

  /* ---------------- Additional analytic views (below the map) ---------------- */

  // Top cities in the current view (dynamic — honours window + all filters).
  const topCitiesInView = useMemo(() => {
    const arr = [...placeAgg.entries()]
      .map(([pi, e]) => [places[pi]?.[0] ?? "—", e.total] as [string, number])
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12);
    return arr;
  }, [placeAgg, places]);

  // Imprints by US state (from the ", XX" suffix on place names), dynamic.
  const stateCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const [pi, e] of placeAgg) {
      const match = /,\s*([A-Z]{2})\s*$/.exec(places[pi]?.[0] ?? "");
      const st = match ? match[1] : "—";
      m.set(st, (m.get(st) ?? 0) + e.total);
    }
    return [...m.entries()].filter(([s]) => s !== "—").sort((a, b) => b[1] - a[1]);
  }, [placeAgg, places]);

  // Serials vs. monographs per year (honours countMode; independent of the
  // Serials/Monographs format toggle so both series always show).
  const serialMonoByYear = useMemo(() => {
    const w = maxYear - minYear + 1;
    const mono = new Array(w).fill(0);
    const ser = new Array(w).fill(0);
    for (const [, , isSerial, years] of records) {
      const ys = countMode === "all" ? years : [years[0]];
      for (const y of ys) {
        const idx = y - minYear;
        if (idx < 0 || idx >= w) continue;
        (isSerial ? ser : mono)[idx]++;
      }
    }
    return { mono, ser };
  }, [records, minYear, maxYear, countMode]);

  // Digitization coverage by decade: [decadeLabel, total, digitized].
  const digitizedByDecade = useMemo(() => {
    const buckets = new Map<number, { total: number; digi: number }>();
    for (const [, , isSerial, years, , isDigi] of records) {
      if (!matchesFormat(isSerial)) continue;
      const y = years[0];
      const dec = Math.floor(y / 10) * 10;
      let b = buckets.get(dec);
      if (!b) { b = { total: 0, digi: 0 }; buckets.set(dec, b); }
      b.total++;
      if (isDigi) b.digi++;
    }
    return [...buckets.entries()].sort((a, b) => a[0] - b[0]).map(([dec, b]) => ({
      decade: dec,
      total: b.total,
      digi: b.digi,
      pct: b.total ? b.digi / b.total : 0,
    }));
  }, [records, format]);

  /* ------------------------------- Map -------------------------------- */
  const mapEl = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const layerRef = useRef<any>(null);
  const tileRef = useRef<any>(null);

  // Initialise the Leaflet map once L is available.
  useEffect(() => {
    if (!L || !mapEl.current || mapRef.current) return;
    const map = L.map(mapEl.current, {
      center: [39.5, -96],
      zoom: 4,
      scrollWheelZoom: true,
      worldCopyJump: true,
    });
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    // Ensure the map sizes correctly after layout settles, and keep it in
    // sync whenever its container is resized (responsive breakpoints, etc.).
    setTimeout(() => map.invalidateSize(), 200);
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(mapEl.current);
    return () => ro.disconnect();
  }, [L]);

  // Basemap: CARTO's vector Positron via MapLibre GL when the bridge is
  // loaded (true Positron, unwatermarked); otherwise a key-free Esri raster
  // canvas as a graceful fallback.
  useEffect(() => {
    if (!L || !mapRef.current || tileRef.current) return;
    const mgl = (window as any).maplibregl;
    const maplibreGL = (L as any).maplibreGL;
    if (mgl && maplibreGL) {
      tileRef.current = maplibreGL({
        style: CARTO_VECTOR_STYLE,
        attribution: CARTO_ATTR,
      }).addTo(mapRef.current);
    } else {
      tileRef.current = L.tileLayer(ESRI_URL, {
        attribution: ESRI_ATTR,
        maxZoom: 20,
      }).addTo(mapRef.current);
    }
  }, [L]);

  // Redraw markers whenever the aggregation changes.
  useEffect(() => {
    const L2 = (window as any).L;
    if (!L2 || !mapRef.current || !layerRef.current) return;
    const layer = layerRef.current;
    layer.clearLayers();

    const maxCount = Math.max(1, ...Array.from(placeAgg.values(), (e) => e.total));

    for (const [pi, e] of placeAgg) {
      const p = places[pi];
      if (!p) continue;
      const [name, lat, lng] = p;
      // Dominant language among the (filtered) records at this place.
      let dom = 0;
      for (let i = 1; i < e.byLang.length; i++)
        if (e.byLang[i] > e.byLang[dom]) dom = i;
      const color = LANG_COLORS[dom] ?? "#6b7280";
      const radius = 4 + 22 * Math.sqrt(e.total / maxCount);

      const breakdown = e.byLang
        .map((c, i) => (c > 0 ? `<span style="color:${LANG_COLORS[i]}">●</span> ${langs[i]}: ${c}` : ""))
        .filter(Boolean)
        .join("<br>");

      const bibUrl = bibliographyUrl(name);
      const m = L2.circleMarker([lat, lng], {
        radius,
        color: "#ffffff",
        weight: 1,
        fillColor: color,
        fillOpacity: 0.72,
      }).bindTooltip(
        `<strong>${name}</strong> · ${e.total.toLocaleString()} ${e.total === 1 ? "imprint" : "imprints"}`,
        { direction: "top" },
      );

      // Click opens a popup with the place breakdown, a link into the
      // bibliography (filtered to this place), and a compare toggle.
      const popup = document.createElement("div");
      popup.style.minWidth = "180px";
      popup.innerHTML =
        `<strong style="font-size:13px">${name}</strong>` +
        `<div style="color:#6b7280;margin:2px 0 6px">${e.total.toLocaleString()} ${e.total === 1 ? "imprint" : "imprints"}, ${start}–${end}</div>` +
        `<div style="margin-bottom:8px">${breakdown}</div>` +
        `<a href="${bibUrl}" target="_blank" rel="noopener" style="color:#b91c1c;font-weight:700;text-decoration:underline">Browse in bibliography →</a>`;
      const cmp = document.createElement("button");
      cmp.textContent = "＋ Compare over time";
      cmp.style.cssText =
        "display:block;margin-top:8px;padding:5px 10px;border:1px solid #e5e7eb;border-radius:4px;background:#1a1a1a;color:#fff;font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:.08em;cursor:pointer;width:100%";
      cmp.onclick = () => toggleCity(pi);
      popup.appendChild(cmp);
      m.bindPopup(popup);
      layer.addLayer(m);
    }
  }, [placeAgg, places, langs, start, end]);

  /* ---------------------- Timeline (stacked SVG) ---------------------- */
  const TL_W = 1000;
  const TL_H = 120;
  const viewSpan = viewEnd - viewStart + 1;
  const barW = TL_W / viewSpan;

  // Convert a client x-position on the timeline to a year (within the zoom view).
  const yearFromClientX = (clientX: number, rect: DOMRect) => {
    const ratio = clamp((clientX - rect.left) / rect.width, 0, 1);
    return Math.round(viewStart + ratio * (viewEnd - viewStart));
  };

  const dragMode = useRef<null | "start" | "end">(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const onTimelinePointer = (clientX: number) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const yr = yearFromClientX(clientX, rect);
    if (dragMode.current === "start") setStart(clamp(yr, minYear, end));
    else if (dragMode.current === "end") setEnd(clamp(yr, start, maxYear));
  };

  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (dragMode.current) onTimelinePointer(e.clientX);
    };
    const up = () => (dragMode.current = null);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  });

  const xForYear = (y: number) => ((y - viewStart) / viewSpan) * TL_W;

  // Mouse-wheel zoom, centred on the year under the cursor. Attached as a
  // non-passive native listener so preventDefault() actually stops the page
  // from scrolling (React's onWheel is passive and cannot preventDefault).
  const viewRef = useRef(view);
  viewRef.current = view;
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const [vs, ve] = viewRef.current;
      const vspan = ve - vs + 1;
      const ratio = clamp((e.clientX - rect.left) / rect.width, 0, 1);
      const pivot = Math.round(vs + ratio * (ve - vs));
      const factor = e.deltaY < 0 ? 0.8 : 1.25; // wheel up = zoom in
      const fullSpan = maxYear - minYear + 1;
      const newSpan = clamp(Math.round(vspan * factor), 6, fullSpan);
      const leftFrac = vspan > 1 ? (pivot - vs) / (vspan - 1) : 0;
      const ns = clamp(Math.round(pivot - leftFrac * (newSpan - 1)), minYear, maxYear - newSpan + 1);
      setView([ns, ns + newSpan - 1]);
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, [minYear, maxYear]);

  const resetView = () => setView([minYear, maxYear]);
  const zoomed = viewStart > minYear || viewEnd < maxYear;

  // Zoom the timeline about its centre (used by the +/− buttons).
  const zoomByButton = (factor: number) => {
    const pivot = Math.round((viewStart + viewEnd) / 2);
    const fullSpan = maxYear - minYear + 1;
    const newSpan = clamp(Math.round(viewSpan * factor), 6, fullSpan);
    let ns = clamp(Math.round(pivot - (newSpan - 1) / 2), minYear, maxYear - newSpan + 1);
    setView([ns, ns + newSpan - 1]);
  };

  // Adaptive year ticks based on the current zoom span.
  const axisTicks = useMemo(() => {
    const s = viewEnd - viewStart;
    const step = s > 160 ? 25 : s > 90 ? 20 : s > 40 ? 10 : s > 16 ? 5 : s > 6 ? 2 : 1;
    const ticks: number[] = [];
    for (let y = Math.ceil(viewStart / step) * step; y <= viewEnd; y += step) ticks.push(y);
    return ticks;
  }, [viewStart, viewEnd]);

  /* ------------- City-comparison chart geometry (full year range) ------------- */
  const CW = 1000;
  const CH = 150;
  const xC = (y: number) => ((y - minYear) / Math.max(1, maxYear - minYear)) * CW;
  const yC = (v: number) => CH - (v / maxCityVal) * CH;
  const cmpTicks = useMemo(() => {
    const ticks: number[] = [];
    for (let y = Math.ceil(minYear / 25) * 25; y <= maxYear; y += 25) ticks.push(y);
    return ticks;
  }, [minYear, maxYear]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <p className="text-xs uppercase tracking-[0.3em] text-[#b91c1c] dark:text-[#ff4d4d] font-black">
          Data Visualization
        </p>
        <h1
          style={{ fontFamily: "'Spectral', serif" }}
          className="text-3xl sm:text-4xl font-bold text-[#1a1a1a] dark:text-[#e5e5e5] mt-1"
        >
          American Jewish Imprints across Time, Place &amp; Language
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2 max-w-3xl leading-relaxed">
          Scrub or play the timeline to watch {records.length.toLocaleString()} geolocated
          imprints spread across the map from {minYear} to {maxYear}. Circles sit at each
          place of publication, sized by volume and coloured by the dominant language. Filter
          to serials or monographs, or toggle languages. By default each title is counted once
          by its first year; switch “Count” to “Across run” to spread a serial over every year
          it was published.
        </p>
        <details className="mt-3 max-w-3xl text-sm">
          <summary className="cursor-pointer font-bold text-[#b91c1c] dark:text-[#ff4d4d]">
            A note on the numbers
          </summary>
          <p className="text-gray-600 dark:text-gray-400 mt-2 leading-relaxed">
            <i>Judaica Americana II</i> records <strong>9,703 publications</strong> (8,980
            monographs and 735 serials, published 1675–1901), including 299 undated entries.
            This atlas can only plot the {records.length.toLocaleString()} imprints that have
            <strong> both a date and map coordinates</strong>, so the counts here run lower than
            the full bibliography — undated and un-geolocated entries are omitted (they remain
            searchable on the bibliography), and withdrawn entries are excluded entirely. Because
            many works are multilingual, a title counts toward each of its languages, so the
            language tallies can exceed the imprint total.
          </p>
        </details>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 lg:items-start">
        {/* Map + timeline */}
        <div className="lg:col-span-3 space-y-6">
          <div
            ref={mapEl}
            className="w-full rounded-lg overflow-hidden border border-[#e5e7eb] dark:border-[#2f2f2f] shadow-sm bg-[#eef2f5] dark:bg-[#0f1113]"
            style={{ height: "540px" }}
          />
          {!L && (
            <p className="text-sm text-gray-500 mt-2">Loading map…</p>
          )}

          {/* Playback + format controls */}
          <div className="flex flex-wrap items-center gap-4 bg-white dark:bg-[#1e1e1e] border border-[#e5e7eb] dark:border-[#2f2f2f] rounded-lg p-4 shadow-sm">
            <button
              onClick={() => (playing ? setPlaying(false) : play())}
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#1a1a1a] dark:bg-[#b91c1c] text-white text-[12px] font-black uppercase tracking-widest rounded hover:bg-[#b91c1c] dark:hover:bg-[#ff4d4d] transition-colors"
              aria-label={playing ? "Pause timeline" : "Play timeline"}
            >
              {playing ? (
                <>
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" /><rect x="14" y="5" width="4" height="14" /></svg>
                  Pause
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M7 5v14l12-7z" /></svg>
                  Play
                </>
              )}
            </button>

            <button
              onClick={() => {
                setPlaying(false);
                setStart(minYear);
                setEnd(maxYear);
                setView([minYear, maxYear]);
              }}
              className="px-3 py-2 text-[12px] font-black uppercase tracking-widest text-gray-600 dark:text-gray-300 border border-[#e5e7eb] dark:border-[#2f2f2f] rounded hover:text-[#b91c1c] dark:hover:text-[#ff4d4d] transition-colors"
            >
              Reset
            </button>

            <div className="flex items-center gap-3 font-mono">
              <span className="text-2xl font-bold text-[#1a1a1a] dark:text-[#e5e5e5] tabular-nums">{start}</span>
              <span className="text-gray-400">—</span>
              <span className="text-2xl font-bold text-[#1a1a1a] dark:text-[#e5e5e5] tabular-nums">{end}</span>
            </div>

            <div className="ml-auto flex flex-wrap items-center gap-x-5 gap-y-3">
              {/* Count mode: match a one-title-one-date tally, or span serial runs */}
              <div className="inline-flex items-center gap-2">
                <span className="text-[11px] font-black uppercase tracking-widest text-gray-500 dark:text-gray-400" title="How titles with several publication years (serials) are counted.">Count</span>
                <div className="inline-flex rounded overflow-hidden border border-[#e5e7eb] dark:border-[#2f2f2f]">
                  {([
                    ["first", "By first year", "Count each title once, by its primary year (matches a standard tally)."],
                    ["all", "Across run", "Count a title in every year it was published (shows serial longevity)."],
                  ] as const).map(([val, label, tip]) => (
                    <button
                      key={val}
                      onClick={() => setCountMode(val)}
                      aria-pressed={countMode === val}
                      title={tip}
                      className={`px-3 py-2 text-[11px] font-black uppercase tracking-widest transition-colors ${
                        countMode === val
                          ? "bg-[#1a1a1a] dark:bg-[#b91c1c] text-white"
                          : "bg-white dark:bg-[#1e1e1e] text-gray-600 dark:text-gray-300 hover:text-[#b91c1c] dark:hover:text-[#ff4d4d]"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Format segmented control: everything vs. serials vs. monographs */}
              <div className="inline-flex rounded overflow-hidden border border-[#e5e7eb] dark:border-[#2f2f2f]">
                {([
                  ["all", "All"],
                  ["serial", "Serials"],
                  ["mono", "Monographs"],
                ] as const).map(([val, label]) => (
                  <button
                    key={val}
                    onClick={() => setFormat(val)}
                    aria-pressed={format === val}
                    className={`px-3 py-2 text-[11px] font-black uppercase tracking-widest transition-colors ${
                      format === val
                        ? "bg-[#1a1a1a] dark:bg-[#b91c1c] text-white"
                        : "bg-white dark:bg-[#1e1e1e] text-gray-600 dark:text-gray-300 hover:text-[#b91c1c] dark:hover:text-[#ff4d4d]"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Timeline: stacked publications-per-year, with a draggable window */}
          <div className="bg-white dark:bg-[#1e1e1e] border border-[#e5e7eb] dark:border-[#2f2f2f] rounded-lg p-4 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-[11px] uppercase tracking-widest font-black text-gray-500 dark:text-gray-400">
                {timelineMode === "cumulative" ? "Cumulative imprints" : "Imprints per year"}
              </h2>
              <div className="flex items-center gap-3">
                {/* Per-year vs cumulative growth curve */}
                <div className="inline-flex rounded overflow-hidden border border-[#e5e7eb] dark:border-[#2f2f2f]">
                  {([
                    ["year", "Per year"],
                    ["cumulative", "Cumulative"],
                  ] as const).map(([val, label]) => (
                    <button
                      key={val}
                      onClick={() => setTimelineMode(val)}
                      aria-pressed={timelineMode === val}
                      className={`px-3 py-1.5 text-[11px] font-black uppercase tracking-widest transition-colors ${
                        timelineMode === val
                          ? "bg-[#1a1a1a] dark:bg-[#b91c1c] text-white"
                          : "bg-white dark:bg-[#1e1e1e] text-gray-600 dark:text-gray-300 hover:text-[#b91c1c] dark:hover:text-[#ff4d4d]"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="inline-flex items-center rounded overflow-hidden border border-[#e5e7eb] dark:border-[#2f2f2f]">
                  <button
                    onClick={() => zoomByButton(0.6)}
                    aria-label="Zoom in"
                    className="p-1.5 text-gray-600 dark:text-gray-300 hover:text-white hover:bg-[#1a1a1a] dark:hover:bg-[#b91c1c] transition-colors"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3M11 8v6M8 11h6" strokeLinecap="round" /></svg>
                  </button>
                  <button
                    onClick={() => zoomByButton(1.7)}
                    aria-label="Zoom out"
                    className="p-1.5 text-gray-600 dark:text-gray-300 hover:text-white hover:bg-[#1a1a1a] dark:hover:bg-[#b91c1c] transition-colors border-l border-[#e5e7eb] dark:border-[#2f2f2f]"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3M8 11h6" strokeLinecap="round" /></svg>
                  </button>
                  <button
                    onClick={resetView}
                    aria-label="Reset zoom"
                    disabled={!zoomed}
                    className="p-1.5 text-gray-600 dark:text-gray-300 hover:text-white hover:bg-[#1a1a1a] dark:hover:bg-[#b91c1c] transition-colors border-l border-[#e5e7eb] dark:border-[#2f2f2f] disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-gray-600"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M3 12a9 9 0 1 0 3-6.7L3 8" strokeLinecap="round" strokeLinejoin="round" /><path d="M3 3v5h5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </button>
                </div>
              </div>
            </div>
            <svg
              ref={svgRef}
              viewBox={`0 0 ${TL_W} ${TL_H + 22}`}
              className="w-full select-none"
              style={{ touchAction: "none" }}
              onDoubleClick={resetView}
              onPointerDown={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const yr = yearFromClientX(e.clientX, rect);
                // Grab whichever handle is closer; else move nearest edge.
                dragMode.current = Math.abs(yr - start) <= Math.abs(yr - end) ? "start" : "end";
                onTimelinePointer(e.clientX);
              }}
            >
              {/* Civil War band (1861–1865) — the production dip is visible here */}
              {1865 >= viewStart && 1861 <= viewEnd && (
                <g>
                  <rect
                    x={clamp(xForYear(1861), 0, TL_W)}
                    y={0}
                    width={clamp(xForYear(1865), 0, TL_W) - clamp(xForYear(1861), 0, TL_W)}
                    height={TL_H}
                    fill="#b91c1c"
                    opacity={0.08}
                  />
                  <text x={clamp((xForYear(1861) + xForYear(1865)) / 2, 30, TL_W - 30)} y={11} textAnchor="middle" className="fill-[#b91c1c]" fontSize={10} fontWeight={700}>
                    Civil War
                  </text>
                </g>
              )}

              {/* Bars */}
              {displayGrid.map((row, idx) => {
                const year = minYear + idx;
                if (year < viewStart || year > viewEnd) return null;
                const within = year >= start && year <= end;
                let yTop = TL_H;
                const x = xForYear(year);
                return (
                  <g key={year} opacity={within ? 1 : 0.28}>
                    {row.map((c, li) => {
                      if (!c) return null;
                      const h = (c / maxYearTotal) * TL_H;
                      yTop -= h;
                      return (
                        <rect
                          key={li}
                          x={x}
                          y={yTop}
                          width={timelineMode === "cumulative" ? barW + 0.6 : Math.max(barW - 0.3, 0.6)}
                          height={h}
                          fill={activeLangs[li] ? LANG_COLORS[li] : "#9ca3af"}
                        />
                      );
                    })}
                  </g>
                );
              })}

              {/* Window shading (clamped to the visible view) */}
              <rect x={0} y={0} width={clamp(xForYear(start), 0, TL_W)} height={TL_H} fill="currentColor" opacity={0.05} className="text-black dark:text-white" />
              <rect x={clamp(xForYear(end), 0, TL_W)} y={0} width={TL_W - clamp(xForYear(end), 0, TL_W)} height={TL_H} fill="currentColor" opacity={0.05} className="text-black dark:text-white" />

              {/* Handles */}
              {(["start", "end"] as const).map((which) => {
                const yr = which === "start" ? start : end;
                if (yr < viewStart || yr > viewEnd) return null;
                const x = xForYear(yr);
                return (
                  <g key={which} style={{ cursor: "ew-resize" }} onPointerDown={(e) => { e.stopPropagation(); dragMode.current = which; }}>
                    <line x1={x} y1={0} x2={x} y2={TL_H} stroke="#b91c1c" strokeWidth={2} />
                    <rect x={x - 5} y={TL_H / 2 - 10} width={10} height={20} rx={2} fill="#b91c1c" />
                  </g>
                );
              })}

              {/* Year ticks */}
              {axisTicks.map((y) => (
                <text key={y} x={xForYear(y)} y={TL_H + 16} textAnchor="middle" className="fill-gray-400" fontSize={11}>
                  {y}
                </text>
              ))}
            </svg>
          </div>
        </div>

        {/* Sidebar: stats + language legend */}
        <aside className="lg:col-span-1 space-y-4">
          <div className="bg-white dark:bg-[#1e1e1e] border border-[#e5e7eb] dark:border-[#2f2f2f] rounded-lg p-4 shadow-sm">
            <h2 className="text-[11px] uppercase tracking-widest font-black text-gray-500 dark:text-gray-400 mb-3">
              In view
            </h2>
            <dl className="space-y-2">
              <div className="flex justify-between items-baseline">
                <dt className="text-sm text-gray-600 dark:text-gray-400">Imprints</dt>
                <dd className="text-2xl font-bold text-[#1a1a1a] dark:text-[#e5e5e5] tabular-nums">{stats.total.toLocaleString()}</dd>
              </div>
              <div className="flex justify-between items-baseline">
                <dt className="text-sm text-gray-600 dark:text-gray-400">Cities</dt>
                <dd className="text-lg font-bold text-[#1a1a1a] dark:text-[#e5e5e5] tabular-nums">{stats.cities}</dd>
              </div>
              <div className="flex justify-between items-baseline gap-2">
                <dt className="text-sm text-gray-600 dark:text-gray-400">Top place</dt>
                <dd className="text-sm font-bold text-[#1a1a1a] dark:text-[#e5e5e5] text-right">{stats.top.name}<span className="text-gray-400 font-normal"> ({stats.top.count})</span></dd>
              </div>
            </dl>
            {/* Open the bibliography with the current year + language filters applied. */}
            <a
              href={bibliographyUrl()}
              target="_blank"
              rel="noopener"
              className="mt-4 inline-flex w-full items-center justify-center gap-2 px-3 py-2 bg-[#1a1a1a] dark:bg-[#b91c1c] text-white text-[11px] font-black uppercase tracking-widest rounded hover:bg-[#b91c1c] dark:hover:bg-[#ff4d4d] transition-colors"
            >
              Browse these in the bibliography →
            </a>
            {(start > minYear || end < maxYear || !activeLangs.every(Boolean)) && (
              <p className="text-[11px] text-gray-400 mt-2 leading-snug">
                Carries your {start > minYear || end < maxYear ? `${start}–${end}` : ""}
                {(start > minYear || end < maxYear) && !activeLangs.every(Boolean) ? " and " : ""}
                {!activeLangs.every(Boolean) ? "language" : ""} filter into the search.
              </p>
            )}
          </div>

          <div className="bg-white dark:bg-[#1e1e1e] border border-[#e5e7eb] dark:border-[#2f2f2f] rounded-lg p-4 shadow-sm">
            <h2 className="text-[11px] uppercase tracking-widest font-black text-gray-500 dark:text-gray-400 mb-3">
              Language
            </h2>
            <ul className="space-y-1.5">
              {langs.map((name, i) => {
                const on = activeLangs[i];
                return (
                  <li key={name}>
                    <button
                      onClick={() => toggleLang(i)}
                      className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded text-left transition-opacity ${on ? "opacity-100" : "opacity-40"}`}
                      aria-pressed={on}
                    >
                      <span
                        className="w-3.5 h-3.5 rounded-full flex-shrink-0 border border-white/60"
                        style={{ backgroundColor: LANG_COLORS[i] }}
                      />
                      <span className="text-sm font-bold text-[#1a1a1a] dark:text-[#e5e5e5] flex-grow">{name}</span>
                      <span className="text-sm text-gray-500 dark:text-gray-400 tabular-nums">{langTotals[i].toLocaleString()}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <p className="text-[11px] text-gray-400 mt-3 leading-snug">
              Click a language to show or hide it; bilingual works count toward each language, so counts can exceed the imprint total. Marker colour reflects the dominant language at each place.
            </p>
          </div>
        </aside>
      </div>

      {/* ---------------------- Compare cities over time ---------------------- */}
      <div className="bg-white dark:bg-[#1e1e1e] border border-[#e5e7eb] dark:border-[#2f2f2f] rounded-lg p-5 shadow-sm">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-1">
          <h2
            style={{ fontFamily: "'Spectral', serif" }}
            className="text-xl font-bold text-[#1a1a1a] dark:text-[#e5e5e5]"
          >
            Compare cities over time
          </h2>
          <span className="text-[11px] text-gray-400">
            Imprints per year · reflects the language &amp; format filters above · click a map marker to add a city
          </span>
        </div>

        {/* City picker: quick chips for the busiest cities + a search box */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {topCities.map((pi) => {
            const on = selectedPlaces.includes(pi);
            const ci = selectedPlaces.indexOf(pi);
            return (
              <button
                key={pi}
                onClick={() => toggleCity(pi)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-bold border transition-colors ${
                  on
                    ? "text-white border-transparent"
                    : "bg-white dark:bg-[#1e1e1e] text-gray-600 dark:text-gray-300 border-[#e5e7eb] dark:border-[#2f2f2f] hover:border-gray-400"
                }`}
                style={on ? { backgroundColor: CITY_COLORS[ci % CITY_COLORS.length] } : undefined}
              >
                {on && <span aria-hidden>✓</span>}
                {places[pi]?.[0]}
              </button>
            );
          })}
          <input
            list="all-cities"
            placeholder="Add a city…"
            onChange={(e) => {
              const idx = places.findIndex((p) => p[0] === (e.target as HTMLInputElement).value);
              if (idx >= 0 && !selectedPlaces.includes(idx)) toggleCity(idx);
              (e.target as HTMLInputElement).value = "";
            }}
            className="px-3 py-1 text-[12px] rounded-full border border-[#e5e7eb] dark:border-[#2f2f2f] bg-white dark:bg-[#1e1e1e] text-[#1a1a1a] dark:text-[#e5e5e5] placeholder:text-gray-400 focus:outline-none focus:border-[#b91c1c] w-40"
          />
          <datalist id="all-cities">
            {places.map((p, i) => (
              <option key={i} value={p[0]} />
            ))}
          </datalist>
        </div>

        {selectedPlaces.length === 0 ? (
          <p className="text-sm text-gray-500 py-8 text-center">
            Pick one or more cities above (or click a marker) to compare their output over time.
          </p>
        ) : (
          <>
            {/* Legend */}
            <div className="flex flex-wrap gap-x-5 gap-y-2 mb-3">
              {selectedPlaces.map((pi, si) => (
                <span key={pi} className="inline-flex items-center gap-2 text-sm">
                  <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: CITY_COLORS[si % CITY_COLORS.length] }} />
                  <a
                    href={bibliographyUrl(places[pi]?.[0])}
                    target="_blank"
                    rel="noopener"
                    className="font-bold text-[#1a1a1a] dark:text-[#e5e5e5] hover:text-[#b91c1c] dark:hover:text-[#ff4d4d] hover:underline"
                    title="Browse these imprints in the bibliography"
                  >
                    {places[pi]?.[0]}
                  </a>
                  <span className="text-gray-500 dark:text-gray-400 tabular-nums">{cityTotals[si].toLocaleString()}</span>
                  <button onClick={() => toggleCity(pi)} aria-label={`Remove ${places[pi]?.[0]}`} className="text-gray-400 hover:text-[#b91c1c]">×</button>
                </span>
              ))}
            </div>

            {/* Multi-line chart */}
            <svg viewBox={`0 0 ${CW} ${CH + 24}`} className="w-full">
              {/* Horizontal gridlines + y labels (0, mid, max) */}
              {[0, 0.5, 1].map((f) => (
                <g key={f}>
                  <line x1={0} y1={CH - f * CH} x2={CW} y2={CH - f * CH} stroke="currentColor" className="text-gray-200 dark:text-gray-700" strokeWidth={1} />
                  <text x={0} y={CH - f * CH - 3} className="fill-gray-400" fontSize={11}>{Math.round(f * maxCityVal)}</text>
                </g>
              ))}
              {/* One polyline per city */}
              {citySeries.map((series, si) => (
                <polyline
                  key={si}
                  fill="none"
                  stroke={CITY_COLORS[si % CITY_COLORS.length]}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  points={series.map((v, idx) => `${xC(minYear + idx).toFixed(1)},${yC(v).toFixed(1)}`).join(" ")}
                />
              ))}
              {/* Year ticks */}
              {cmpTicks.map((y) => (
                <text key={y} x={xC(y)} y={CH + 18} textAnchor="middle" className="fill-gray-400" fontSize={11}>{y}</text>
              ))}
            </svg>
          </>
        )}
      </div>

      {/* ====================== More views ====================== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Language share over time (100% stacked) */}
        <div className="bg-white dark:bg-[#1e1e1e] border border-[#e5e7eb] dark:border-[#2f2f2f] rounded-lg p-4 shadow-sm">
          <h2 className="text-[11px] uppercase tracking-widest font-black text-gray-500 dark:text-gray-400 mb-1">Language share over time</h2>
          <p className="text-[11px] text-gray-400 mb-3">Each year as 100% — the minority-language presses emerge late-century.</p>
          <svg viewBox={`0 0 ${CW} ${150 + 18}`} className="w-full">
            {yearLangCounts.map((row, idx) => {
              const total = row.reduce((a, b) => a + b, 0);
              if (!total) return null;
              const year = minYear + idx;
              const x = xC(year);
              const w = CW / (maxYear - minYear + 1) + 0.6;
              let yTop = 0;
              return (
                <g key={year}>
                  {row.map((c, li) => {
                    if (!c) return null;
                    const h = (c / total) * 150;
                    const r = <rect key={li} x={x} y={yTop} width={w} height={h} fill={LANG_COLORS[li]} />;
                    yTop += h;
                    return r;
                  })}
                </g>
              );
            })}
            {cmpTicks.map((y) => (
              <text key={y} x={xC(y)} y={150 + 14} textAnchor="middle" fontSize={11} className="fill-gray-400">{y}</text>
            ))}
          </svg>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
            {langs.map((n, i) => (
              <span key={n} className="inline-flex items-center gap-1.5 text-[11px] text-gray-600 dark:text-gray-400">
                <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: LANG_COLORS[i] }} />{n}
              </span>
            ))}
          </div>
        </div>

        {/* Serials vs monographs over time */}
        <div className="bg-white dark:bg-[#1e1e1e] border border-[#e5e7eb] dark:border-[#2f2f2f] rounded-lg p-4 shadow-sm">
          <h2 className="text-[11px] uppercase tracking-widest font-black text-gray-500 dark:text-gray-400 mb-1">Serials vs. monographs</h2>
          <p className="text-[11px] text-gray-400 mb-3">Per year — the serial press is largely a late-19th-century phenomenon.</p>
          {(() => {
            const smMax = Math.max(1, ...serialMonoByYear.mono.map((m, i) => m + serialMonoByYear.ser[i]));
            const w = CW / (maxYear - minYear + 1);
            return (
              <svg viewBox={`0 0 ${CW} ${150 + 18}`} className="w-full">
                {serialMonoByYear.mono.map((m, idx) => {
                  const s = serialMonoByYear.ser[idx];
                  if (!m && !s) return null;
                  const year = minYear + idx;
                  const x = xC(year);
                  const hm = (m / smMax) * 150;
                  const hs = (s / smMax) * 150;
                  return (
                    <g key={year}>
                      <rect x={x} y={150 - hm} width={Math.max(w - 0.3, 0.6)} height={hm} fill="#2563eb" />
                      <rect x={x} y={150 - hm - hs} width={Math.max(w - 0.3, 0.6)} height={hs} fill="#b91c1c" />
                    </g>
                  );
                })}
                {cmpTicks.map((y) => (
                  <text key={y} x={xC(y)} y={150 + 14} textAnchor="middle" fontSize={11} className="fill-gray-400">{y}</text>
                ))}
              </svg>
            );
          })()}
          <div className="flex flex-wrap gap-x-4 mt-2 text-[11px] text-gray-600 dark:text-gray-400">
            <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: "#2563eb" }} />Monographs</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: "#b91c1c" }} />Serials</span>
          </div>
        </div>

        {/* Top cities (dynamic) */}
        <div className="bg-white dark:bg-[#1e1e1e] border border-[#e5e7eb] dark:border-[#2f2f2f] rounded-lg p-4 shadow-sm">
          <h2 className="text-[11px] uppercase tracking-widest font-black text-gray-500 dark:text-gray-400 mb-1">Top places</h2>
          <p className="text-[11px] text-gray-400 mb-3">Most imprints in the current view (reflects all filters above).</p>
          <BarRows data={topCitiesInView} color="#b91c1c" />
        </div>

        {/* By state (dynamic) */}
        <div className="bg-white dark:bg-[#1e1e1e] border border-[#e5e7eb] dark:border-[#2f2f2f] rounded-lg p-4 shadow-sm">
          <h2 className="text-[11px] uppercase tracking-widest font-black text-gray-500 dark:text-gray-400 mb-1">By state</h2>
          <p className="text-[11px] text-gray-400 mb-3">Imprints grouped by U.S. state (current view).</p>
          <BarRows data={stateCounts.slice(0, 12)} color="#0d9488" />
        </div>

        {/* Top authors (corpus-wide) */}
        <div className="bg-white dark:bg-[#1e1e1e] border border-[#e5e7eb] dark:border-[#2f2f2f] rounded-lg p-4 shadow-sm">
          <h2 className="text-[11px] uppercase tracking-widest font-black text-gray-500 dark:text-gray-400 mb-1">Most prolific authors / editors</h2>
          <p className="text-[11px] text-gray-400 mb-3">Across the whole corpus.</p>
          <BarRows data={topAuthors} color="#7c3aed" />
        </div>

        {/* Top printers/publishers (corpus-wide) */}
        <div className="bg-white dark:bg-[#1e1e1e] border border-[#e5e7eb] dark:border-[#2f2f2f] rounded-lg p-4 shadow-sm">
          <h2 className="text-[11px] uppercase tracking-widest font-black text-gray-500 dark:text-gray-400 mb-1">Printers &amp; publishers</h2>
          <p className="text-[11px] text-gray-400 mb-3">Across the whole corpus.</p>
          <BarRows data={topContributors} color="#d97706" />
        </div>

        {/* Digitization coverage by decade */}
        <div className="bg-white dark:bg-[#1e1e1e] border border-[#e5e7eb] dark:border-[#2f2f2f] rounded-lg p-4 shadow-sm lg:col-span-2">
          <h2 className="text-[11px] uppercase tracking-widest font-black text-gray-500 dark:text-gray-400 mb-1">Digitization coverage by decade</h2>
          <p className="text-[11px] text-gray-400 mb-3">Share of each decade's imprints with a digital copy on file.</p>
          {(() => {
            const H = 140;
            const n = digitizedByDecade.length || 1;
            const bw = CW / n;
            const digMax = Math.max(1, ...digitizedByDecade.map((d) => d.total));
            return (
              <svg viewBox={`0 0 ${CW} ${H + 20}`} className="w-full">
                {digitizedByDecade.map((d, i) => {
                  const x = i * bw;
                  const hTotal = (d.total / digMax) * H;
                  const hDigi = (d.digi / digMax) * H;
                  return (
                    <g key={d.decade}>
                      <rect x={x + 1} y={H - hTotal} width={bw - 2} height={hTotal} fill="#e5e7eb" className="dark:fill-gray-700" />
                      <rect x={x + 1} y={H - hDigi} width={bw - 2} height={hDigi} fill="#059669">
                        <title>{`${d.decade}s — ${d.digi}/${d.total} digitized (${Math.round(d.pct * 100)}%)`}</title>
                      </rect>
                      {i % 2 === 0 && (
                        <text x={x + bw / 2} y={H + 14} textAnchor="middle" fontSize={10} className="fill-gray-400">{d.decade}</text>
                      )}
                    </g>
                  );
                })}
              </svg>
            );
          })()}
          <div className="flex flex-wrap gap-x-4 mt-2 text-[11px] text-gray-600 dark:text-gray-400">
            <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: "#059669" }} />Digitized</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-gray-200 dark:bg-gray-700" />Not yet</span>
          </div>
        </div>
      </div>

      {/* ---------------------- Narrative: growth over time ---------------------- */}
      <div className="bg-white dark:bg-[#1e1e1e] border border-[#e5e7eb] dark:border-[#2f2f2f] rounded-lg p-5 shadow-sm">
        <h2
          style={{ fontFamily: "'Spectral', serif" }}
          className="text-xl font-bold text-[#1a1a1a] dark:text-[#e5e5e5]"
        >
          The growth of Judaica Americana
        </h2>
        <p className="text-[12px] text-gray-400 mb-3">
          Switch the timeline above to <strong>Cumulative</strong> to trace this curve — and note the Civil War dip.
        </p>
        <div className="text-gray-700 dark:text-gray-300 leading-relaxed space-y-3 max-w-3xl">
          <p>
            Before 1801, publications of Judaica Americana totaled <strong>{growth.pre1801.toLocaleString()}</strong>.
            From 1801 to 1825 the rate of growth rose <strong>{growth.growth1}%</strong>, adding{" "}
            <strong>{growth.inc1801_1825.toLocaleString()}</strong> works. Over the next quarter-century
            production kept climbing — up <strong>{growth.growth2}%</strong>, adding about{" "}
            <strong>{round10(growth.inc1826_1850).toLocaleString()}</strong> works by 1850.
          </p>
          <p>
            Growth continued through the 1850s, but from 1860 to 1865, during the American Civil War,
            production dropped sharply — on both a percentage and absolute basis — adding only{" "}
            <strong>{growth.cw1860_1865.toLocaleString()}</strong> works (just{" "}
            <strong>{growth.cw1861_1865.toLocaleString()}</strong> between 1861 and 1865). The pace
            rebounded quickly after 1865, with the running total roughly doubling from about{" "}
            <strong>{round10(growth.by1865).toLocaleString()}</strong> works to about{" "}
            <strong>{round10(growth.doubleCount).toLocaleString()}</strong> by {growth.doubleYear} — a{" "}
            <strong>{growth.doubleGrowth}%</strong> increase.
          </p>
        </div>
      </div>
    </div>
  );
}
