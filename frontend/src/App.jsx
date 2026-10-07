import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { Bot, FolderKanban, Images, LayoutTemplate, Languages } from 'lucide-react';
import { useT, LOCALES } from './i18n/index.jsx';
import { cx } from './components/ui.jsx';
import ProjectsPage from './pages/ProjectsPage.jsx';
import ProjectWizard from './pages/ProjectWizard.jsx';
import KitsPage from './pages/KitsPage.jsx';
import GalleryPage from './pages/GalleryPage.jsx';
import ProvidersPage from './pages/ProvidersPage.jsx';

export default function App() {
  const { t, locale, setLocale } = useT();
  const nav = [
    { to: '/projects', label: t('Projects'), icon: FolderKanban },
    { to: '/gallery', label: t('Gallery'), icon: Images },
    { to: '/kits', label: t('Template Kits'), icon: LayoutTemplate },
    { to: '/settings/providers', label: t('AI Providers'), icon: Bot },
  ];

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-4 sm:px-6">
          <NavLink to="/projects" className="flex items-center gap-2 font-semibold text-slate-900">
            <span className="flex size-7 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">E</span>
            <span className="hidden sm:inline">Site Generator</span>
          </NavLink>
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
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <Routes>
          <Route path="/" element={<Navigate to="/projects" replace />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/projects/:id/*" element={<ProjectWizard />} />
          <Route path="/gallery" element={<GalleryPage />} />
          <Route path="/kits" element={<KitsPage />} />
          <Route path="/settings/providers" element={<ProvidersPage />} />
          <Route path="*" element={<Navigate to="/projects" replace />} />
        </Routes>
      </main>
    </div>
  );
}
