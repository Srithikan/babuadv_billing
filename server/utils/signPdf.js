const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const fs = require('fs');

async function addDigitalSignature(pdfPath, signerName = 'BABU') {
    const existingPdfBytes = fs.readFileSync(pdfPath);
    const pdfDoc = await PDFDocument.load(existingPdfBytes);
    
    const pages = pdfDoc.getPages();
    const lastPage = pages[pages.length - 1];
    const { width, height } = lastPage.getSize();

    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);

    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const mins = String(now.getMinutes()).padStart(2, '0');
    const secs = String(now.getSeconds()).padStart(2, '0');

    const dateStr = `${year}.${month}.${day}`;
    const timeStr = `${hours}:${mins}:${secs}`;
    const tzStr = `+05'30'`;

    // Signature Box Dimensions & Position (Bottom Right)
    const boxWidth = 210;
    const boxHeight = 90;
    const marginX = 35;
    const marginY = 35;

    const x = width - boxWidth - marginX;
    const y = marginY;

    // 1. Draw background box
    lastPage.drawRectangle({
        x: x,
        y: y,
        width: boxWidth,
        height: boxHeight,
        color: rgb(1, 1, 1),
        borderColor: rgb(0.85, 0.85, 0.85),
        borderWidth: 1,
        opacity: 0.95
    });

    // 2. Cursive flourish signature loop in rose/red
    lastPage.drawSvgPath(
        `M ${x + 20} ${y + boxHeight - 15} C ${x + 45} ${y + boxHeight + 15}, ${x + 65} ${y + 5}, ${x + 105} ${y + 25} S ${x + 155} ${y + 45}, ${x + 180} ${y + 20}`,
        {
            borderColor: rgb(0.92, 0.55, 0.62),
            borderWidth: 1.8,
        }
    );

    // 3. Draw "BA" and "BU" initials on left (Matching reference image)
    lastPage.drawText('BA', {
        x: x + 12,
        y: y + boxHeight - 34,
        size: 34,
        font: fontBold,
        color: rgb(0, 0, 0),
    });

    lastPage.drawText('BU', {
        x: x + 12,
        y: y + boxHeight - 72,
        size: 34,
        font: fontBold,
        color: rgb(0, 0, 0),
    });

    // 4. Draw Right Text Info Block (Matching reference image layout)
    const textX = x + 90;
    let textY = y + boxHeight - 18;

    lastPage.drawText('Digitally', {
        x: textX,
        y: textY,
        size: 11,
        font: fontRegular,
        color: rgb(0.1, 0.1, 0.1),
    });
    textY -= 13;

    lastPage.drawText('signed by', {
        x: textX,
        y: textY,
        size: 11,
        font: fontRegular,
        color: rgb(0.1, 0.1, 0.1),
    });
    textY -= 14;

    lastPage.drawText(signerName, {
        x: textX,
        y: textY,
        size: 12,
        font: fontBold,
        color: rgb(0, 0, 0),
    });
    textY -= 14;

    lastPage.drawText('Date:', {
        x: textX,
        y: textY,
        size: 11,
        font: fontRegular,
        color: rgb(0.1, 0.1, 0.1),
    });
    textY -= 13;

    lastPage.drawText(`${dateStr}`, {
        x: textX,
        y: textY,
        size: 11,
        font: fontRegular,
        color: rgb(0.1, 0.1, 0.1),
    });
    textY -= 13;

    lastPage.drawText(`${timeStr}`, {
        x: textX,
        y: textY,
        size: 11,
        font: fontRegular,
        color: rgb(0.1, 0.1, 0.1),
    });
    textY -= 12;

    lastPage.drawText(`${tzStr}`, {
        x: textX,
        y: textY,
        size: 10,
        font: fontRegular,
        color: rgb(0.2, 0.2, 0.2),
    });

    const modifiedPdfBytes = await pdfDoc.save();
    fs.writeFileSync(pdfPath, modifiedPdfBytes);
}

module.exports = { addDigitalSignature };
