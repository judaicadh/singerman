export const downloadRIS = (hit) => {
    const risData = [
        "TY  - BOOK",
        `TI  - ${hit.title}`,
        hit.author ? `AU  - ${hit.author}` : `AU  - ${hit.contributor || 'Unknown'}`,
        `PY  - ${hit.year || ''}`,
        `CY  - ${hit.place || ''}`,
        `AB  - ${hit.description || ''}`,
        `ID  - Singerman ${hit.objectID}`,
        "ER  - " // End of Record
    ].join("\n");

    const blob = new Blob([risData], { type: "application/x-research-info-systems" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${hit.id || 'citation'}.ris`;
    link.click();
};