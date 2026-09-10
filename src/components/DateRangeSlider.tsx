import React, { useState, useEffect } from "react";
import { Configure } from 'react-instantsearch';
import Slider from '@mui/material/Slider';
import { TextField, styled } from "@mui/material"; // Added styled for MUI customization
import dayjs from "dayjs";
import { Disclosure, DisclosureButton, DisclosurePanel } from "@headlessui/react";
import { ChevronDownIcon, ChevronUpIcon } from "@heroicons/react/20/solid";

// Custom styled MUI TextField to match Scholar Theme
// Inside your DateRangeSlider.tsx
const StyledTextField = styled(TextField)(({ theme }) => ({
	'& .MuiOutlinedInput-root': {
		// Light Mode styling (matches image_fab674.png)
		'& fieldset': { borderColor: '#e5e7eb', borderRadius: '4px' },
		'&:hover fieldset': { borderColor: '#b91c1c' },
		'&.Mui-focused fieldset': { borderColor: '#b91c1c', borderWidth: '1px' },
	},
	'& label.Mui-focused': { color: '#b91c1c' },
	'& .MuiInputBase-input': {
		fontSize: '14px',
		fontWeight: '700', // Bold matching image_fab674.png
		fontFamily: 'ui-monospace, monospace'
	},
	// Dark Mode support for the slider sidebar
	'.dark &': {
		'& .MuiOutlinedInput-root': {
			'& fieldset': { borderColor: '#374151' },
			'&:hover fieldset': { borderColor: '#ff4d4d' },
			'&.Mui-focused fieldset': { borderColor: '#ff4d4d' },
			'& input': { color: '#ffffff' }
		},
		'& label': { color: '#9ca3af' },
		'& label.Mui-focused': { color: '#ff4d4d' },
	}
}));

// Slider SX styling for that clean red line
const sliderStyles = {
	color: '#b91c1c',
	height: 4,
	'& .MuiSlider-thumb': {
		height: 18,
		width: 18,
		backgroundColor: '#fff',
		border: '2px solid currentColor',
		'&:focus, &:hover, &.Mui-active, &.Mui-focusVisible': {
			boxShadow: 'inherit',
		},
	},
	'& .MuiSlider-rail': { opacity: 1, backgroundColor: '#e5e7eb' },
	'.dark &': { color: '#ff4d4d', '& .MuiSlider-rail': { backgroundColor: '#374151' } }
};

type CombinedDateRangeSliderProps = {
	minTimestamp: number;
	maxTimestamp: number;
	dateFields: string[];
	title: string;
	onDateChange?: (isActive: boolean) => void;
	value?: { min: number; max: number };
	onChange?: (newValue: { min: number; max: number }) => void;
};

