import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import clsx from 'clsx';
import { Plus, Edit2, Trash2, FileCheck, Building2, X, AlertCircle, Tag, Lock, KeyRound, ShieldAlert, ArrowRight, Layers, Download } from 'lucide-react';
import { supabase } from '../supabase';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const fileToBase64 = (file) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => {
            const base64Data = reader.result.split(',')[1];
            resolve(`DATA:${file.name}:${base64Data}`);
        };
        reader.onerror = (error) => reject(error);
    });
};

const handleDownloadTemplate = (e, bank) => {
    if (!bank || !bank.template_path) return;
    if (bank.template_path.startsWith('DATA:')) {
        e.preventDefault();
        try {
            const parts = bank.template_path.slice(5).split(':');
            const originalName = parts.length > 1 ? parts[0] : `${bank.name}_Template.docx`;
            const base64Str = parts.length > 1 ? parts.slice(1).join(':') : parts[0];

            const byteCharacters = atob(base64Str);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            const blob = new Blob([byteArray], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });

            const safeName = bank.name.trim().replace(/[^a-zA-Z0-9_-]/g, '_');
            const downloadFilename = originalName.endsWith('.docx') ? originalName : `${safeName}_Template.docx`;

            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = downloadFilename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error('Error decoding Base64 template download:', err);
            alert('Failed to download template file');
        }
    }
};

