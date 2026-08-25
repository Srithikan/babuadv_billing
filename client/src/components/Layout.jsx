import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Building2, FileText, Scale, ShieldCheck, ChevronRight, PanelLeftClose, PanelLeft, FolderOpen } from 'lucide-react';
import clsx from 'clsx';

const Sidebar = ({ isOpen, onToggle }) => {
    const location = useLocation();

    const links = [
        { href: '/', label: 'Dashboard', icon: LayoutDashboard, badge: null },
        { href: '/banks', label: 'Bank Manager', icon: Building2, badge: null },
        { href: '/billing', label: 'Billing Process', icon: FileText, badge: 'Batch' },
        { href: '/library', label: 'File Library', icon: FolderOpen, badge: 'Archive' },
    ];

    return (
        <aside
            className={clsx(
                "bg-white min-h-screen flex flex-col justify-between border-r border-slate-200/80 shadow-xs z-50 select-none transition-all duration-300 ease-in-out overflow-hidden flex-shrink-0",
                isOpen ? "w-72" : "w-20"
            )}
        >
            <div>
                {/* Brand Header */}
                <div className="p-5 border-b border-slate-100 flex items-center justify-between">
                    <div className="flex items-center gap-3 overflow-hidden">
                        <div className="bg-amber-100 text-amber-900 border border-amber-300/50 p-2.5 rounded-xl shadow-xs flex items-center justify-center flex-shrink-0">
                            <Scale size={22} className="stroke-[2.2]" />
                        </div>
                        {isOpen && (
                            <div className="animate-fade-in overflow-hidden whitespace-nowrap">
                                <h1 className="text-base font-extrabold text-slate-900 tracking-tight leading-tight">Babu Advocate</h1>
                                <p className="text-[10px] text-amber-700 font-bold tracking-wide uppercase">Billing System</p>
                            </div>
                        )}
                    </div>
                    {isOpen && (
                        <button
                            onClick={onToggle}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors hidden md:block"
                            title="Collapse Menu"
                        >
                            <PanelLeftClose size={18} />
                        </button>
                    )}
                </div>

                {/* Navigation Links */}
                <nav className="p-3 space-y-1.5 mt-2">
                    {isOpen && (
                        <p className="px-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 animate-fade-in">
                            Main Menu
                        </p>
                    )}
                    {links.map((link) => {
                        const Icon = link.icon;
                        const isActive = location.pathname === link.href;
                        return (
                            <Link
                                key={link.href}
                                to={link.href}
                                title={!isOpen ? link.label : undefined}
                                className={clsx(
                                    "relative flex items-center px-3.5 py-3 rounded-xl text-sm font-medium transition-all duration-200 group",
                                    isOpen ? "justify-between" : "justify-center",
                                    isActive
                                        ? "bg-amber-50 text-amber-900 border border-amber-300/80 font-bold shadow-xs"
                                        : "text-slate-600 hover:bg-slate-100/80 hover:text-slate-900"
                                )}
                            >
                                {isActive && (
                                    <span className="absolute left-0 top-2 bottom-2 w-1 bg-amber-500 rounded-r-full shadow-xs" />
                                )}
                                <div className="flex items-center gap-3.5">
                                    <Icon size={20} className={clsx("transition-transform duration-200 flex-shrink-0", isActive ? "text-amber-600 scale-110" : "text-slate-400 group-hover:scale-105 group-hover:text-slate-700")} />
                                    {isOpen && <span className="animate-fade-in whitespace-nowrap">{link.label}</span>}
                                </div>
                                {isOpen && link.badge && (
                                    <span className={clsx(
                                        "text-[10px] font-bold px-2 py-0.5 rounded-md border animate-fade-in",
                                        isActive
                                            ? "bg-amber-200/60 text-amber-900 border-amber-300"
                                            : "bg-slate-100 text-slate-500 border-slate-200"
                                    )}>
                                        {link.badge}
                                    </span>
                                )}
                                {isOpen && !link.badge && (
                                    <ChevronRight size={15} className={clsx("transition-transform opacity-0 group-hover:opacity-100", isActive ? "opacity-100 text-amber-600" : "text-slate-400")} />
                                )}
                            </Link>
                        )
                    })}
                </nav>
            </div>

            {/* Bottom Status */}
            <div className="p-3 border-t border-slate-100">
                <div className={clsx("bg-slate-50 border border-slate-200/80 rounded-xl p-3 flex items-center", isOpen ? "justify-between" : "justify-center")}>
                    <div className="flex items-center gap-2.5">
                        <div className="relative flex h-2.5 w-2.5 flex-shrink-0">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                        </div>
                        {isOpen && (
                            <div className="animate-fade-in whitespace-nowrap overflow-hidden">
                                <p className="text-xs font-bold text-slate-800">System Ready</p>
                                <p className="text-[10px] text-slate-400">Automated DOCX Engine</p>
                            </div>
                        )}
                    </div>
                    {isOpen && <ShieldCheck size={16} className="text-slate-400 flex-shrink-0" />}
                </div>
            </div>
        </aside>
    );
};

export default function Layout({ children }) {
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);

    const toggleSidebar = () => {
        setIsSidebarOpen(prev => !prev);
    };

    return (
        <div className="flex bg-[#F8FAFC] min-h-screen font-sans text-slate-900 antialiased">
            <Sidebar isOpen={isSidebarOpen} onToggle={toggleSidebar} />
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
                {/* Topbar */}
                <header className="h-16 bg-white border-b border-slate-200/80 px-6 flex items-center justify-between shadow-xs sticky top-0 z-40">
                    <div className="flex items-center gap-3 text-xs font-medium text-slate-500">
                        <button
                            onClick={toggleSidebar}
                            className="p-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors flex items-center gap-2 font-semibold text-xs border border-slate-200/80 shadow-xs"
                            title={isSidebarOpen ? "Close Menu" : "Open Menu"}
                        >
                            {isSidebarOpen ? <PanelLeftClose size={18} /> : <PanelLeft size={18} />}
                            <span className="hidden sm:inline">{isSidebarOpen ? "Hide Menu" : "Show Menu"}</span>
                        </button>
                        <span className="text-slate-300">|</span>
                        <span>Legal Automation Suite</span>
                        <span className="hidden sm:inline">/</span>
                        <span className="text-slate-800 font-semibold hidden sm:inline">Babu Advocate Billing</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-amber-100 text-amber-800 border border-amber-300/60 font-bold text-xs flex items-center justify-center shadow-inner">
                            BA
                        </div>
                        <div className="text-left hidden sm:block">
                            <p className="text-xs font-semibold text-slate-800 leading-tight">Advocate Office</p>
                            <p className="text-[10px] text-slate-400">Madurai Jurisdiction</p>
                        </div>
                    </div>
                </header>

                {/* Main View Area */}
                <main className="flex-1 p-6 md:p-10 overflow-y-auto">
                    <div className="max-w-7xl mx-auto animate-slide-up">
                        {children}
                    </div>
                </main>
            </div>
        </div>
    );
}
