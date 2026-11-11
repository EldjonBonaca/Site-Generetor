import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { Bot, ChevronDown, Code2, FolderKanban, Globe, Images, LayoutTemplate, Languages, LogOut, Package, Plug, Settings, UserRound } from 'lucide-react';
import { api } from './api.js';
import { useT, LOCALES } from './i18n/index.jsx';
import { cx } from './components/ui.jsx';
import { SECTIONS, SECTION_LABELS, useSection } from './section.js';
import { ErrorBoundary } from './components/ErrorBoundary.jsx';
import { SessionTimer } from './components/SessionTimer.jsx';
import ProjectsPage from './pages/ProjectsPage.jsx';
import ProjectWizard from './pages/ProjectWizard.jsx';
import TemplatesPage from './pages/TemplatesPage.jsx';
import TemplateKitsPage from './pages/TemplateKitsPage.jsx';
import FromSitePage from './pages/FromSitePage.jsx';
import PluginsPage from './pages/PluginsPage.jsx';
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
    <div className="flex shrink-0 items-center gap-1 border-l border-slate-200 pl-3">
      <span className="hidden items-center gap-1.5 text-sm font-medium text-slate-700 sm:inline-flex" title={me.user}>
        <UserRound className="size-4 shrink-0 text-slate-400" />
        <span className="max-w-24 truncate">{me.user}</span>
      </span>
      <button type="button" onClick={logout} className="inline-flex items-center gap-1.5 rounded-lg p-2 text-sm font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700" title={t('Log out')} aria-label={t('Log out')}>
        <LogOut className="size-4" />
      </button>
    </div>
  );
}

/** Settings of the app (AI providers, bundled plugins): a small menu at the right of the header. */
function SettingsMenu({ items, active, t }) {
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const outside = (e) => {
      if (!box.current?.contains(e.target)) setOpen(false);
    };
    const esc = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', outside);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', outside);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);
  return (
    <div className="relative shrink-0" ref={box}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={t('Settings')}
        className={cx('inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium whitespace-nowrap', active || open ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100')}
      >
        <Settings className="size-4 shrink-0" />
        <span className="hidden xl:inline">{t('Settings')}</span>
        <ChevronDown className={cx('size-3.5 shrink-0 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-40 mt-2 w-56 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
          {items.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              role="menuitem"
              onClick={() => setOpen(false)}
              className={({ isActive }) => cx('flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium', isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-700 hover:bg-slate-100')}
            >
              <Icon className="size-4 shrink-0" />
              {label}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}

export default function App() {
  const { t, locale, setLocale } = useT();
  const { pathname } = useLocation();
  const [section, setSection] = useSection();
  const nav = [
    { to: '/projects', label: t('Projects'), icon: FolderKanban },
    { to: '/gallery', label: t('Gallery'), icon: Images },
    { to: '/templates', label: t('Templates'), icon: LayoutTemplate },
    { to: '/from-site', label: t('From a website'), icon: Globe },
    { to: '/template-kits', label: t('Template Kit'), icon: Package },
  ];
  const settings = [
    { to: '/settings/providers', label: t('AI Providers'), icon: Bot },
    // Plugins bundled with the WordPress sites: nothing to do with a site made with code
    ...(section === 'wordpress' ? [{ to: '/settings/plugins', label: t('Plugins'), icon: Plug }] : []),
  ];

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:px-6 lg:gap-4">
          <div className="flex shrink-0 rounded-lg bg-slate-100 p-1" role="group" aria-label={t('Section')}>
            {SECTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSection(s)}
                aria-pressed={section === s}
                title={t(s === 'wordpress' ? 'Websites built on WordPress by a plugin' : 'Websites made with code: HTML, CSS and JavaScript, downloaded as a zip')}
                className={cx('inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-sm font-semibold whitespace-nowrap transition-colors', section === s ? 'bg-white text-brand-700 shadow-sm ring-1 ring-slate-200' : 'text-slate-500 hover:text-slate-800')}
              >
                {s === 'code' && <Code2 className="size-4" />}
                {s === 'wordpress' ? 'WordPress' : t('Code')}
              </button>
            ))}
          </div>
          <span className="hidden h-6 w-px shrink-0 bg-slate-200 lg:block" aria-hidden="true" />
          <nav className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {nav.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                title={label}
                className={({ isActive }) =>
                  cx('inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium whitespace-nowrap', isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100')
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon className="size-4 shrink-0" />
                    <span className={isActive ? 'inline' : 'hidden xl:inline'}>{label}</span>
                  </>
                )}
              </NavLink>
            ))}
          </nav>
          <SettingsMenu items={settings} active={pathname.startsWith('/settings')} t={t} />
          <label className="flex shrink-0 items-center gap-1.5 text-slate-500" title={t('Interface language')}>
            <Languages className="size-4" />
            <select value={locale} onChange={(e) => setLocale(e.target.value)} className="cursor-pointer bg-transparent text-sm font-medium text-slate-600 focus:outline-none" aria-label={t('Interface language')}>
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

      <main className="mx-auto max-w-7xl px-4 pt-8 pb-20 sm:px-6">
        <ErrorBoundary t={t} resetKey={pathname}>
          <Routes>
            <Route path="/" element={<Navigate to="/projects" replace />} />
            <Route path="/projects" element={<ProjectsPage />} />
            <Route path="/projects/:id/*" element={<ProjectWizard />} />
            <Route path="/gallery" element={<GalleryPage />} />
            <Route path="/templates" element={<TemplatesPage />} />
            <Route path="/from-site" element={<FromSitePage />} />
            <Route path="/template-kits" element={<TemplateKitsPage />} />
            <Route path="/settings/providers" element={<ProvidersPage />} />
            <Route path="/settings/plugins" element={<PluginsPage />} />
            <Route path="*" element={<Navigate to="/projects" replace />} />
          </Routes>
        </ErrorBoundary>
      </main>
      <SessionTimer />
    </div>
  );
}
