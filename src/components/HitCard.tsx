import * as React from 'react';
import { Highlight } from 'react-instantsearch';
import type { Hit as AlgoliaHit } from 'instantsearch.js';
import { Typography, Box, Link, IconButton, Tooltip, Button, Stack } from '@mui/material';
import VerifiedIcon from '@mui/icons-material/Verified';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import BookmarkAddIcon from '@mui/icons-material/BookmarkAdd';
import BookmarkIcon from '@mui/icons-material/Bookmark'; // Import filled icon
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
// Theme tokens: read the CSS variables defined in global.css so cards
// flip with the site's light/dark theme (no separate MUI ThemeProvider needed).
const SCHOLAR_RED = "var(--red)";
const SCHOLAR_BLACK = "var(--ink)";
const SCHOLAR_PAPER = "var(--hover-surface)";
const BTN_BG = "var(--btn-bg)";
const BTN_BG_HOVER = "var(--btn-bg-hover)";
const INK_MUTED = "var(--ink-muted)";
// Ensure your RecordHit type includes 'id' if you use it in handleCopy
type RecordHit = AlgoliaHit<{
    id: string; // The numeric ID from your screenshots
    objectID: string;
    slug: string;
    title: string;
    author?: string;
    contributor: string;
    place?: string;
    year?: string | number;
    description?: string;
    url?: string;
    isDigitized?: boolean;
    startDate?: number;
    endDate?: number;
}>;

interface HitProps {
    hit: RecordHit;
    onSave: (hit: RecordHit) => void;
    isSaved: boolean;
}

export default function HitListItem({ hit, onSave, isSaved }: HitProps) {
    const dateDisplay = formatDateRange(hit);

    const handleCopy = (e: React.MouseEvent) => {
        e.preventDefault();
        // Fallback to slug if id is missing in handleCopy
        const citation = `${hit.author || hit.contributor || 'Anon'}. ${hit.title}. ${hit.place || ''} ${dateDisplay || ''}. (Singerman ${hit.slug || hit.slug})`;
        navigator.clipboard.writeText(citation);
    };

    return (
        <Box
            component="article"
            sx={{

                display: 'flex', gap: 4, py: 3, px: 3, position: 'relative',
                transition: 'all 0.2s ease',
                '&:hover': {
                    bgcolor: SCHOLAR_PAPER,
                    '& .hit-actions': { opacity: 1 }
                }            }}
        >
            {/* 1. The ID Column - Highlighting Slug */}
            <Box sx={{ width: 70, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <Typography variant="caption" sx={{ fontWeight: 800, fontFamily: "monospace",
                    color: SCHOLAR_RED, fontSize: '0.85rem' }}>
                    <Highlight hit={hit} attribute="slug" />
                </Typography>
                {hit.isDigitized && <VerifiedIcon sx={{ fontSize: 16, color: SCHOLAR_RED, mt: 0.5 }} />}
            </Box>

            {/* 2. Main Content */}
            <Box
                sx={{
                    flexGrow: 1,
                    // On mobile, no right padding. On desktop, 180px of "no-fly zone"
                    pr: { xs: 0, md: 22 },
                    position: 'relative',
                    display: 'flex',
                    flexDirection: 'column'
                }}
            >
                {/* Metadata, Title, and Description remain here */}
                <Typography variant="caption" sx={{ color: INK_MUTED, fontFamily: "Karla", fontWeight: 700, textTransform: 'uppercase', mb: 0.25, fontSize: '0.8rem' }}>
                    {dateDisplay} {hit.place && ` • ${hit.place}  • ${hit.author}`}
                </Typography>

                <Link href={`/entry/${hit.slug}`} underline="none">
                    <Typography variant="h6" sx={{ fontFamily: "Spectral", fontWeight: 700, color: SCHOLAR_BLACK, fontSize: "1.35rem", lineHeight: 1.25, mb: 0.5 }}>
                        <Highlight hit={hit} attribute="title" />
                    </Typography>
                </Link>

                {/* ... (Author and Description) ... */}

                {/* MOBILE ACTION ROW: Only visible on small screens */}
                <Box sx={{   display: { xs: 'flex', md: 'none' }, gap: 2, mt: 2, alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid #f0f0f0', pt: 2 }}>
                    <Stack direction="row" spacing={1}>
                        <IconButton size="small" onClick={handleCopy}><ContentCopyIcon fontSize="small" /></IconButton>
                        <IconButton
                            size="small"
                            onClick={() => onSave(hit)}
                            aria-label={isSaved ? "Remove from research list" : "Save to research list"}
                            sx={{ color: isSaved ? SCHOLAR_RED: INK_MUTED }}
                        >
                            {isSaved ? <BookmarkIcon /> : <BookmarkAddIcon />}
                        </IconButton>
                    </Stack>
                    <Button sx={{bgcolor: BTN_BG, '&:hover': { bgcolor: BTN_BG_HOVER }}} variant="contained" href={`/entry/${hit.slug}`} endIcon={<ArrowForwardIcon />}>View</Button>
                </Box>
            </Box>

            {/* 3. DESKTOP ACTION TOOLBAR: Hidden on mobile */}
            <Box
                className="hit-actions"
                sx={{
                    display: { xs: 'none', md: 'flex' }, // Hide on mobile
                    position: 'absolute',
                    right: 24,
                    color: SCHOLAR_RED,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    gap: 1,
                    alignItems: 'center',
                }}
            >


                <Tooltip title={isSaved ? "Remove" : "Save"}>
                    <IconButton
                        size="small"
                        onClick={() => onSave(hit)}
                        aria-label={isSaved ? "Remove from research list" : "Save to research list"}
                        sx={{
                            color: isSaved ? SCHOLAR_RED : INK_MUTED,
                            opacity: isSaved ? 1 : 0,
                            '.MuiBox-root:hover &': { opacity: 1 }
                        }}
                    >
                        {isSaved ? <BookmarkIcon fontSize="small" /> : <BookmarkAddIcon fontSize="small" />}
                    </IconButton>
                </Tooltip>

                <Button variant="contained" sx={{bgcolor: BTN_BG, '&:hover': { bgcolor: BTN_BG_HOVER }}} size="small" href={`/entry/${hit.slug}`} endIcon={<ArrowForwardIcon sx={{ fontSize: 14, color: '#fff' }} />}>
                    View
                </Button>
            </Box>
        </Box>
    );
}

// Helper function remains the same...
function formatDateRange(hit: RecordHit): string | null {
    const start = hit.startDate ? new Date(hit.startDate * 1000).getFullYear() : null;
    const end = hit.endDate ? new Date(hit.endDate * 1000).getFullYear() : null;
    if (start && end && start !== end) return `${start}–${end}`;
    if (start) return `${start}`;
    if (hit.year) return `${hit.year}`;
    return null;
}