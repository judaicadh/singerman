// src/utils/slugify.js
export function slugify(text) {
    return text
        .toLowerCase()
        .normalize('NFD')                     // Remove diacritics
        .replace(/[\u0300-\u036f]/g, '')     // Strip accents
        .replace(/[^\w\s-]/g, '')            // Remove special characters
        .trim()
        .replace(/\s+/g, '-');               // Replace spaces with dashes
}