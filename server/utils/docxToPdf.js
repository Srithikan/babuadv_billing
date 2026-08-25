const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

async function convertDocxToPdf(docxPath, pdfPath) {
    return new Promise((resolve, reject) => {
        const absDocx = path.resolve(docxPath);
        const absPdf = path.resolve(pdfPath);

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

        // Set a 15-second timeout on child process execution
        exec(`cscript //Nologo "${vbsScriptPath}"`, { timeout: 15000 }, (error, stdout, stderr) => {
            // Cleanup temp script
            try {
                if (fs.existsSync(vbsScriptPath)) fs.unlinkSync(vbsScriptPath);
            } catch (e) {
                /* ignore cleanup error */
            }

            if (error || !fs.existsSync(pdfPath)) {
                console.error("VBScript DOCX to PDF conversion error:", stdout || stderr || error);
                reject(error || new Error(`PDF conversion failed: ${stdout || stderr}`));
            } else {
                resolve(pdfPath);
            }
        });
    });
}

module.exports = { convertDocxToPdf };
