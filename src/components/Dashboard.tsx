import { useEffect, useMemo, useRef, useState } from "react";

/* ------------------------------------------------------------------ *
 * Types — compact record format emitted by visualize.astro.
 *   places: [name, lat, lng][]  (indexed by placeIdx)
 *   records: [year, placeIdx, langIdx][]
 *   langs:  language bucket names (indexed by langIdx)
 * ------------------------------------------------------------------ */
type Place = [string, number, number];
// [placeIdx, primaryLang, isSerial, years[], langMask] — years[0] is the
// primary year; langMask is a bitmask of every language bucket the work is in.
type Record = [number, number, number, number[], number];
type Format = "all" | "serial" | "mono";

interface Props {
  places: Place[];
  records: Record[];
  langs: string[];
  minYear: number;
  maxYear: number;
  cartoKey?: string;
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

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/* Light-gray "Positron" canvas that makes the coloured markers pop.
   With a CARTO key we use CARTO Positron; without one the CARTO CDN now
   watermarks tiles, so we fall back to Esri's key-free light-gray canvas
   (visually equivalent, {z}/{y}/{x} order, no watermark). */
const CARTO_URL = "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png";
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
}: Props) {
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
  // Timeline x-axis view domain (zoom). Defaults to the full range.
  const [view, setView] = useState<[number, number]>([minYear, maxYear]);
  const viewStart = view[0];
  const viewEnd = view[1];

  const matchesFormat = (isSerial: number) =>
    format === "all" || (format === "serial" ? isSerial === 1 : isSerial === 0);

  // Bitmask of the currently-enabled languages.
  const activeMask = useMemo(
    () => activeLangs.reduce((m, on, i) => (on ? m | (1 << i) : m), 0),
    [activeLangs],
  );

  // A record is in the window if any of its publication years falls inside it.
  // (Monographs have a single year; multi-year serials span their whole run.)
  const inWindow = (years: number[]) =>
    years.some((y) => y >= start && y <= end);

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
      for (const y of years) {
        const row = grid[y - minYear];
        if (row) row[li]++;
      }
    }
    return grid;
  }, [records, minYear, maxYear, langs.length, format]);

  const maxYearTotal = useMemo(
    () => Math.max(1, ...yearLangCounts.map((r) => r.reduce((a, b) => a + b, 0))),
    [yearLangCounts],
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
    [records, start, end, activeMask, format],
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
  }, [records, start, end, format, langs.length]);

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

  // Add the light "Positron-style" basemap (Esri light gray canvas — key-free).
  useEffect(() => {
    if (!L || !mapRef.current || tileRef.current) return;
    // Use CARTO Positron when a key is configured (it rides along with each
    // tile request); otherwise fall back to the unwatermarked Esri canvas.
    const url = cartoKey
      ? `${CARTO_URL}?api_key=${encodeURIComponent(cartoKey)}`
      : ESRI_URL;
    tileRef.current = L.tileLayer(url, {
      attribution: cartoKey ? CARTO_ATTR : ESRI_ATTR,
      subdomains: "abcd",
      maxZoom: 20,
    }).addTo(mapRef.current);
    tileRef.current.bringToBack();
  }, [L, cartoKey]);

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

      const m = L2.circleMarker([lat, lng], {
        radius,
        color: "#ffffff",
        weight: 1,
        fillColor: color,
        fillOpacity: 0.72,
      }).bindTooltip(
        `<strong>${name}</strong><br><span style="color:#6b7280">${e.total} ${
          e.total === 1 ? "imprint" : "imprints"
        }, ${start}–${end}</span><br>${breakdown}`,
        { direction: "top", sticky: true },
      );
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

  // Mouse-wheel zoom on the timeline, centred on the year under the cursor.
  const onWheelZoom = (e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const pivot = yearFromClientX(e.clientX, rect);
    const factor = e.deltaY < 0 ? 0.8 : 1.25; // wheel up = zoom in
    const fullSpan = maxYear - minYear + 1;
    const MIN_SPAN = 6;
    const newSpan = clamp(Math.round(viewSpan * factor), MIN_SPAN, fullSpan);
    const leftFrac = viewSpan > 1 ? (pivot - viewStart) / (viewSpan - 1) : 0;
    let ns = Math.round(pivot - leftFrac * (newSpan - 1));
    ns = clamp(ns, minYear, maxYear - newSpan + 1);
    setView([ns, ns + newSpan - 1]);
  };

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
          to serials or monographs, or toggle languages to isolate a tradition. Serials that
          ran for several years appear for every year of their run.
        </p>
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
                Imprints per year
              </h2>
              <div className="flex items-center gap-3">
                <span className="hidden sm:inline text-[11px] text-gray-400">
                  Scroll or use the buttons to zoom · drag the handles to set the window
                </span>
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
              onWheel={onWheelZoom}
              onDoubleClick={resetView}
              onPointerDown={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const yr = yearFromClientX(e.clientX, rect);
                // Grab whichever handle is closer; else move nearest edge.
                dragMode.current = Math.abs(yr - start) <= Math.abs(yr - end) ? "start" : "end";
                onTimelinePointer(e.clientX);
              }}
            >
              {/* Bars */}
              {yearLangCounts.map((row, idx) => {
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
                          width={Math.max(barW - 0.3, 0.6)}
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
    </div>
  );
}
