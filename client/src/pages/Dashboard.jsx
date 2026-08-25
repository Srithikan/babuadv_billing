import { useEffect, useState } from 'react';
import axios from 'axios';
import { Building2, FileCheck, ArrowUpRight, Upload, CheckCircle2, TrendingUp } from 'lucide-react';
import { Link } from 'react-router-dom';

const API_URL = 'http://localhost:5000/api';

export default function Dashboard() {
    const [stats, setStats] = useState({ banks: 0, bills: 0 });
    const [recentBills, setRecentBills] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        axios.get(`${API_URL}/banks`)
            .then(res => {
                setStats(s => ({ ...s, banks: res.data.length }));
                setLoading(false);
            })
            .catch(err => {
                console.error(err);
                setLoading(false);
            });
    }, []);

    const todayStr = new Date().toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });

    return (
        <div className="space-y-8 pb-10">
            {/* Clean Light Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200/80">
                <div>
                    <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Dashboard Overview</h2>
                    <p className="text-xs text-slate-500 mt-1">Welcome back, Advocate • <span className="font-semibold text-slate-700">{todayStr}</span></p>
                </div>
                <Link
                    to="/billing"
                    className="inline-flex items-center gap-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-bold px-5 py-2.5 rounded-2xl shadow-lg shadow-amber-500/20 transition-all duration-200 hover:scale-[1.01] text-xs"
                >
                    <Upload size={15} /> Start Billing Process
                </Link>
            </div>

            {/* 3 Stat Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Active Banks Card */}
                <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm hover:shadow-md transition-all duration-200 group relative overflow-hidden">
                    <div className="flex items-center justify-between mb-4">
                        <div className="p-3 bg-amber-50 text-amber-600 rounded-2xl group-hover:bg-amber-100 transition-colors border border-amber-100">
                            <Building2 size={22} />
                        </div>
                        <span className="text-xs font-semibold px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                            <CheckCircle2 size={12} /> Active
                        </span>
                    </div>
                    <div>
                        <p className="text-3xl font-extrabold text-slate-900 tracking-tight">{stats.banks}</p>
                        <p className="text-xs font-semibold text-slate-500 mt-1">Registered Banks</p>
                    </div>
                    <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
                        <span>Configured templates</span>
                        <Link to="/banks" className="text-amber-600 hover:text-amber-700 font-semibold flex items-center gap-0.5">
                            Manage Banks <ArrowUpRight size={12} />
                        </Link>
                    </div>
                </div>

                {/* Bills Generated Card */}
                <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm hover:shadow-md transition-all duration-200 group relative overflow-hidden">
                    <div className="flex items-center justify-between mb-4">
                        <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl group-hover:bg-emerald-100 transition-colors border border-emerald-100">
                            <FileCheck size={22} />
                        </div>
                        <span className="text-xs font-semibold px-2.5 py-1 rounded-md bg-slate-100 text-slate-600 border border-slate-200 flex items-center gap-1">
                            <TrendingUp size={12} /> Live
                        </span>
                    </div>
                    <div>
                        <p className="text-3xl font-extrabold text-slate-900 tracking-tight">{stats.bills}</p>
                        <p className="text-xs font-semibold text-slate-500 mt-1">Bills Generated Today</p>
                    </div>
                    <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
                        <span>Auto-merged properties</span>
                        <span className="text-emerald-600 font-semibold">+100% Validated</span>
                    </div>
                </div>

                {/* Revenue Tracking Card */}
                <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm hover:shadow-md transition-all duration-200 group relative overflow-hidden">
                    <div className="flex items-center justify-between mb-4">
                        <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl group-hover:bg-blue-100 transition-colors border border-blue-100">
                            <span className="font-extrabold text-base">₹</span>
                        </div>
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
                            Automated
                        </span>
                    </div>
                    <div>
                        <p className="text-3xl font-extrabold text-slate-900 tracking-tight">₹ --</p>
                        <p className="text-xs font-semibold text-slate-500 mt-1">Calculated Fee Revenue</p>
                    </div>
                    <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
                        <span>Based on category pricing</span>
                        <span className="text-slate-500 font-medium">Per CSV Batch</span>
                    </div>
                </div>
            </div>

            {/* Recent Billing Activity Section */}
            <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                    <div>
                        <h3 className="text-lg font-bold text-slate-900 tracking-tight">Recent Billing Activity</h3>
                        <p className="text-xs text-slate-500">Overview of generated legal opinion bills</p>
                    </div>
                    <Link to="/billing" className="text-xs font-bold text-amber-600 hover:text-amber-700 flex items-center gap-1">
                        Go to Generator <ArrowUpRight size={14} />
                    </Link>
                </div>

                {recentBills.length === 0 ? (
                    <div className="py-16 px-6 text-center flex flex-col items-center justify-center">
                        <div className="w-16 h-16 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center mb-4 border border-amber-100 shadow-sm">
                            <FileCheck size={30} />
                        </div>
                        <h4 className="text-slate-900 font-bold text-base mb-1">No Recent Batch Run</h4>
                        <p className="text-slate-500 text-xs max-w-sm mx-auto mb-6">
                            Upload your client CSV/Excel file to automatically compute pricing, combine multi-property opinions, and export DOCX bills.
                        </p>
                        <Link
                            to="/billing"
                            className="inline-flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs px-5 py-2.5 rounded-xl shadow-md transition-all"
                        >
                            <Upload size={14} /> Upload Billing File
                        </Link>
                    </div>
                ) : (
                    <div className="divide-y divide-slate-100">
                        {/* If recent bills exist, show clean rows */}
                    </div>
                )}
            </div>
        </div>
    );
}
