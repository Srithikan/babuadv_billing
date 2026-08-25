const path = require('path');
const fs = require('fs');

function migrateExistingBills() {
    const generatedDir = path.join(__dirname, '../generated_bills');

    if (!fs.existsSync(generatedDir)) return;

    const items = fs.readdirSync(generatedDir, { withFileTypes: true });
    const topFiles = items.filter(i => i.isFile());

    if (topFiles.length === 0) return;

    console.log(`Migrating ${topFiles.length} files in generated_bills to Bank/Month folders...`);

    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

    topFiles.forEach(fileItem => {
        const fileName = fileItem.name;
        const filePath = path.join(generatedDir, fileName);

        let bankFolder = "Uncategorized";
        let dateObj = new Date();

        try {
            const stats = fs.statSync(filePath);
            dateObj = stats.mtime;
        } catch (e) {}

        // Match pattern: Bill_Bank_Name_Timestamp.ext
        const match = fileName.match(/^Bill_(.+?)_\d+\.(docx|pdf)$/i);
        if (match && match[1]) {
            bankFolder = match[1];
        }

        const year = dateObj.getFullYear();
        const monthName = monthNames[dateObj.getMonth()];
        const monthFolder = `${year}-${monthName}`;

        const targetDir = path.join(generatedDir, bankFolder, monthFolder);
        if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
        }

        const targetPath = path.join(targetDir, fileName);
        try {
            fs.renameSync(filePath, targetPath);
        } catch (err) {
            console.error(`Failed to move ${fileName}:`, err);
        }
    });

    console.log("Migration complete!");
}

module.exports = migrateExistingBills;
