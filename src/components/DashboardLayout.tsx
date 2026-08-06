import { Link, useLocation } from 'react-router-dom';
import { BarChart3, BookOpen, ChevronRight, LayoutDashboard, LogOut, Users } from 'lucide-react';
import BrandLogo from './BrandLogo';
import { useAuth } from '../context/AuthContext';
import { APP_ROLE_LABELS } from '../lib/profileDirectory';

interface Props {
  children: React.ReactNode;
  breadcrumbs?: { label: string; to?: string }[];
}

export default function DashboardLayout({ children, breadcrumbs }: Props) {
  const { user, profile, isAdmin, signOut } = useAuth();
  const location = useLocation();

  const displayName = String(profile?.full_name || '').trim() || 'Без имени';
  const displayEmail = String(profile?.email || user?.email || '').trim();
  const roleLabel = profile?.role ? APP_ROLE_LABELS[profile.role] : 'Пользователь';
  const avatarSeed = displayName !== 'Без имени' ? displayName : (displayEmail || roleLabel);
  const avatarText = avatarSeed.trim().charAt(0).toUpperCase() || '?';

  return (
    <div className="min-h-screen bg-gray-50 lg:flex">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-slate-900 text-gray-300 lg:flex">
        <div className="border-b border-slate-700/60 p-5">
          <div className="flex items-center gap-2.5">
            <BrandLogo variant="light" className="h-9 w-16 flex-shrink-0 object-contain" />
            <div>
              <div className="text-sm font-semibold leading-tight text-white">HSE Platform</div>
              <div className="text-xs leading-tight text-slate-400">Управление обучением</div>
            </div>
          </div>
        </div>

        <nav className="flex-1 space-y-1 p-3">
          <Link
            to="/dashboard"
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
              location.pathname === '/dashboard'
                ? 'bg-blue-600 text-white'
                : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <LayoutDashboard size={16} />
            Анкеты
          </Link>

          {isAdmin && (
            <Link
              to="/dashboard/analytics"
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
                location.pathname.startsWith('/dashboard/analytics')
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <BarChart3 size={16} />
              Аналитика
            </Link>
          )}

          {isAdmin && (
            <Link
              to="/dashboard/reference"
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
                location.pathname === '/dashboard/reference'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <BookOpen size={16} />
              Справочник
            </Link>
          )}

          {isAdmin && (
            <Link
              to="/dashboard/admin"
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
                location.pathname.startsWith('/dashboard/admin')
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Users size={16} />
              Пользователи
            </Link>
          )}
        </nav>

        <div className="border-t border-slate-700/60 px-3 pb-6 pt-4">
          <div className="rounded-2xl border border-slate-700 bg-slate-800/90 px-3.5 py-3.5 shadow-[0_10px_30px_rgba(15,23,42,0.35)]">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-cyan-400 text-xs font-semibold text-white shadow-sm">
                {avatarText}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold leading-5 text-white break-words whitespace-normal">
                      {displayName}
                    </div>
                  </div>
                  <div className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-white/10 text-white">
                    <ChevronRight size={14} />
                  </div>
                </div>

                <div className="mt-2 text-xs leading-5 text-slate-300 break-all">
                  {displayEmail || 'Email не указан'}
                </div>

                <div className="mt-2 inline-flex items-center rounded-full border border-slate-600 bg-slate-900/70 px-2.5 py-1 text-[11px] font-medium text-slate-200">
                  {roleLabel}
                </div>
              </div>
            </div>
          </div>

          <button
            onClick={signOut}
            className="mt-3 flex w-full items-center gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2.5 text-sm font-medium text-rose-100 transition-all hover:border-rose-400/45 hover:bg-rose-600/20 hover:text-white"
          >
            <LogOut size={16} />
            Выйти
          </button>
        </div>
      </aside>

      <div className="flex min-h-screen min-w-0 flex-1 flex-col lg:ml-64">
        <div className="sticky top-0 z-30 border-b border-slate-800 bg-slate-900 px-3 py-2.5 text-white lg:hidden">
          <div className="flex items-center justify-between gap-3">
            <Link to="/dashboard" className="flex min-w-0 items-center gap-2">
              <BrandLogo variant="light" className="h-8 w-14 flex-shrink-0 object-contain" />
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">HSE Platform</div>
                <div className="truncate text-[11px] text-slate-400">{roleLabel}</div>
              </div>
            </Link>
            <button
              onClick={signOut}
              className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-lg border border-rose-400/30 bg-rose-500/10 px-2.5 py-1.5 text-xs font-medium text-rose-100"
            >
              <LogOut size={14} />
              Выйти
            </button>
          </div>
          <nav className="mt-2 flex gap-1 overflow-x-auto pb-0.5">
            <Link
              to="/dashboard"
              className={`inline-flex flex-shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium ${
                location.pathname === '/dashboard' ? 'bg-blue-600 text-white' : 'bg-white/5 text-slate-200'
              }`}
            >
              <LayoutDashboard size={14} />
              Анкеты
            </Link>
            {isAdmin && (
              <Link
                to="/dashboard/analytics"
                className={`inline-flex flex-shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium ${
                  location.pathname.startsWith('/dashboard/analytics') ? 'bg-blue-600 text-white' : 'bg-white/5 text-slate-200'
                }`}
              >
                <BarChart3 size={14} />
                Аналитика
              </Link>
            )}
            {isAdmin && (
              <Link
                to="/dashboard/reference"
                className={`inline-flex flex-shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium ${
                  location.pathname === '/dashboard/reference' ? 'bg-blue-600 text-white' : 'bg-white/5 text-slate-200'
                }`}
              >
                <BookOpen size={14} />
                Справочник
              </Link>
            )}
            {isAdmin && (
              <Link
                to="/dashboard/admin"
                className={`inline-flex flex-shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium ${
                  location.pathname.startsWith('/dashboard/admin') ? 'bg-blue-600 text-white' : 'bg-white/5 text-slate-200'
                }`}
              >
                <Users size={14} />
                Пользователи
              </Link>
            )}
          </nav>
        </div>
        {breadcrumbs && breadcrumbs.length > 0 && (
          <header className="sticky top-[85px] z-20 border-b border-gray-200 bg-white px-3 py-3 lg:top-0 lg:px-8 lg:py-3.5">
            <nav className="flex items-center gap-1 overflow-x-auto whitespace-nowrap text-sm text-gray-500">
              {breadcrumbs.map((breadcrumb, index) => (
                <span key={index} className="flex items-center gap-1">
                  {index > 0 && <ChevronRight size={14} className="text-gray-300" />}
                  {breadcrumb.to ? (
                    <Link to={breadcrumb.to} className="transition-colors hover:text-blue-600">
                      {breadcrumb.label}
                    </Link>
                  ) : (
                    <span className={index === breadcrumbs.length - 1 ? 'font-medium text-gray-900' : ''}>
                      {breadcrumb.label}
                    </span>
                  )}
                </span>
              ))}
            </nav>
          </header>
        )}

        <main className="min-w-0 flex-1 p-3 sm:p-5 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
