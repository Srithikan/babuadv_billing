const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');

const generatedDir = path.join(__dirname, '../generated_bills');

// Helper to get formatted month label from YYYY-MonthName folder (e.g. 2026-August -> August 2026)
function formatMonthLabel(folderName) {
    const parts = folderName.split('-');
    if (parts.length === 2) {
        return `${parts[1]} ${parts[0]}`;
    }
    return folderName;
}

// GET /api/library - Scan generated_bills folder tree
router.get('/', (req, res) => {
    try {
        if (!fs.existsSync(generatedDir)) {
            fs.mkdirSync(generatedDir, { recursive: true });
        }

        const bankFolders = fs.readdirSync(generatedDir, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory());

        const libraryData = [];

        bankFolders.forEach(bankDir => {
            const bankNameFormatted = bankDir.name.replace(/_/g, ' ');
            const bankPath = path.join(generatedDir, bankDir.name);

            const monthFolders = fs.readdirSync(bankPath, { withFileTypes: true })
                .filter(dirent => dirent.isDirectory());

            const monthsData = [];

            monthFolders.forEach(monthDir => {
                const monthPath = path.join(bankPath, monthDir.name);
                const allFiles = fs.readdirSync(monthPath, { withFileTypes: true })
                    .filter(dirent => dirent.isFile());

                const docxFiles = allFiles.filter(f => f.name.endsWith('.docx'));
                const fileItems = [];

                docxFiles.forEach(docxFile => {
                    const docxPath = path.join(monthPath, docxFile.name);
                    const stats = fs.statSync(docxPath);
                    const pdfName = docxFile.name.replace(/\.docx$/i, '.pdf');
                    const hasPdf = fs.existsSync(path.join(monthPath, pdfName));

                    // Relative path for download e.g. ICICI_KCC/2026-August/Bill_...docx
                    const relDocxPath = `${bankDir.name}/${monthDir.name}/${docxFile.name}`;
                    const relPdfPath = hasPdf ? `${bankDir.name}/${monthDir.name}/${pdfName}` : null;

                    fileItems.push({
                        name: docxFile.name,
                        docxUrl: `/api/download/${relDocxPath}`,
                        pdfUrl: hasPdf ? `/api/download/${relPdfPath}` : null,
                        hasPdf: hasPdf,
                        sizeKB: Math.round(stats.size / 1024),
                        createdAt: stats.mtime
                    });
                });

                // Sort files newest first
                fileItems.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

                monthsData.push({
                    folderName: monthDir.name,
                    label: formatMonthLabel(monthDir.name),
                    count: fileItems.length,
                    files: fileItems
                });
            });

            // Sort months newest first
            monthsData.sort((a, b) => b.folderName.localeCompare(a.folderName));

            const totalBankFiles = monthsData.reduce((sum, m) => sum + m.count, 0);

            libraryData.push({
                bankName: bankNameFormatted,
                folderName: bankDir.name,
                totalFiles: totalBankFiles,
                months: monthsData
            });
        });

        // Sort banks alphabetically
        libraryData.sort((a, b) => a.bankName.localeCompare(b.bankName));

        res.json({
            success: true,
            totalBanks: libraryData.length,
            totalDocxFiles: libraryData.reduce((sum, b) => sum + b.totalFiles, 0),
            data: libraryData
        });
    } catch (err) {
        console.error("Error reading library:", err);
        res.status(500).json({ error: "Failed to read file library", details: err.message });
    }
});

module.exports = router;
