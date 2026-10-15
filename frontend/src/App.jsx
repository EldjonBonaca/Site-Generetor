import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Bot, FolderKanban, Images, LayoutTemplate, Languages, LogOut, UserRound } from 'lucide-react';
import { api } from './api.js';
import { useT, LOCALES } from './i18n/index.jsx';
import { cx } from './components/ui.jsx';
import { ErrorBoundary } from './components/ErrorBoundary.jsx';
import ProjectsPage from './pages/ProjectsPage.jsx';
import ProjectWizard from './pages/ProjectWizard.jsx';
import TemplatesPage from './pages/TemplatesPage.jsx';
import GalleryPage from './pages/GalleryPage.jsx';
import ProvidersPage from './pages/ProvidersPage.jsx';

/** Logged-in user + logout (nothing when the login is disabled, e.g. local use). */
function UserMenu() {
  const { t } = useT();
  const [me, setMe] = useState(null);
  useEffect(() => {
    api.get('/me').then(setMe).catch(() => {});
  }, []);
  if (!me?.auth) return null;
  const logout = async () => {
    try {
      await api.post('/logout');
    } finally {
      window.location.href = '/login';
    }
  };
  return (
    <div className="flex items-center gap-2 border-l border-slate-200 pl-4">
      <span className="hidden items-center gap-1.5 text-sm font-medium text-slate-700 sm:inline-flex">
        <UserRound className="size-4 text-slate-400" />
        {me.user}
      </span>
      <button type="button" onClick={logout} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100" title={t('Log out')}>
        <LogOut className="size-4" />
        <span className="hidden md:inline">{t('Log out')}</span>
      </button>
    </div>
  );
}

export default function App() {
  const { t, locale, setLocale } = useT();
  const { pathname } = useLocation();
  const nav = [
    { to: '/projects', label: t('Projects'), icon: FolderKanban },
    { to: '/gallery', label: t('Gallery'), icon: Images },
    { to: '/templates', label: t('Templates'), icon: LayoutTemplate },
    { to: '/settings/providers', label: t('AI Providers'), icon: Bot },
  ];

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-4 sm:px-6">
          <nav className="flex flex-1 items-center gap-1 overflow-x-auto">
            {nav.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  cx('inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap', isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100')
                }
              >
                <Icon className="size-4" />
                <span className="hidden md:inline">{label}</span>
              </NavLink>
            ))}
          </nav>
          <label className="flex items-center gap-1.5 text-slate-500" title={t('Interface language')}>
            <Languages className="size-4" />
            <select value={locale} onChange={(e) => setLocale(e.target.value)} className="bg-transparent text-sm focus:outline-none">
              {Object.entries(LOCALES).map(([code, l]) => (
                <option key={code} value={code}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
          <UserMenu />
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <ErrorBoundary t={t} resetKey={pathname}>
          <Routes>
            <Route path="/" element={<Navigate to="/projects" replace />} />
            <Route path="/projects" element={<ProjectsPage />} />
            <Route path="/projects/:id/*" element={<ProjectWizard />} />
            <Route path="/gallery" element={<GalleryPage />} />
            <Route path="/templates" element={<TemplatesPage />} />
            <Route path="/settings/providers" element={<ProvidersPage />} />
            <Route path="*" element={<Navigate to="/projects" replace />} />
          </Routes>
        </ErrorBoundary>
      </main>
    </div>
  );
}
