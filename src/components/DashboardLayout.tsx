import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, LogOut, Shield, ChevronRight, BookOpen } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface Props {
  children: React.ReactNode;
  breadcrumbs?: { label: string; to?: string }[];
}

export default function DashboardLayout({ children, breadcrumbs }: Props) {
  const { user, signOut } = useAuth();
  const location = useLocation();

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <aside className="w-60 bg-slate-900 text-gray-300 flex flex-col fixed inset-y-0 left-0 z-30">
        <div className="p-5 border-b border-slate-700/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
              <Shield size={16} className="text-white" />
            </div>
            <div>
              <div className="text-white font-semibold text-sm leading-tight">HSE Platform</div>
              <div className="text-xs text-slate-400 leading-tight">Управление обучением</div>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          <Link
            to="/dashboard"
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
              location.pathname === '/dashboard'
                ? 'bg-blue-600 text-white'
                : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <LayoutDashboard size={16} />
            Анкеты
          </Link>
          <Link
            to="/dashboard/reference"
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
              location.pathname === '/dashboard/reference'
                ? 'bg-blue-600 text-white'
                : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <BookOpen size={16} />
            Справочник
          </Link>
        </nav>

        <div className="p-3 border-t border-slate-700/60">
          <div className="px-3 py-2 mb-1">
            <div className="text-xs text-slate-500 truncate">{user?.email}</div>
          </div>
          <button
            onClick={signOut}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-slate-400 hover:bg-slate-800 hover:text-white transition-all"
          >
            <LogOut size={16} />
            Выйти
          </button>
        </div>
      </aside>

      <div className="flex-1 ml-60 flex flex-col min-h-screen">
        {breadcrumbs && breadcrumbs.length > 0 && (
          <header className="bg-white border-b border-gray-200 px-8 py-3.5 sticky top-0 z-20">
            <nav className="flex items-center gap-1 text-sm text-gray-500">
              {breadcrumbs.map((b, i) => (
                <span key={i} className="flex items-center gap-1">
                  {i > 0 && <ChevronRight size={14} className="text-gray-300" />}
                  {b.to ? (
                    <Link to={b.to} className="hover:text-blue-600 transition-colors">{b.label}</Link>
                  ) : (
                    <span className={i === breadcrumbs.length - 1 ? 'text-gray-900 font-medium' : ''}>{b.label}</span>
                  )}
                </span>
              ))}
            </nav>
          </header>
        )}
        <main className="flex-1 p-8">{children}</main>
      </div>
    </div>
  );
}
