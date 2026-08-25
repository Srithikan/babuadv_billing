
On Error Resume Next
Set objWord = CreateObject("Word.Application")
If Err.Number <> 0 Then
    WScript.Echo "Error launching Word: " & Err.Description
    WScript.Quit(1)
End If

objWord.Visible = False
objWord.DisplayAlerts = 0

' Open in ReadOnly mode (True) to prevent file-lock conflicts if the file is open elsewhere
Set objDoc = objWord.Documents.Open("D:\techverse\Babu Advocate Billing\server\generated_bills\HDFC_APF\2026-August\Bill_HDFC_APF_1787657621678.docx", False, True)
If Err.Number <> 0 Then
    WScript.Echo "Error opening document: " & Err.Description
    objWord.Quit
    WScript.Quit(1)
End If

objDoc.SaveAs "D:\techverse\Babu Advocate Billing\server\generated_bills\HDFC_APF\2026-August\Bill_HDFC_APF_1787657621678.pdf", 17
If Err.Number <> 0 Then
    WScript.Echo "Error saving PDF: " & Err.Description
    objDoc.Close False
    objWord.Quit
    WScript.Quit(1)
End If

objDoc.Close False
objWord.Quit
WScript.Echo "SUCCESS"
