import React, { useState } from 'react';
import {
    FormGroup,
    FormControlLabel,
    Checkbox,
    TextField,
    Button,
    Chip,
    Box,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import { useRefinementList } from 'react-instantsearch';
import {
    Disclosure,
    DisclosureButton,
    DisclosurePanel
} from "@headlessui/react";
import {
    ChevronDownIcon,
    ChevronUpIcon
} from "@heroicons/react/20/solid";

type CustomRefinementListProps = {
    attribute: string;
    title?: string;
};

export default function CustomRefinementList({ attribute, title }: CustomRefinementListProps) {
    const {
        items,
        refine,
        searchForItems,
        canRefine,
        canToggleShowMore,
        isShowingMore,
        toggleShowMore,
        isFromSearch,
    } = useRefinementList({ attribute, searchable: true });

    const [searchInput, setSearchInput] = useState('');

    if (!canRefine) return null;

    return (
        <div className="bg-white px-4 dark:bg-gray-900">
            <Disclosure defaultOpen={true}>
                {({ open }) => (
                    <>
                        <DisclosureButton
                            className="flex w-full justify-between items-center py-3 text-left text-gray-900 dark:text-gray-100 font-medium border-b border-gray-200 dark:border-gray-700">
                            <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">{title}</h3>
                            {open ? (
                                <ChevronUpIcon className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                            ) : (
                                <ChevronDownIcon className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                            )}
                        </DisclosureButton>

                        <DisclosurePanel className="pt-3 px-4 space-y-3">
                            {/* 🔍 Search Input */}
                            <TextField
                                value={searchInput}
                                onChange={(e) => {
                                    const value = e.target.value;
                                    setSearchInput(value);
                                    searchForItems(value);
                                }}
                                placeholder="Search..."
                                size="small"
                                variant="outlined"
                                fullWidth
                            />

                            {/* Results */}
                            {items.length === 0 ? (
                                <p className="text-sm text-gray-500 dark:text-gray-400">No matching items.</p>
                            ) : (
                                <FormGroup>
                                    {items.map((item) => (
                                        <FormControlLabel
                                            key={item.label}
                                            control={
                                                <Checkbox
                                                    checked={item.isRefined}
                                                    onChange={() => refine(item.value)}
                                                    size="small"
                                                />
                                            }
                                            label={
                                                <Box
                                                    sx={{
                                                        display: 'block',
                                                        alignItems: 'right',
                                                        justifyContent: 'space-between',
                                                        width: '100%',
                                                        fontStretch: 'font-stretch-condensed'

                                                    }}
                                                >
                                                    <span>{item.label}</span>
                                                    <Chip
                                                        label={item.count}
                                                        size="small"
                                                        sx={{
                                                            ml: 1,
                                                            fontSize: '0.75rem',
                                                            height: '20px',
                                                            bgcolor: 'grey.200',
                                                            color: 'text.primary',
                                                            '& .MuiChip-label': {
                                                                px: 1,
                                                                fontWeight: 500,
                                                            },
                                                        }}
                                                    />
                                                </Box>
                                            }
                                            sx={{ justifyContent: 'space-between', mr: 0 }}
                                        />
                                    ))}
                                </FormGroup>
                            )}

                            {/* Show more */}
                            {canToggleShowMore && (
                                <Button
                                    onClick={toggleShowMore}
                                    endIcon={isShowingMore ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                                    size="small"
                                    sx={{ mt: 1 }}
                                >
                                    {isShowingMore ? 'Show less' : 'Show more'}
                                </Button>
                            )}
                        </DisclosurePanel>
                    </>
                )}
            </Disclosure>
        </div>
    );
}