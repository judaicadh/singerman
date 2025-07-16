import * as React from 'react';
import { styled } from '@mui/material/styles';
import Paper from '@mui/material/Paper';
import { Hits } from 'react-instantsearch';
import type { Hit as AlgoliaHit } from 'instantsearch.js';
import { Highlight } from 'react-instantsearch';
import {
    Card,
    CardContent,
    Typography,
    Button,
    CardActions
} from '@mui/material';

type RecordHit = AlgoliaHit<{
    objectID: string;
    slug: string;
    title: string;
    author?: string;
    contributor: string;
    place?: string;
    year?: string | number;
    description?: string;
    url?: string;
    startDate?: number;
    endDate?: number;
}>;

const Item = styled(Paper)(({ theme }) => ({
    backgroundColor: '#fff',
    ...theme.typography.body2,
    padding: theme.spacing(1),
    textAlign: 'left',
    color: (theme.vars ?? theme).palette.text.secondary,
    ...theme.applyStyles('dark', {
        backgroundColor: '#1A2027',
    }),
}));

function formatDateRange(hit: RecordHit): string | null {
    const start = hit.startDate ? new Date(hit.startDate * 1000).getFullYear() : null;
    const end = hit.endDate ? new Date(hit.endDate * 1000).getFullYear() : null;

    if (start && end && start !== end) return `${start}–${end}`;
    if (start) return `${start}`;
    if (hit.year) return `${hit.year}`;

    return null;
}

function HitItem({ hit }: { hit: RecordHit }) {
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
            sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}
        >
            <CardContent sx={{ flexGrow: 1 }}>
                <Typography sx={{ color: 'text.primary', fontSize: 16, fontWeight: 'bold' }}>
                    <Highlight hit={hit} attribute="title" />
                </Typography>

                    <Typography sx={{ color: 'text.secondary', mb: 1.5, fontSize: 14 , fontWeight: 'bold'}}>
                        {hit.slug}
                    </Typography>

                {dateDisplay && (
                    <Typography sx={{ color: 'text.secondary', mb: 1.5, fontSize: 14 }}>
                        {dateDisplay}
                    </Typography>
                )}

                {displayedDescription && (
                    <Typography variant="body2">{displayedDescription}</Typography>
                )}
            </CardContent>

            {hit.slug && (
                <CardActions>
                    <Button
                        variant="outlined"
                        size="medium"
                        href={`/entry/${hit.slug}`}

                    >
                        View Entry
                    </Button>
                </CardActions>
            )}
        </Card>
    );
}

export default function HitCard() {
    return <Hits hitComponent={HitItem} />;
}