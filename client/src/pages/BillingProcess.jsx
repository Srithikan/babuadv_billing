import { useState, useCallback } from 'react';
import axios from 'axios';
import { useDropzone } from 'react-dropzone';
import { Link } from 'react-router-dom';
import { Upload, FileText, CheckCircle2, AlertCircle, Download, FileSpreadsheet, ArrowRight, RefreshCw, Sparkles, Building2 } from 'lucide-react';
import clsx from 'clsx';

const API_URL = 'http://localhost:5000/api';

export default function BillingProcess() {
    const [status, setStatus] = useState('idle'); // idle, processing, success, warning, error
    const [results, setResults] = useState(null);
    const [errors, setErrors] = useState([]);
    const [skippedSummary, setSkippedSummary] = useState(null);
    const [selectedFile, setSelectedFile] = useState(null);

    const onDrop = useCallback(async (acceptedFiles) => {
        const file = acceptedFiles[0];
        if (!file) return;

        setSelectedFile(file);
        setStatus('processing');
        setErrors([]);
        setResults(null);
        setSkippedSummary(null);

        const formData = new FormData();
        formData.append('file', file);

        try {
            const res = await axios.post(`${API_URL}/billing/generate`, formData);
            if (res.data.success) {
                setResults(res.data.generatedFiles);
                setSkippedSummary(res.data.skippedSummary || null);
                setErrors(res.data.errors || []);
                setStatus(res.data.errors?.length > 0 ? 'warning' : 'success');
            } else {
                setErrors([res.data.error || 'Unknown error occurred during bill generation']);
                setStatus('error');
            }
        } catch (err) {
            console.error(err);
            if (err.code === 'ERR_NETWORK' || !err.response) {
                setErrors(['Backend API server (port 5000) was unreachable. The server has now been started. Please try uploading your file again.']);
            } else {
                setErrors([err.response?.data?.error || err.message || 'Error processing request']);
            }
            setStatus('error');
        }
    }, []);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: {
            'text/csv': ['.csv'],
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
            'application/vnd.ms-excel': ['.xls']
        },
        maxFiles: 1
    });

    const resetProcess = () => {
        setStatus('idle');
        setResults(null);
        setErrors([]);
        setSkippedSummary(null);
        setSelectedFile(null);
    };

    return (
        <div className="space-y-8 pb-10 max-w-5xl mx-auto">
            {/* Header */}
            <div>
                <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Billing Process Engine</h2>
                <p className="text-xs text-slate-500 mt-1">Upload CSV or Excel data to compute pricing, merge multi-property rows, and generate DOCX bills</p>
            </div>

            {/* Stepper Header */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex items-center justify-between px-8 text-xs font-semibold text-slate-500">
                <div className={clsx("flex items-center gap-2", status === 'idle' ? "text-amber-600 font-bold" : "text-slate-700")}>
                    <span className={clsx("w-6 h-6 rounded-full flex items-center justify-center text-[11px]", status === 'idle' ? "bg-amber-500 text-slate-950" : "bg-slate-200 text-slate-700")}>1</span>
                    Upload Data File
                </div>
                <ArrowRight size={14} className="text-slate-300" />
                <div className={clsx("flex items-center gap-2", status === 'processing' ? "text-amber-600 font-bold" : "text-slate-700")}>
                    <span className={clsx("w-6 h-6 rounded-full flex items-center justify-center text-[11px]", status === 'processing' ? "bg-amber-500 text-slate-950" : "bg-slate-200 text-slate-700")}>2</span>
                    Automated Processing
                </div>
                <ArrowRight size={14} className="text-slate-300" />
                <div className={clsx("flex items-center gap-2", (status === 'success' || status === 'warning') ? "text-emerald-600 font-bold" : "text-slate-700")}>
                    <span className={clsx("w-6 h-6 rounded-full flex items-center justify-center text-[11px]", (status === 'success' || status === 'warning') ? "bg-emerald-500 text-white" : "bg-slate-200 text-slate-700")}>3</span>
                    Download Generated DOCX
                </div>
            </div>

            {/* Main Processing Box */}
            <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-200/80">
                {status === 'idle' && (
                    <div
                        {...getRootProps()}
                        className={clsx(
                            "border-2 border-dashed rounded-3xl p-12 text-center cursor-pointer transition-all duration-300",
                            isDragActive
                                ? "border-amber-500 bg-amber-50/50 scale-[1.01]"
                                : "border-slate-200 hover:border-amber-400 hover:bg-slate-50/60"
                        )}
                    >
                        <input {...getInputProps()} />
                        <div className="w-16 h-16 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center mx-auto mb-5 shadow-inner border border-amber-300/50">
                            <Upload size={28} />
                        </div>
                        <p className="text-lg font-extrabold text-slate-900 mb-1">
                            {isDragActive ? "Drop file here..." : "Upload Billing Spreadsheet"}
                        </p>
                        <p className="text-slate-500 text-xs max-w-sm mx-auto mb-6">
                            Drag & drop your legal opinion data file here, or click to browse. Supports <strong className="text-slate-700">.xlsx, .xls, .csv</strong>
                        </p>

                        <div className="flex items-center justify-center gap-3 text-xs text-slate-400">
                            <span className="flex items-center gap-1 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200/80">
                                <FileSpreadsheet size={13} className="text-emerald-600" /> Auto Column Normalization
                            </span>
                            <span className="flex items-center gap-1 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200/80">
                                <Sparkles size={13} className="text-amber-600" /> Multi-Property Auto-Merge
                            </span>
                        </div>
                    </div>
                )}

                {/* Processing State */}
                {status === 'processing' && (
                    <div className="py-16 text-center flex flex-col items-center justify-center">
                        <div className="w-12 h-12 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                        <h4 className="text-slate-900 font-bold text-base mb-1">Processing Records & Merging Opinions...</h4>
                        <p className="text-slate-500 text-xs max-w-xs mx-auto">
                            Parsing {selectedFile ? selectedFile.name : 'spreadsheet'}, calculating category fees, and populating Word templates.
                        </p>
                    </div>
                )}

                {/* Warnings / Errors Header inside status */}
                {errors.length > 0 && status !== 'processing' && (
                    <div className="mb-6 bg-amber-50/80 border border-amber-200 p-5 rounded-2xl animate-fade-in flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                            <h4 className="flex items-center gap-2 text-amber-800 font-bold text-sm mb-2">
                                <AlertCircle size={18} /> Processing Notifications & Adjustments
                            </h4>
                            <ul className="list-disc list-inside text-xs text-amber-700 space-y-1 ml-1 font-medium">
                                {errors.map((err, i) => <li key={i}>{err}</li>)}
                            </ul>
                        </div>
                        {skippedSummary && (
                            <div className="flex-shrink-0">
                                <a
                                    href={`http://localhost:5000${skippedSummary.url}`}
                                    download
                                    className="inline-flex items-center gap-1.5 bg-amber-600 hover:bg-amber-700 text-white px-3.5 py-2 rounded-xl text-xs font-bold transition-colors shadow-xs"
                                    title="Download CSV audit report of all skipped rows and banks"
                                >
                                    <Download size={13} /> Skipped Summary ({skippedSummary.count} {skippedSummary.count === 1 ? 'row' : 'rows'})
                                </a>
                            </div>
                        )}
                    </div>
                )}

                {/* Success / Generated Bills Results */}
                {(status === 'success' || status === 'warning') && results && results.length > 0 && (
                    <div className="animate-fade-in mb-8">
                        <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-100">
                            <h4 className="flex items-center gap-2 text-slate-900 font-bold text-lg">
                                <CheckCircle2 size={24} className="text-emerald-500" />
                                Batch Completed ({results.length} {results.length === 1 ? 'Bill' : 'Bills'} Generated)
                            </h4>
                            <button
                                onClick={resetProcess}
                                className="text-xs font-semibold text-slate-500 hover:text-slate-800 flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 px-3.5 py-2 rounded-xl transition-colors"
                            >
                                <RefreshCw size={13} /> Reset View
                            </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {results.map((file, i) => (
                                <div
                                    key={i}
                                    className="bg-slate-50 border border-slate-200/80 p-5 rounded-2xl flex items-center justify-between hover:shadow-md transition-all duration-200 group"
                                >
                                    <div className="flex items-center gap-4 overflow-hidden">
                                        <div className="w-12 h-12 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center flex-shrink-0 group-hover:bg-amber-500 group-hover:text-slate-950 transition-colors border border-amber-300/50">
                                            <FileText size={22} />
                                        </div>
                                        <div className="overflow-hidden">
                                            <p className="font-bold text-slate-900 text-sm truncate" title={file.bank}>{file.bank}</p>
                                            <p className="text-xs text-slate-400 truncate">{file.filename}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 flex-shrink-0">
                                        <a
                                            href={file.docxUrl ? `http://localhost:5000${file.docxUrl}` : `${API_URL}/download/${file.filename}`}
                                            download
                                            className="inline-flex items-center gap-1.5 bg-slate-800 hover:bg-slate-900 text-white px-3.5 py-2 rounded-xl text-xs font-bold transition-colors shadow-xs"
                                            title="Download Word Document (.docx)"
                                        >
                                            <Download size={13} /> .DOCX
                                        </a>
                                        {file.pdfFilename && (
                                            <a
                                                href={file.pdfUrl ? `http://localhost:5000${file.pdfUrl}` : `${API_URL}/download/${file.pdfFilename}`}
                                                download
                                                className="inline-flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white px-3.5 py-2 rounded-xl text-xs font-bold transition-colors shadow-xs"
                                                title="Download Signed PDF Document (.pdf)"
                                            >
                                                <Download size={13} /> .PDF (Signed)
                                            </a>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Empty Results Fallback when status is finished but 0 bills generated */}
                {(status === 'success' || status === 'warning') && (!results || results.length === 0) && (
                    <div className="animate-fade-in py-8 text-center bg-slate-50 rounded-2xl border border-slate-200/80 p-6 mb-8">
                        <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mx-auto mb-3">
                            <Building2 size={24} />
                        </div>
                        <h4 className="font-bold text-slate-900 text-base mb-1">No Matching Registered Banks Found</h4>
                        <p className="text-xs text-slate-500 max-w-md mx-auto mb-5">
                            Bills could not be generated for the bank names in this file because they are not registered in the system. You can download the skipped summary report below, register missing banks in Bank Manager, or drop another file.
                        </p>
                        <div className="flex flex-wrap items-center justify-center gap-3">
                            {skippedSummary && (
                                <a
                                    href={`http://localhost:5000${skippedSummary.url}`}
                                    download
                                    className="inline-flex items-center gap-1.5 bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-xl text-xs font-bold transition-colors shadow-xs"
                                >
                                    <Download size={13} /> Download Skipped Summary CSV ({skippedSummary.count} {skippedSummary.count === 1 ? 'row' : 'rows'})
                                </a>
                            )}
                            <Link
                                to="/banks"
                                className="inline-flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 px-4 py-2 rounded-xl text-xs font-bold transition-colors"
                            >
                                <Building2 size={13} /> Manage Banks in Bank Manager
                            </Link>
                        </div>
                    </div>
                )}

                {/* Persistent Dropzone at bottom after processing */}
                {status !== 'idle' && status !== 'processing' && (
                    <div className="pt-6 border-t border-slate-100">
                        <p className="text-xs font-semibold text-slate-500 mb-3 flex items-center gap-1.5">
                            <Upload size={14} className="text-amber-600" /> Process Another Data File
                        </p>
                        <div
                            {...getRootProps()}
                            className={clsx(
                                "border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all duration-300",
                                isDragActive
                                    ? "border-amber-500 bg-amber-50/50 scale-[1.01]"
                                    : "border-slate-200 hover:border-amber-400 hover:bg-slate-50/60"
                            )}
                        >
                            <input {...getInputProps()} />
                            <p className="text-sm font-bold text-slate-800">
                                {isDragActive ? "Drop file here..." : "Drag & drop another spreadsheet here, or click to browse"}
                            </p>
                            <p className="text-slate-400 text-[11px] mt-0.5">
                                Supports .xlsx, .xls, .csv
                            </p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
