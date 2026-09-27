const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

/**
 * Converts a DOCX file to PDF.
 * Supports Windows (via MS Word VBScript) and cross-platform/Linux (via headless LibreOffice/soffice).
 */
async function convertDocxToPdf(docxPath, pdfPath) {
    const absDocx = path.resolve(docxPath);
    const absPdf = path.resolve(pdfPath);
    const outDir = path.dirname(absPdf);

    if (!fs.existsSync(absDocx)) {
        throw new Error(`Source DOCX file does not exist: ${absDocx}`);
    }

    // 1. If running on Windows, try native MS Word VBScript first
    if (process.platform === 'win32') {
        try {
            await convertWithWordVbs(absDocx, absPdf);
            if (fs.existsSync(absPdf) && fs.statSync(absPdf).size > 0) {
                return absPdf;
            }
        } catch (vbsErr) {
            console.warn("MS Word conversion failed, trying LibreOffice fallback:", vbsErr.message);
        }
    }

    // 2. Cross-platform / Linux fallback using LibreOffice / soffice
    return await convertWithLibreOffice(absDocx, absPdf, outDir);
}

function convertWithWordVbs(absDocx, absPdf) {
    return new Promise((resolve, reject) => {
        const tempVbsName = `convert_${Date.now()}_${Math.random().toString(36).substring(7)}.vbs`;
        const vbsScriptPath = path.join(__dirname, tempVbsName);

        const vbsContent = `
On Error Resume Next
Set objWord = CreateObject("Word.Application")
If Err.Number <> 0 Then
    WScript.Echo "Error launching Word: " & Err.Description
    WScript.Quit(1)
End If

objWord.Visible = False
objWord.DisplayAlerts = 0

' Open in ReadOnly mode (True) to prevent file-lock conflicts if the file is open elsewhere
Set objDoc = objWord.Documents.Open("${absDocx.replace(/"/g, '""')}", False, True)
If Err.Number <> 0 Then
    WScript.Echo "Error opening document: " & Err.Description
    objWord.Quit
    WScript.Quit(1)
End If

objDoc.SaveAs "${absPdf.replace(/"/g, '""')}", 17
If Err.Number <> 0 Then
    WScript.Echo "Error saving PDF: " & Err.Description
    objDoc.Close False
    objWord.Quit
    WScript.Quit(1)
End If

objDoc.Close False
objWord.Quit
WScript.Echo "SUCCESS"
`;

        fs.writeFileSync(vbsScriptPath, vbsContent, 'utf8');

        // Set a 20-second timeout on child process execution
        exec(`cscript //Nologo "${vbsScriptPath}"`, { timeout: 20000 }, (error, stdout, stderr) => {
            try {
                if (fs.existsSync(vbsScriptPath)) fs.unlinkSync(vbsScriptPath);
            } catch (e) {
                /* ignore cleanup error */
            }

            if (error || !fs.existsSync(absPdf) || fs.statSync(absPdf).size === 0) {
                console.error("VBScript DOCX to PDF conversion error:", stdout || stderr || error);
                reject(error || new Error(`Word VBScript conversion failed: ${stdout || stderr}`));
            } else {
                resolve(absPdf);
            }
        });
    });
}

function convertWithLibreOffice(absDocx, absPdf, outDir) {
    return new Promise((resolve, reject) => {
        // Ensure destination directory exists
        if (!fs.existsSync(outDir)) {
            fs.mkdirSync(outDir, { recursive: true });
        }

        // Determine executable name: 'soffice' on Windows, 'libreoffice' or 'soffice' on Linux
        const cmdName = process.platform === 'win32' ? 'soffice' : 'libreoffice';

        // Create an isolated temporary directory to copy the source file into
        // This avoids spaces in directory paths (e.g. "Babu Advocate Billing") that cause LibreOffice "source file could not be loaded"
        const tempJobId = `conv_${Date.now()}_${Math.random().toString(36).substring(7)}`;
        const tempDir = path.join(os.tmpdir(), tempJobId);
        fs.mkdirSync(tempDir, { recursive: true });

        const safeDocxName = 'document.docx';
        const tempDocxPath = path.join(tempDir, safeDocxName);
        fs.copyFileSync(absDocx, tempDocxPath);

        // Isolated LibreOffice user profile URI to avoid javaldx errors and lock conflicts in headless/daemon environments
        const profileDir = path.join(tempDir, 'lo_profile');
        const profileUri = 'file:///' + profileDir.replace(/\\/g, '/');

        // Command: Use headless, isolated user profile, and export filter
        const command = `${cmdName} --headless --invisible --nodefault --nofirststartwizard --norestore "-env:UserInstallation=${profileUri}" --convert-to pdf:writer_pdf_Export --outdir "${tempDir}" "${tempDocxPath}"`;

        exec(command, { timeout: 45000 }, (error, stdout, stderr) => {
            const tempGeneratedPdf = path.join(tempDir, 'document.pdf');

            let success = false;
            if (fs.existsSync(tempGeneratedPdf) && fs.statSync(tempGeneratedPdf).size > 0) {
                try {
                    // Copy generated PDF to final target path
                    fs.copyFileSync(tempGeneratedPdf, absPdf);
                    success = fs.existsSync(absPdf) && fs.statSync(absPdf).size > 0;
                } catch (copyErr) {
                    console.error("Failed to copy generated PDF to destination:", copyErr);
                }
            }

            // Cleanup temp directory
            try {
                if (fs.existsSync(tempDir)) {
                    fs.rmSync(tempDir, { recursive: true, force: true });
                }
            } catch (cleanupErr) {
                /* ignore cleanup error */
            }

            if (success) {
                return resolve(absPdf);
            }

            const errMsg = stderr || stdout || (error ? error.message : 'Unknown LibreOffice error');
            reject(new Error(`LibreOffice PDF conversion produced an empty or missing file: ${errMsg}`));
        });
    });
}

module.exports = { convertDocxToPdf };