export default function BankManager() {
    const [isAuthenticated, setIsAuthenticated] = useState(() => {
        return sessionStorage.getItem('bank_manager_auth') === 'true';
    });
    const [passwordInput, setPasswordInput] = useState('');
    const [authError, setAuthError] = useState('');

    const [banks, setBanks] = useState([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingBank, setEditingBank] = useState(null);
    const [formData, setFormData] = useState({ name: '', template: null, bill_split: 'bank' });
    const [pricingBank, setPricingBank] = useState(null);

    const handleAuthSubmit = (e) => {
        e.preventDefault();
        if (passwordInput === 'admin123') {
            sessionStorage.setItem('bank_manager_auth', 'true');
            setIsAuthenticated(true);
            setAuthError('');
            setPasswordInput('');
        } else {
            setAuthError('Incorrect password. Please enter the correct admin password.');
        }
    };

    const handleLock = () => {
        sessionStorage.removeItem('bank_manager_auth');
        setIsAuthenticated(false);
        setPasswordInput('');
        setAuthError('');
    };

    const handlePricingEdit = (bank) => {
        setPricingBank(bank);
    };

    const fetchBanks = async () => {
        // Try local Express API first
        try {
            const res = await axios.get(`${API_URL}/banks`);
            if (res.data && Array.isArray(res.data)) {
                setBanks(res.data);
                return;
            }
        } catch {
            console.log("Local API server unreachable, fallback to direct Supabase query...");
        }

        // Direct Supabase query fallback for remote/mobile devices
        try {
            const { data, error } = await supabase
                .from('banks')
                .select(`
                    id,
                    name,
                    template_path,
                    bill_split,
                    pricing (
                        category,
                        price,
                        column_key
                    )
                `);

            if (!error && data) {
                setBanks(data);
            } else {
                // Fallback if column_key/bill_split missing in Supabase schema
                const { data: fallbackData } = await supabase
                    .from('banks')
                    .select(`
                        id,
                        name,
                        template_path,
                        pricing (
                            category,
                            price
                        )
                    `);
                setBanks(fallbackData || []);
            }
        } catch (supaErr) {
            console.error('Error fetching banks from Supabase:', supaErr);
        }
    };

    useEffect(() => {
        if (isAuthenticated) {
            fetchBanks();
        }
    }, [isAuthenticated]);

    const handleSubmit = async (e) => {
        e.preventDefault();

        let templateDataString = null;
        if (formData.template) {
            try {
                templateDataString = await fileToBase64(formData.template);
            } catch (err) {
                console.error("Failed to convert template to Base64:", err);
            }
        }

        const data = new FormData();
        data.append('name', formData.name);
        data.append('bill_split', formData.bill_split || 'bank');
        if (formData.template) data.append('template', formData.template);
        if (templateDataString) data.append('template_data', templateDataString);

        try {
            if (editingBank) {
                await axios.put(`${API_URL}/banks/${editingBank.id}`, data);
            } else {
                await axios.post(`${API_URL}/banks`, data);
            }
            fetchBanks();
            setIsModalOpen(false);
            setEditingBank(null);
            setFormData({ name: '', template: null, bill_split: 'bank' });
            return;
        } catch {
            console.log("Local server submit failed, executing direct Supabase fallback...");
        }

        // Supabase direct fallback for creating/editing bank (Netlify & remote devices)
        try {
            const trimmedName = formData.name.trim();
            const splitMode = formData.bill_split || 'bank';

            const updatePayload = { name: trimmedName, bill_split: splitMode };
            if (templateDataString) {
                updatePayload.template_path = templateDataString;
            }

            if (editingBank) {
                const { error } = await supabase
                    .from('banks')
                    .update(updatePayload)
                    .eq('id', editingBank.id);
                if (error) throw error;
            } else {
                const { error } = await supabase
                    .from('banks')
                    .insert([updatePayload]);
                if (error) throw error;
            }

            fetchBanks();
            setIsModalOpen(false);
            setEditingBank(null);
            setFormData({ name: '', template: null, bill_split: 'bank' });
        } catch (supaErr) {
            alert(`Error saving bank: ${supaErr.message || 'Failed to save bank'}`);
            console.error(supaErr);
        }
    };

    const handleDelete = async (id) => {
        if (!confirm('Are you sure? This will delete all pricing configuration and bank settings.')) return;
        try {
            await axios.delete(`${API_URL}/banks/${id}`);
            fetchBanks();
            return;
        } catch {
            console.log("Local server delete failed, fallback to direct Supabase delete...");
        }

        try {
            await supabase.from('pricing').delete().eq('bank_id', id);
            await supabase.from('banks').delete().eq('id', id);
            fetchBanks();
        } catch (supaErr) {
            console.error('Supabase delete error:', supaErr);
            alert(`Failed to delete bank: ${supaErr.message}`);
        }
    };

    const getInitials = (name) => {
        if (!name) return 'BK';
        return name
            .split(' ')
            .map(n => n[0])
            .join('')
            .substring(0, 2)
            .toUpperCase();
    };

    // Render Password Gate if not authenticated
    if (!isAuthenticated) {
        return (
            <div className="min-h-[70vh] flex items-center justify-center p-4 animate-fade-in">
                <div className="bg-white p-8 rounded-3xl w-full max-w-md shadow-2xl border border-slate-200/80 text-center animate-slide-up relative overflow-hidden">
                    <div className="w-16 h-16 bg-amber-100 text-amber-800 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-amber-300/50 shadow-inner">
                        <Lock size={30} />
                    </div>
                    <h3 className="text-xl font-bold text-slate-900 tracking-tight">Restricted Access</h3>
                    <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto mb-6">
                        Bank Manager contains sensitive template and pricing configurations. Enter the admin password to proceed.
                    </p>

                    {authError && (
                        <div className="mb-4 bg-red-50 text-red-700 text-xs font-semibold p-3 rounded-2xl border border-red-200 flex items-center gap-2 text-left">
                            <ShieldAlert size={16} className="flex-shrink-0 text-red-600" />
                            <span>{authError}</span>
                        </div>
                    )}

                    <form onSubmit={handleAuthSubmit} className="space-y-4">
                        <div className="relative">
                            <input
                                type="password"
                                required
                                autoFocus
                                className="w-full border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 font-medium pl-10"
                                placeholder="Enter admin password..."
                                value={passwordInput}
                                onChange={e => setPasswordInput(e.target.value)}
                            />
                            <KeyRound size={18} className="absolute left-3.5 top-3.5 text-slate-400" />
                        </div>
                        <button
                            type="submit"
                            className="w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-bold px-5 py-3 rounded-2xl shadow-lg shadow-amber-500/25 flex items-center justify-center gap-2 text-xs transition-all duration-200 hover:scale-[1.01]"
                        >
                            Unlock Bank Manager <ArrowRight size={16} />
                        </button>
                    </form>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-8 pb-10">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <div className="flex items-center gap-2">
                        <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Bank Manager</h2>
                        <span className="bg-slate-200/80 text-slate-700 text-xs font-semibold px-2.5 py-0.5 rounded-full">
                            {banks.length} {banks.length === 1 ? 'Bank' : 'Banks'}
                        </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">Configure financial institutions, DOCX templates, bill looping structure, and service pricing</p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={handleLock}
                        className="bg-slate-100 hover:bg-slate-200 text-slate-600 px-3.5 py-2.5 rounded-2xl font-bold text-xs transition-colors flex items-center gap-1.5 border border-slate-200"
                        title="Lock Access"
                    >
                        <Lock size={15} /> Lock Access
                    </button>
                    <button
                        onClick={() => { setEditingBank(null); setFormData({ name: '', template: null, bill_split: 'bank' }); setIsModalOpen(true); }}
                        className="bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 px-5 py-2.5 rounded-2xl shadow-lg shadow-amber-500/25 flex items-center gap-2 font-bold text-xs transition-all duration-200 hover:scale-[1.02]"
                    >
                        <Plus size={16} /> Add Bank Institution
                    </button>
                </div>
            </div>

            {/* Table */}
            <div className="bg-white rounded-3xl shadow-sm border border-slate-200/80 overflow-hidden">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-slate-50/80 text-slate-400 uppercase text-[11px] font-bold tracking-wider border-b border-slate-100">
                            <th className="px-6 py-4">Bank Name</th>
                            <th className="px-6 py-4">DOCX Template & Loop Structure</th>
                            <th className="px-6 py-4">Category Pricing Structure</th>
                            <th className="px-6 py-4 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-sm">
                        {banks.map((bank) => (
                            <tr key={bank.id} className="hover:bg-slate-50/60 transition-colors group">
                                <td className="px-6 py-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-100 to-amber-200 text-amber-900 border border-amber-300/50 font-extrabold text-xs flex items-center justify-center shadow-inner">
                                            {getInitials(bank.name)}
                                        </div>
                                        <div>
                                            <div className="font-bold text-slate-900 text-sm">{bank.name}</div>
                                            <div className="text-[11px] text-slate-400">ID: bank_{bank.id}</div>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-6 py-4">
                                    <div className="flex flex-col gap-1.5 items-start">
                                        {bank.template_path ? (
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/80">
                                                    <FileCheck size={13} /> Active (.docx)
                                                </span>
                                                <a
                                                    href={`${API_URL}/banks/${bank.id}/template`}
                                                    download
                                                    onClick={(e) => handleDownloadTemplate(e, bank)}
                                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300/80 transition-colors shadow-xs"
                                                    title={`Download template for ${bank.name}`}
                                                >
                                                    <Download size={12} /> Download
                                                </a>
                                            </div>
                                        ) : (
                                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-red-50 text-red-600 border border-red-200/80">
                                                <AlertCircle size={13} /> Missing Template
                                            </span>
                                        )}
                                        <span className={clsx(
                                            "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-bold border",
                                            bank.bill_split === 'branch'
                                                ? "bg-amber-50 text-amber-800 border-amber-300"
                                                : "bg-slate-100 text-slate-600 border-slate-200"
                                        )}>
                                            <Layers size={11} /> {bank.bill_split === 'branch' ? 'Branch-wise Looping' : 'Bank-wise Flat Table'}
                                        </span>
                                    </div>
                                </td>
                                <td className="px-6 py-4">
                                    <div className="flex flex-wrap items-center gap-1.5">
                                        {bank.pricing && bank.pricing.length > 0 ? (
                                            bank.pricing.slice(0, 3).map((p, idx) => (
                                                <span key={idx} className="bg-slate-100 text-slate-700 px-2.5 py-1 rounded-lg text-xs font-medium border border-slate-200/80">
                                                    {p.category}: <strong className="text-amber-700 font-bold">₹{p.price}</strong>
                                                </span>
                                            ))
                                        ) : (
                                            <span className="text-slate-400 text-xs italic">No price rules set</span>
                                        )}
                                        {bank.pricing && bank.pricing.length > 3 && (
                                            <span className="bg-slate-100 text-slate-500 px-2 py-0.5 rounded-lg text-xs font-medium border border-slate-200">
                                                +{bank.pricing.length - 3} more
                                            </span>
                                        )}
                                    </div>
                                    <button
                                        className="text-amber-600 text-xs font-bold hover:text-amber-700 flex items-center gap-1 mt-1.5 opacity-90 hover:underline"
                                        onClick={() => handlePricingEdit(bank)}
                                    >
                                        <Tag size={12} /> Manage Pricing Rules
                                    </button>
                                </td>
                                <td className="px-6 py-4 text-right">
                                    <div className="flex items-center justify-end gap-1">
                                        {bank.template_path && (
                                            <a
                                                href={`${API_URL}/banks/${bank.id}/template`}
                                                download
                                                onClick={(e) => handleDownloadTemplate(e, bank)}
                                                className="p-2 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-xl transition-colors"
                                                title="Download DOCX Template"
                                            >
                                                <Download size={16} />
                                            </a>
                                        )}
                                        <button
                                            onClick={() => {
                                                setEditingBank(bank);
                                                setFormData({ name: bank.name, template: null, bill_split: bank.bill_split || 'bank' });
                                                setIsModalOpen(true);
                                            }}
                                            className="p-2 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-xl transition-colors"
                                            title="Edit Bank & Template"
                                        >
                                            <Edit2 size={16} />
                                        </button>
                                        <button
                                            onClick={() => handleDelete(bank.id)}
                                            className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors"
                                            title="Delete Bank"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                        {banks.length === 0 && (
                            <tr>
                                <td colSpan="4" className="px-6 py-16 text-center text-slate-400">
                                    <Building2 size={36} className="mx-auto mb-2 text-slate-300" />
                                    <p className="font-semibold text-slate-600">No Banks Added Yet</p>
                                    <p className="text-xs text-slate-400 mt-1">Click "Add Bank Institution" above to get started.</p>
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Add / Edit Bank Modal */}
            {isModalOpen && createPortal(
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[9999] animate-fade-in p-4 overflow-y-auto">
                    <div className="bg-white p-6 sm:p-7 rounded-3xl w-full max-w-md shadow-2xl border border-slate-100 transform transition-all animate-slide-up max-h-[90vh] flex flex-col my-auto">
                        <div className="flex items-center justify-between pb-4 border-b border-slate-100 flex-shrink-0">
                            <div>
                                <h3 className="text-lg sm:text-xl font-bold text-slate-900">
                                    {editingBank ? 'Edit Bank Institution' : 'Add Bank Institution'}
                                </h3>
                                <p className="text-xs text-slate-500 mt-0.5">Define institution name, template & bill split mode</p>
                            </div>
                            <button
                                onClick={() => setIsModalOpen(false)}
                                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors flex-shrink-0"
                            >
                                <X size={16} />
                            </button>
                        </div>
                        <form onSubmit={handleSubmit} className="space-y-4 pt-4 overflow-y-auto flex-1 pr-1">
                            <div>
                                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                                    Bank Name
                                </label>
                                <input
                                    type="text"
                                    required
                                    className="w-full border border-slate-200 rounded-2xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all font-medium"
                                    placeholder="e.g. ICICI KCC or State Bank of India"
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                />
                            </div>

                            {/* Bill Split Mode Option */}
                            <div>
                                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                                    Bill Looping & Split Mode
                                </label>
                                <div className="grid grid-cols-2 gap-2.5">
                                    <button
                                        type="button"
                                        onClick={() => setFormData({ ...formData, bill_split: 'bank' })}
                                        className={clsx(
                                            "p-3 rounded-2xl border text-left transition-all flex flex-col justify-between cursor-pointer",
                                            (formData.bill_split || 'bank') === 'bank'
                                                ? "border-amber-500 bg-amber-50/60 ring-2 ring-amber-500/20 text-slate-900"
                                                : "border-slate-200 bg-slate-50/50 hover:bg-slate-100/60 text-slate-600"
                                        )}
                                    >
                                        <div className="font-bold text-xs flex items-center gap-1.5 mb-1">
                                            <span className={clsx("w-2 h-2 rounded-full flex-shrink-0", (formData.bill_split || 'bank') === 'bank' ? "bg-amber-500" : "bg-slate-300")} />
                                            Bank-wise
                                        </div>
                                        <p className="text-[10px] text-slate-500 leading-tight">
                                            Single table containing all records (<code className="text-amber-800 font-mono">{`{#opinions}`}</code>).
                                        </p>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => setFormData({ ...formData, bill_split: 'branch' })}
                                        className={clsx(
                                            "p-3 rounded-2xl border text-left transition-all flex flex-col justify-between cursor-pointer",
                                            formData.bill_split === 'branch'
                                                ? "border-amber-500 bg-amber-50/60 ring-2 ring-amber-500/20 text-slate-900"
                                                : "border-slate-200 bg-slate-50/50 hover:bg-slate-100/60 text-slate-600"
                                        )}
                                    >
                                        <div className="font-bold text-xs flex items-center gap-1.5 mb-1">
                                            <span className={clsx("w-2 h-2 rounded-full flex-shrink-0", formData.bill_split === 'branch' ? "bg-amber-500" : "bg-slate-300")} />
                                            Branch-wise
                                        </div>
                                        <p className="text-[10px] text-slate-500 leading-tight">
                                            Separate section per branch (<code className="text-amber-800 font-mono">{`{#branches}`}</code>).
                                        </p>
                                    </button>
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                                    DOCX Bill Template
                                </label>
                                <div className="border-2 border-dashed border-slate-200 rounded-2xl p-3.5 bg-slate-50/50 hover:bg-slate-50 transition-colors">
                                    <input
                                        type="file"
                                        accept=".docx"
                                        className="w-full text-xs text-slate-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-amber-100 file:text-amber-900 hover:file:bg-amber-200 cursor-pointer"
                                        onChange={e => setFormData({ ...formData, template: e.target.files[0] })}
                                    />
                                    {editingBank ? (
                                        <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-200/60">
                                            <p className="text-[11px] text-slate-400">Leave empty to keep existing template</p>
                                            {editingBank.template_path && (
                                                <a
                                                    href={`${API_URL}/banks/${editingBank.id}/template`}
                                                    download
                                                    onClick={(e) => handleDownloadTemplate(e, editingBank)}
                                                    className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 hover:text-amber-800 hover:underline"
                                                >
                                                    <Download size={12} /> Download Current
                                                </a>
                                            )}
                                        </div>
                                    ) : (
                                        <p className="text-[11px] text-slate-400 mt-1.5">Upload .docx template file containing replacement tags</p>
                                    )}
                                </div>
                            </div>
                            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 flex-shrink-0">
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-bold text-xs px-5 py-2.5 rounded-xl shadow-md shadow-amber-500/20 transition-all cursor-pointer"
                                >
                                    {editingBank ? 'Update Bank Institution' : 'Save Bank Institution'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>,
                document.body
            )}

            {/* Side Drawer Pricing Modal */}
            <PricingModal
                isOpen={!!pricingBank}
                onClose={() => setPricingBank(null)}
                bank={pricingBank}
                onSave={fetchBanks}
            />
        </div>
    );
}

function PricingModal({ isOpen, onClose, bank, onSave }) {
    const [category, setCategory] = useState('');
    const [price, setPrice] = useState('');
    const [columnKey, setColumnKey] = useState('');
    const [editingCategory, setEditingCategory] = useState(null);
    const [localPricing, setLocalPricing] = useState(bank?.pricing || []);

    useEffect(() => {
        setLocalPricing(bank?.pricing || []);
    }, [bank]);

    if (!isOpen || !bank) return null;

    const handleSavePricing = async (e) => {
        e.preventDefault();
        if (!category.trim() || price === '') return;

        let success = false;
        try {
            if (editingCategory && editingCategory !== category.trim()) {
                await axios.delete(`${API_URL}/banks/${bank.id}/pricing`, {
                    params: { category: editingCategory },
                    data: { category: editingCategory }
                });
            }

            await axios.post(`${API_URL}/banks/${bank.id}/pricing`, {
                category: category.trim(),
                price: parseFloat(price),
                column_key: columnKey.trim() || undefined
            });
            success = true;
        } catch {
            console.log("Local server pricing save failed, attempting Supabase direct upsert...");
            try {
                if (editingCategory && editingCategory !== category.trim()) {
                    await supabase
                        .from('pricing')
                        .delete()
                        .eq('bank_id', bank.id)
                        .ilike('category', editingCategory);
                }

                const payload = {
                    bank_id: bank.id,
                    category: category.trim(),
                    price: parseFloat(price)
                };
                if (columnKey.trim()) payload.column_key = columnKey.trim();

                const { error: supaErr } = await supabase
                    .from('pricing')
                    .upsert(payload, { onConflict: 'bank_id, category' });

                if (supaErr) throw supaErr;
                success = true;
            } catch (supaErr) {
                console.error('Error saving pricing via Supabase:', supaErr);
                alert(`Failed to save pricing entry: ${supaErr.message}`);
                return;
            }
        }

        if (success) {
            const updated = localPricing.filter(p => p.category !== editingCategory && p.category !== category.trim());
            updated.push({
                category: category.trim(),
                price: parseFloat(price),
                column_key: columnKey.trim() || undefined
            });
            setLocalPricing(updated);

            setCategory('');
            setPrice('');
            setColumnKey('');
            setEditingCategory(null);
            onSave();
        }
    };

    const handleEditItem = (item) => {
        setEditingCategory(item.category);
        setCategory(item.category);
        setPrice(item.price);
        setColumnKey(item.column_key || '');
    };

    const handleDeleteItem = async (categoryToDelete) => {
        if (!confirm(`Delete pricing for "${categoryToDelete}"?`)) return;
        let success = false;
        try {
            await axios.delete(`${API_URL}/banks/${bank.id}/pricing`, {
                params: { category: categoryToDelete },
                data: { category: categoryToDelete }
            });
            success = true;
        } catch {
            console.log("Local delete pricing failed, attempting Supabase direct delete...");
            try {
                const { error: supaErr } = await supabase
                    .from('pricing')
                    .delete()
                    .eq('bank_id', bank.id)
                    .ilike('category', categoryToDelete);
                if (supaErr) throw supaErr;
                success = true;
            } catch (supaErr) {
                console.error('Error deleting pricing entry via Supabase:', supaErr);
                alert(`Failed to delete pricing entry: ${supaErr.message}`);
                return;
            }
        }

        if (success) {
            const updated = localPricing.filter(p => p.category !== categoryToDelete);
            setLocalPricing(updated);
            if (editingCategory === categoryToDelete) {
                setEditingCategory(null);
                setCategory('');
                setPrice('');
                setColumnKey('');
            }
            onSave();
        }
    };

    return createPortal(
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[9999] flex items-center justify-end animate-fade-in">
            <div className="bg-white h-full w-full max-w-md shadow-2xl p-8 flex flex-col justify-between overflow-y-auto animate-slide-up border-l border-slate-100">
                <div>
                    <div className="flex justify-between items-center pb-4 border-b border-slate-100 mb-6">
                        <div>
                            <div className="flex items-center gap-2">
                                <Tag className="text-amber-600" size={18} />
                                <h3 className="text-xl font-bold text-slate-900">Pricing Rules</h3>
                            </div>
                            <p className="text-xs text-slate-500 mt-1">Bank: <strong className="text-slate-800">{bank.name}</strong></p>
                        </div>
                        <button
                            onClick={onClose}
                            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors"
                        >
                            <X size={16} />
                        </button>
                    </div>

                    {/* Existing Rules List */}
                    <div className="mb-6">
                        <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-3">
                            Configured Services ({localPricing.length})
                        </label>
                        <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                            {localPricing && localPricing.length > 0 ? (
                                localPricing.map((p, i) => (
                                    <div
                                        key={i}
                                        className={`flex items-center justify-between p-3 rounded-2xl border transition-all ${
                                            editingCategory === p.category
                                                ? 'bg-amber-50 text-amber-900 border-amber-300 ring-2 ring-amber-500/20'
                                                : 'bg-slate-50 text-slate-800 border-slate-200/80 hover:border-slate-300'
                                        }`}
                                    >
                                        <div className="text-xs font-semibold">
                                            <span>{p.category}</span>
                                            {p.column_key && (
                                                <span className="ml-2 text-[10px] bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded font-mono">
                                                    {`{${p.column_key}}`}
                                                </span>
                                            )}
                                            <div className="text-amber-700 font-extrabold text-sm mt-0.5">₹{p.price}</div>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <button
                                                type="button"
                                                onClick={() => handleEditItem(p)}
                                                className="p-1.5 text-slate-400 hover:text-amber-600 rounded-lg transition-colors"
                                                title="Edit price"
                                            >
                                                <Edit2 size={14} />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleDeleteItem(p.category)}
                                                className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg transition-colors"
                                                title="Delete price entry"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <p className="text-slate-400 text-xs italic py-4 text-center">No service pricing rules configured yet.</p>
                            )}
                        </div>
                    </div>
                </div>

                {/* Form at bottom */}
                <form onSubmit={handleSavePricing} className="space-y-3 pt-4 border-t border-slate-100">
                    <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                        {editingCategory ? `Editing "${editingCategory}"` : 'Add New Category Price'}
                    </label>

                    <div className="space-y-2">
                        <input
                            type="text"
                            placeholder="Category (e.g. sro ec, vetting report)"
                            className="w-full border border-slate-200 rounded-2xl px-4 py-2.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                            value={category}
                            onChange={e => setCategory(e.target.value)}
                            required
                        />
                        <input
                            type="text"
                            placeholder="Column Tag (e.g. SRO_EC, Opinion_Fees)"
                            className="w-full border border-slate-200 rounded-2xl px-4 py-2.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                            value={columnKey}
                            onChange={e => setColumnKey(e.target.value)}
                        />
                        <div className="flex gap-2">
                            <input
                                type="number"
                                placeholder="Price in ₹"
                                className="flex-1 border border-slate-200 rounded-2xl px-4 py-2.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                                value={price}
                                onChange={e => setPrice(e.target.value)}
                                required
                            />
                            <button
                                type="submit"
                                className="px-5 py-2.5 rounded-2xl text-slate-950 font-bold text-xs bg-amber-500 hover:bg-amber-600 transition-all shadow-md"
                            >
                                {editingCategory ? 'Update' : 'Add Price'}
                            </button>
                        </div>
                    </div>
                </form>
            </div>
        </div>,
        document.body
    );
}
