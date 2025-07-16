import * as React from 'react';
import { Highlight } from 'react-instantsearch';
import type { Hit as AlgoliaHit } from 'instantsearch.js';
import { Card, CardContent, Typography, Button, CardActions } from '@mui/material';

import VerifiedIcon from '@mui/icons-material/Verified';
type RecordHit = AlgoliaHit<{
    id: string;
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

function formatDateRange(hit: RecordHit): string | null {
    const start = hit.startDate ? new Date(hit.startDate * 1000).getFullYear() : null;
    const end = hit.endDate ? new Date(hit.endDate * 1000).getFullYear() : null;
    if (start && end && start !== end) return `${start}–${end}`;
    if (start) return `${start}`;
    if (hit.year) return `${hit.year}`;
    return null;
}

export default function HitCard({ hit }) {
    const maxLength = 200;
    const [showMore, setShowMore] = React.useState(false);
    const dateDisplay = formatDateRange(hit);
    const shouldTruncate = hit.description && hit.description.length > maxLength;
    const displayedDescription =
        showMore || !shouldTruncate
            ? hit.description
            : hit.description?.slice(0, maxLength) + '…';

    return (
        <Card
            variant="outlined"
            raised
            sx={{
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                borderRadius: 3,          // more rounded
                boxShadow: 2,             // subtle shadow
                p: 2,                     // padding for content
                bgcolor: 'background.paper'
            }}
        >
            <CardContent sx={{ flexGrow: 1, p: 0 }}>
                {/* ID, Digitized Icon, and Slug on one line */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginBottom: 4 }}>
                    <Typography variant="subtitle2" color="primary" fontWeight="bold">
                        <Highlight hit={hit} attribute="id" />
                    </Typography>
                    {hit.isDigitized && (
                        <VerifiedIcon sx={{ color: 'darkblue', fontSize: 20 }} titleAccess="Digitized item" />
                    )}
                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: "bold", fontSize: 20, font: "inherit" }}>
                        {hit.slug}
                    </Typography>
                </div>

                {/* Date */}
                {dateDisplay && (
                    <Typography variant="subtitle2" color="info.main" sx={{ mb: 1 , color: 'darkblue' }}>
                        {dateDisplay}{hit.place && `, ${hit.place}`}
                    </Typography>
                )}
                {/* Description */}
                {displayedDescription && (
                    <Typography variant="body2" color="text.secondary" sx={{ font: "inherit", mb: 1 }}>
                        {displayedDescription}
                    </Typography>
                )}
            </CardContent>

            {/* Action button aligned right */}
            {hit.slug && (
                <CardActions sx={{ justifyContent: 'flex-end' }}>
                    <Button
                        variant="outlined"
                        color="darkblue"
                        size="medium"
                        href={`/entry/${hit.slug}`}
                        sx={{ borderRadius: 2 }}
                    >
                        View Entry
                    </Button>
                </CardActions>
            )}
        </Card>    );
}