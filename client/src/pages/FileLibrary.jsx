import { useEffect, useState } from 'react';
import axios from 'axios';
import { Folder, FolderOpen, Search, Download, FileText, ChevronRight, HardDrive, RefreshCw, LayoutGrid, List, Home, ArrowLeft } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:5000';

export default function FileLibrary() {
    const [library, setLibrary] = useState([]);
    const [stats, setStats] = useState({ totalBanks: 0, totalDocxFiles: 0 });
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');

    // Google Drive style navigation state
    const [currentBank, setCurrentBank] = useState(null);
    const [currentMonth, setCurrentMonth] = useState(null);
    const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'list'

    const fetchLibrary = async () => {
        setLoading(true);
        try {
            const res = await axios.get(`${API_URL}/library`);
            if (res.data.success) {
                setLibrary(res.data.data || []);
                setStats({
                    totalBanks: res.data.totalBanks || 0,
                    totalDocxFiles: res.data.totalDocxFiles || 0
                });
            }
        } catch (err) {
            console.error("Error loading file library:", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchLibrary();
    }, []);

    // Navigate to Root
    const goToRoot = () => {
        setCurrentBank(null);
        setCurrentMonth(null);
    };

    // Navigate to Bank
    const selectBank = (bank) => {
        setCurrentBank(bank);
        setCurrentMonth(null);
    };

    // Navigate to Month
    const selectMonth = (month) => {
        setCurrentMonth(month);
    };

    // Global search matching across all banks, months, and files
    const searchResults = [];
    if (searchQuery.trim()) {
        library.forEach(bank => {
            bank.months.forEach(month => {
                month.files.forEach(file => {
                    if (
                        file.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        bank.bankName.toLowerCase().includes(searchQuery.toLowerCase())
                    ) {
                        searchResults.push({
                            ...file,
                            bankName: bank.bankName,
                            monthLabel: month.label
                        });
                    }
                });
            });
        });
    }

    return (
        <div className="space-y-6 pb-10 max-w-6xl mx-auto">
            {/* Header Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200/80">
                <div>
                    <div className="flex items-center gap-2">
                        <h2 className="text-2xl font-bold text-slate-900 tracking-tight">File Drive</h2>
                        <span className="bg-amber-100 text-amber-900 border border-amber-300/60 text-xs font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1">
                            <HardDrive size={12} /> {stats.totalDocxFiles} Saved Bills
                        </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">Google Drive-style folder navigation for archived legal opinion bills</p>
                </div>

                <div className="flex items-center gap-2">
                    {/* View Switcher Toggle */}
                    <div className="bg-slate-100 p-1 rounded-xl flex items-center border border-slate-200">
                        <button
                            onClick={() => setViewMode('grid')}
                            className={`p-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors ${
                                viewMode === 'grid' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-900'
                            }`}
                            title="Grid View"
                        >
                            <LayoutGrid size={15} />
                        </button>
                        <button
                            onClick={() => setViewMode('list')}
                            className={`p-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors ${
                                viewMode === 'list' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-900'
                            }`}
                            title="List View"
                        >
                            <List size={15} />
                        </button>
                    </div>

                    <button
                        onClick={fetchLibrary}
                        className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold px-3.5 py-2 rounded-2xl text-xs transition-colors flex items-center gap-1.5 border border-slate-200"
                    >
                        <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
                    </button>
                </div>
            </div>

            {/* Google Drive Breadcrumb Navigation Bar */}
            <div className="bg-white px-5 py-3 rounded-2xl shadow-sm border border-slate-200/80 flex items-center justify-between text-xs font-semibold">
                <div className="flex items-center gap-2 overflow-x-auto text-slate-600">
                    <button
                        onClick={goToRoot}
                        className={`flex items-center gap-1.5 hover:text-amber-600 transition-colors ${
                            !currentBank ? 'text-amber-700 font-bold' : ''
                        }`}
                    >
                        <Home size={15} /> Drive Root
                    </button>

                    {currentBank && (
                        <>
                            <ChevronRight size={14} className="text-slate-300 flex-shrink-0" />
                            <button
                                onClick={() => setCurrentMonth(null)}
                                className={`hover:text-amber-600 transition-colors whitespace-nowrap ${
                                    !currentMonth ? 'text-amber-700 font-bold' : ''
                                }`}
                            >
                                {currentBank.bankName}
                            </button>
                        </>
                    )}

                    {currentMonth && (
                        <>
                            <ChevronRight size={14} className="text-slate-300 flex-shrink-0" />
                            <span className="text-amber-700 font-bold whitespace-nowrap">{currentMonth.label}</span>
                        </>
                    )}
                </div>

                {/* Back Button if inside folder */}
                {(currentBank || currentMonth) && (
                    <button
                        onClick={() => {
                            if (currentMonth) setCurrentMonth(null);
                            else setCurrentBank(null);
                        }}
                        className="text-xs text-slate-500 hover:text-slate-900 font-semibold flex items-center gap-1 bg-slate-100 px-3 py-1 rounded-xl hover:bg-slate-200 transition-colors ml-2 flex-shrink-0"
                    >
                        <ArrowLeft size={13} /> Back
                    </button>
                )}
            </div>

            {/* Search Input */}
            <div className="relative">
                <Search size={17} className="absolute left-4 top-3.5 text-slate-400" />
                <input
                    type="text"
                    placeholder="Search files or banks in your drive..."
                    className="w-full pl-11 pr-4 py-3 bg-white border border-slate-200/80 rounded-2xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all shadow-xs"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                />
            </div>

            {/* Loading Indicator */}
            {loading ? (
                <div className="py-20 text-center flex flex-col items-center justify-center">
                    <div className="w-10 h-10 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                    <p className="text-slate-600 text-xs font-semibold">Loading Drive Folders...</p>
                </div>
            ) : searchQuery.trim() ? (
                /* SEARCH RESULTS VIEW */
                <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-sm space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                        <h3 className="font-bold text-slate-900 text-sm">
                            Search Results for "{searchQuery}" ({searchResults.length} items found)
                        </h3>
                        <button
                            onClick={() => setSearchQuery('')}
                            className="text-xs text-amber-600 hover:underline font-semibold"
                        >
                            Clear search
                        </button>
                    </div>

                    {searchResults.length === 0 ? (
                        <p className="text-slate-400 text-xs py-8 text-center">No files found matching your search term.</p>
                    ) : (
                        <div className="divide-y divide-slate-100">
                            {searchResults.map((file, i) => (
                                <div key={i} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50 p-3 rounded-2xl transition-colors">
                                    <div className="flex items-center gap-3 overflow-hidden">
                                        <div className="p-2.5 bg-amber-100 text-amber-900 rounded-xl border border-amber-200 flex-shrink-0">
                                            <FileText size={18} />
                                        </div>
                                        <div className="overflow-hidden">
                                            <p className="font-bold text-slate-800 text-xs truncate">{file.name}</p>
                                            <p className="text-[10px] text-slate-400 mt-0.5">
                                                Location: <strong className="text-slate-600">{file.bankName}</strong> / {file.monthLabel} • {file.sizeKB} KB
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 flex-shrink-0">
                                        <a
                                            href={`http://localhost:5000${file.docxUrl}`}
                                            download
                                            className="inline-flex items-center gap-1 bg-slate-800 hover:bg-slate-900 text-white px-3 py-1.5 rounded-xl text-xs font-bold transition-colors"
                                        >
                                            <Download size={12} /> .DOCX
                                        </a>
                                        {file.hasPdf && (
                                            <a
                                                href={`http://localhost:5000${file.pdfUrl}`}
                                                download
                                                className="inline-flex items-center gap-1 bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-xl text-xs font-bold transition-colors"
                                            >
                                                <Download size={12} /> .PDF (Signed)
                                            </a>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            ) : !currentBank ? (
                /* LEVEL 1: ROOT LEVEL - BANK FOLDERS */
                <div className="space-y-3">
                    <div className="flex items-center justify-between px-1">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                            Bank Folders ({library.length})
                        </span>
                    </div>

                    {library.length === 0 ? (
                        <div className="bg-white rounded-3xl p-16 text-center border border-slate-200/80">
                            <FolderOpen size={36} className="mx-auto mb-2 text-slate-300" />
                            <p className="font-bold text-slate-700 text-base">No Bank Folders Available</p>
                            <p className="text-xs text-slate-400 mt-1">Generated bills will automatically appear in their bank folders here.</p>
                        </div>
                    ) : viewMode === 'grid' ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                            {library.map(bank => (
                                <div
                                    key={bank.folderName}
                                    onClick={() => selectBank(bank)}
                                    className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs hover:shadow-md hover:border-amber-300 hover:scale-[1.01] transition-all cursor-pointer group flex flex-col justify-between"
                                >
                                    <div className="flex items-start justify-between mb-4">
                                        <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-900 border border-amber-300/60 flex items-center justify-center group-hover:bg-amber-500 group-hover:text-slate-950 transition-colors shadow-inner">
                                            <Folder size={24} className="fill-amber-400/50" />
                                        </div>
                                        <span className="text-[10px] font-extrabold px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                                            {bank.totalFiles} {bank.totalFiles === 1 ? 'file' : 'files'}
                                        </span>
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-slate-900 text-sm group-hover:text-amber-700 transition-colors truncate">
                                            {bank.bankName}
                                        </h4>
                                        <p className="text-[10px] text-slate-400 mt-0.5">
                                            {bank.months.length} {bank.months.length === 1 ? 'Month Folder' : 'Month Folders'}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        /* List view for banks */
                        <div className="bg-white rounded-3xl border border-slate-200/80 divide-y divide-slate-100 overflow-hidden shadow-xs">
                            {library.map(bank => (
                                <div
                                    key={bank.folderName}
                                    onClick={() => selectBank(bank)}
                                    className="p-4 flex items-center justify-between hover:bg-slate-50 cursor-pointer transition-colors"
                                >
                                    <div className="flex items-center gap-3.5">
                                        <Folder size={22} className="text-amber-500 fill-amber-100" />
                                        <div>
                                            <p className="font-bold text-slate-900 text-sm">{bank.bankName}</p>
                                            <p className="text-xs text-slate-400">{bank.months.length} month subfolders</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3 text-slate-400 text-xs font-medium">
                                        <span>{bank.totalFiles} files</span>
                                        <ChevronRight size={16} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            ) : !currentMonth ? (
                /* LEVEL 2: INSIDE BANK - MONTH FOLDERS */
                <div className="space-y-3 animate-fade-in">
                    <div className="flex items-center justify-between px-1">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                            Folders inside {currentBank.bankName} ({currentBank.months.length})
                        </span>
                    </div>

                    {currentBank.months.length === 0 ? (
                        <div className="bg-white rounded-3xl p-12 text-center border border-slate-200/80 text-slate-400">
                            No monthly subfolders inside this bank folder yet.
                        </div>
                    ) : viewMode === 'grid' ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                            {currentBank.months.map(month => (
                                <div
                                    key={month.folderName}
                                    onClick={() => selectMonth(month)}
                                    className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs hover:shadow-md hover:border-amber-300 hover:scale-[1.01] transition-all cursor-pointer group flex items-center gap-4"
                                >
                                    <div className="p-3.5 bg-amber-50 text-amber-600 rounded-2xl group-hover:bg-amber-500 group-hover:text-slate-950 transition-colors border border-amber-200">
                                        <Folder size={22} className="fill-amber-300/50" />
                                    </div>
                                    <div className="overflow-hidden">
                                        <h4 className="font-bold text-slate-900 text-sm group-hover:text-amber-700 transition-colors truncate">
                                            {month.label}
                                        </h4>
                                        <p className="text-[11px] text-slate-400 mt-0.5">
                                            {month.files.length} {month.files.length === 1 ? 'file' : 'files'}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="bg-white rounded-3xl border border-slate-200/80 divide-y divide-slate-100 overflow-hidden shadow-xs">
                            {currentBank.months.map(month => (
                                <div
                                    key={month.folderName}
                                    onClick={() => selectMonth(month)}
                                    className="p-4 flex items-center justify-between hover:bg-slate-50 cursor-pointer transition-colors"
                                >
                                    <div className="flex items-center gap-3">
                                        <Folder size={20} className="text-amber-500 fill-amber-100" />
                                        <span className="font-bold text-slate-900 text-sm">{month.label}</span>
                                    </div>
                                    <div className="flex items-center gap-3 text-xs text-slate-400">
                                        <span>{month.files.length} files</span>
                                        <ChevronRight size={16} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            ) : (
                /* LEVEL 3: INSIDE MONTH - FILES */
                <div className="space-y-3 animate-fade-in">
                    <div className="flex items-center justify-between px-1">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                            Files in {currentBank.bankName} / {currentMonth.label} ({currentMonth.files.length})
                        </span>
                    </div>

                    <div className="bg-white rounded-3xl border border-slate-200/80 overflow-hidden shadow-sm">
                        <div className="divide-y divide-slate-100">
                            {currentMonth.files.map((file, idx) => (
                                <div
                                    key={idx}
                                    className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/70 transition-colors"
                                >
                                    <div className="flex items-center gap-3.5 overflow-hidden">
                                        <div className="p-3 bg-amber-50 text-amber-800 rounded-2xl border border-amber-200 flex-shrink-0">
                                            <FileText size={20} />
                                        </div>
                                        <div className="overflow-hidden">
                                            <p className="font-bold text-slate-900 text-xs truncate" title={file.name}>
                                                {file.name}
                                            </p>
                                            <p className="text-[10px] text-slate-400 mt-0.5">
                                                Size: {file.sizeKB} KB • Created: {new Date(file.createdAt).toLocaleDateString()} {new Date(file.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2 flex-shrink-0 self-end sm:self-auto">
                                        <a
                                            href={`http://localhost:5000${file.docxUrl}`}
                                            download
                                            className="inline-flex items-center gap-1.5 bg-slate-800 hover:bg-slate-900 text-white px-3.5 py-2 rounded-xl text-xs font-bold transition-colors shadow-xs"
                                            title="Download Word Document (.docx)"
                                        >
                                            <Download size={13} /> .DOCX
                                        </a>
                                        {file.hasPdf && (
                                            <a
                                                href={`http://localhost:5000${file.pdfUrl}`}
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
                </div>
            )}
        </div>
    );
}