const DateRangeSlider: React.FC<CombinedDateRangeSliderProps> = ({
																	 minTimestamp,
																	 maxTimestamp,
																	 dateFields,
																	 title,
																	 onDateChange,
																	 value,
																	 onChange
																 }) => {
	const isControlled = value !== undefined;
	// Seed the range from ?start=YYYY&end=YYYY in the URL so links (e.g. from the
	// visualization) arrive pre-filtered by year. Years are read as UTC.
	const initialRange = (): [number, number] => {
		let lo = minTimestamp;
		let hi = maxTimestamp;
		try {
			const p = new URLSearchParams(window.location.search);
			const s = parseInt(p.get("start") ?? "", 10);
			const e = parseInt(p.get("end") ?? "", 10);
			if (!isNaN(s)) lo = Math.max(minTimestamp, Math.floor(Date.UTC(s, 0, 1) / 1000));
			if (!isNaN(e)) hi = Math.min(maxTimestamp, Math.floor(Date.UTC(e, 11, 31, 23, 59, 59) / 1000));
		} catch {}
		return lo <= hi ? [lo, hi] : [minTimestamp, maxTimestamp];
	};
	const [internalRange, setInternalRange] = useState<[number, number]>(initialRange);
	const range = isControlled ? [value!.min, value!.max] : internalRange;

	const [filterString, setFilterString] = useState<string>('');
	// Timestamps are UTC (midnight Jan 1), so read the year in UTC — local time
	// rolls back to the previous year west of UTC and shows it one too low.
	const yearOf = (ts: number) => String(new Date(ts * 1000).getUTCFullYear());

	const [startDate, setStartDate] = useState<string>(yearOf(range[0]));
	const [endDate, setEndDate] = useState<string>(yearOf(range[1]));

	const updateRange = (newRange: [number, number]) => {
		if (!isControlled) setInternalRange(newRange);
		onChange?.({ min: newRange[0], max: newRange[1] });
		setStartDate(yearOf(newRange[0]));
		setEndDate(yearOf(newRange[1]));
	};

	// The min/max years the slider spans, for clamping typed input.
	const minYear = Number(yearOf(minTimestamp));
	const maxYear = Number(yearOf(maxTimestamp));

	// Commit a typed year only on blur/Enter (not per keystroke) so you can type
	// a full year without the slider jumping. Values are clamped to the range.
	const commitStart = (raw: string) => {
		const y = parseInt(raw, 10);
		if (isNaN(y)) { setStartDate(yearOf(range[0])); return; }
		const cy = Math.min(Math.max(y, minYear), Number(yearOf(range[1])));
		updateRange([Math.floor(Date.UTC(cy, 0, 1) / 1000), range[1]]);
	};
	const commitEnd = (raw: string) => {
		const y = parseInt(raw, 10);
		if (isNaN(y)) { setEndDate(yearOf(range[1])); return; }
		const cy = Math.max(Math.min(y, maxYear), Number(yearOf(range[0])));
		updateRange([range[0], Math.floor(Date.UTC(cy, 11, 31, 23, 59, 59) / 1000)]);
	};

	useEffect(() => {
		const isActive = range[0] !== minTimestamp || range[1] !== maxTimestamp;
		onDateChange?.(isActive);

		// Only apply the numeric date filter once the user actually narrows the
		// range. Algolia numeric filters exclude any record lacking the attribute,
		// so an always-on filter silently hides every undated record from search.
		if (isActive) {
			const singleCondition = `(${dateFields[0]} <= ${range[1]} AND ${dateFields[1]} >= ${range[0]})`;
			setFilterString(singleCondition);
		} else {
			setFilterString('');
		}

		const updateURL = setTimeout(() => {
			const url = new URL(window.location.href);
			range[0] !== minTimestamp
				? url.searchParams.set("start", yearOf(range[0]))
				: url.searchParams.delete("start");
			range[1] !== maxTimestamp
				? url.searchParams.set("end", yearOf(range[1]))
				: url.searchParams.delete("end");
			window.history.replaceState(null, '', url.toString());
		}, 500);

		return () => clearTimeout(updateURL);
	}, [range, minTimestamp, maxTimestamp, dateFields]);

	const handleSliderChange = (_: any, newValue: number | number[]) => {
		if (Array.isArray(newValue)) {
			updateRange([newValue[0], newValue[1]]);
		}
	};

	return (
		<div className="    border-b border-gray-100 dark:border-gray-800 last:border-0 overflow-hidden">



							<div className="px-2">
								<Slider
									value={range}
									min={minTimestamp}
									max={maxTimestamp}
									onChange={handleSliderChange}
									valueLabelDisplay="auto"
									valueLabelFormat={(v) => yearOf(v)}
									sx={{
										color: '#b91c1c', // Your theme red
										height: 4,
										'& .MuiSlider-thumb': {
											height: 16,
											width: 16,
											backgroundColor: '#fff',
											border: '2px solid currentColor',
											'&:hover': { boxShadow: '0 0 0 8px rgba(185, 28, 28, 0.16)' },
										},
										'& .MuiSlider-rail': { opacity: 0.2, color: '#9ca3af' },
										'& .MuiSlider-markLabel': {
											fontSize: '10px',
											fontWeight: 'bold',
											fontFamily: 'serif',
											color: '#9ca3af'
										},
										'.dark &': { color: '#ff4d4d' }
									}}
								/>
							</div>

							<div className="flex items-center justify-between gap-4 mt-6">
								<StyledTextField
									label="From year"
									type="number"
									inputProps={{ min: minYear, max: maxYear, inputMode: "numeric" }}
									value={startDate}
									onChange={(e) => setStartDate(e.target.value)}
									onBlur={(e) => commitStart(e.target.value)}
									onKeyDown={(e) => { if (e.key === "Enter") { commitStart((e.target as HTMLInputElement).value); (e.target as HTMLInputElement).blur(); } }}
									size="small"
								/>
								<span className="text-gray-300 dark:text-gray-700">—</span>
								<StyledTextField
									label="To year"
									type="number"
									inputProps={{ min: minYear, max: maxYear, inputMode: "numeric" }}
									value={endDate}
									onChange={(e) => setEndDate(e.target.value)}
									onBlur={(e) => commitEnd(e.target.value)}
									onKeyDown={(e) => { if (e.key === "Enter") { commitEnd((e.target as HTMLInputElement).value); (e.target as HTMLInputElement).blur(); } }}
									size="small"
								/>
							</div>

							{filterString && <Configure filters={filterString} />}

							{(range[0] !== minTimestamp || range[1] !== maxTimestamp) && (
								<button
									onClick={() => updateRange([minTimestamp, maxTimestamp])}
									className="mt-6 w-full py-2 text-[10px] font-black uppercase tracking-widest text-[#b91c1c] dark:text-[#ff4d4d] bg-red-50 dark:bg-red-950/20 rounded hover:bg-[#b91c1c] hover:text-white dark:hover:bg-[#ff4d4d] transition-all"
								>
									Reset Dates
								</button>
							)}


		</div>
	);
};

export default DateRangeSlider;