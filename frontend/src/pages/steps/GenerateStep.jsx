import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, CircleAlert, Clock, Download, Loader2, Play, RefreshCw, Sparkles, Square, XCircle } from 'lucide-react';
import { api } from '../../api.js';
import { useT } from '../../i18n/index.jsx';
import { useToast } from '../../components/Toast.jsx';
import { useAutosave } from '../../hooks/useAutosave.js';
import { Alert, Badge, Button, Card, Field, IconButton, Input, ProgressBar, SaveStatus, Select, Spinner, Textarea, cx } from '../../components/ui.jsx';
import { StepIssues } from '../../components/StepIssues.jsx';
import { formatDateTime } from '../ProjectsPage.jsx';

const isActive = (g) => g && (g.running || g.status === 'queued' || g.status === 'running');

export default function GenerateStep({ project, reload }) {
  const { t } = useT();
  const toast = useToast();
  const navigate = useNavigate();
  const [plan, setPlan] = useState(null);
  const [history, setHistory] = useState([]);
  const [gen, setGen] = useState(null);
  const [starting, setStarting] = useState(false);
  const [showPlan, setShowPlan] = useState(false);

  const loadGen = useCallback((id) => api.get(`/generations/${id}`).then(setGen), []);

  useEffect(() => {
    Promise.all([api.get(`/projects/${project.id}/plan`), api.get(`/projects/${project.id}/generations`)])
      .then(([pl, hist]) => {
        setPlan(pl);
        setHistory(hist);
        if (hist[0]) loadGen(hist[0].id);
        else setShowPlan(true);
      })
      .catch((e) => toast(e.message, 'error'));
  }, [project.id, loadGen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Poll while running
  useEffect(() => {
    if (!isActive(gen)) return;
    const timer = setTimeout(() => {
      loadGen(gen.id).catch(() => {});
    }, 1200);
    return () => clearTimeout(timer);
  }, [gen, loadGen]);

  // When a run finishes, refresh history + project status
  const wasActive = useRef(false);
  useEffect(() => {
    if (isActive(gen)) wasActive.current = true;
    else if (wasActive.current && gen) {
      wasActive.current = false;
      api.get(`/projects/${project.id}/generations`).then(setHistory);
      reload();
      if (gen.status === 'completed') toast(t('Generation completed'));
      else if (gen.status === 'failed') toast(gen.error || t('Generation failed'), 'error');
    }
  }, [gen]); // eslint-disable-line react-hooks/exhaustive-deps

  const start = async () => {
    setStarting(true);
    try {
      const g = await api.post(`/projects/${project.id}/generations`);
      setGen(g);
      setShowPlan(false);
      setHistory((h) => [g, ...h]);
    } catch (e) {
      toast(e.details?.length ? e.details.map((d) => d.message).join(' ') : e.message, 'error');
    } finally {
      setStarting(false);
    }
  };

  const cancel = () => api.post(`/generations/${gen.id}/cancel`).catch((e) => toast(e.message, 'error'));

  if (!plan) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {showPlan || !gen ? (
        <PlanCard plan={plan} project={project} onStart={start} starting={starting} onCancel={gen ? () => setShowPlan(false) : null} />
      ) : (
        <>
          <Card
            title={t('Generation #{id}', { id: gen.id })}
            description={gen.provider ? `${gen.provider.name} · ${gen.provider.model}` : null}
            actions={
              <>
                {history.length > 1 && (
                  <Select value={gen.id} onChange={(e) => loadGen(e.target.value)} className="h-8 w-auto py-1 text-xs" aria-label={t('History')}>
                    {history.map((h) => (
                      <option key={h.id} value={h.id}>
                        #{h.id} · {h.status} · {formatDateTime(h.created_at)}
                      </option>
                    ))}
                  </Select>
                )}
                {isActive(gen) ? (
                  <Button size="sm" variant="danger" icon={Square} onClick={cancel}>
                    {t('Stop')}
                  </Button>
                ) : (
                  <>
                    <Button size="sm" icon={Play} onClick={() => setShowPlan(true)}>
                      {t('New generation')}
                    </Button>
                    {gen.pages_done > 0 && (
                      <Button size="sm" variant="primary" icon={Download} onClick={() => navigate('../download')}>
                        {t('Go to download')}
                      </Button>
                    )}
                  </>
                )}
              </>
            }
          >
            <GenerationStatus gen={gen} />
          </Card>
          {gen.pages?.length > 0 && <PagesPreview gen={gen} setGen={setGen} onReload={() => loadGen(gen.id)} />}
        </>
      )}
    </div>
  );
}

function PlanCard({ plan, project, onStart, starting, onCancel }) {
  const { t } = useT();
  const ready = plan.readiness.ready;
  return (
    <Card
      title={t('Generation plan')}
      description={t('Pages that will be generated from the kit mapping, with the estimated token usage.')}
      actions={
        <>
          {onCancel && <Button onClick={onCancel}>{t('Back to results')}</Button>}
          <Button variant="primary" icon={Sparkles} onClick={onStart} loading={starting} disabled={!ready}>
            {t('Generate')}
          </Button>
        </>
      }
    >
      <StepIssues project={{ readiness: plan.readiness }} step="site" t={t} />
      {['services', 'images', 'kit', 'ai', 'download'].map((s) => (
        <StepIssues key={s} project={{ readiness: plan.readiness }} step={s} t={t} />
      ))}
      {ready && !plan.readiness.items.length && <Alert kind="success" className="mb-5">{t('Everything is ready.')}</Alert>}
      {plan.pages.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="px-3 py-2 font-medium">{t('Page')}</th>
                <th className="px-3 py-2 font-medium">{t('AI fields')}</th>
                <th className="px-3 py-2 font-medium">{t('Auto (contacts)')}</th>
                <th className="px-3 py-2 font-medium">{t('Images')}</th>
                <th className="px-3 py-2 font-medium">{t('Prompt')}</th>
                <th className="px-3 py-2 text-right font-medium">{t('Est. tokens')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {plan.pages.map((p) => (
                <tr key={p.key}>
                  <td className="px-3 py-2">
                    <span className="font-medium text-slate-800">{p.title}</span> <span className="text-xs text-slate-400">{p.role}</span>
                  </td>
                  <td className="px-3 py-2">{p.aiFields}</td>
                  <td className="px-3 py-2">{p.autoFields}</td>
                  <td className="px-3 py-2">{p.slots}</td>
                  <td className="px-3 py-2 text-slate-500">{p.prompt}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{p.estimatedTokens.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-slate-50 font-medium">
              <tr>
                <td className="px-3 py-2" colSpan={5}>
                  {t('Total ({n} pages)', { n: plan.pages.length })}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">≈ {plan.estimatedTokens.toLocaleString()}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      <p className="mt-3 text-xs text-slate-500">{t('Estimates are approximate (≈ 4 characters per token). Retries for invalid answers can increase usage.')}</p>
      {!project.services.length && <p className="mt-1 text-xs text-slate-500">{t('Tip: add services to get one page per service.')}</p>}
    </Card>
  );
}

function GenerationStatus({ gen }) {
  const { t } = useT();
  const logRef = useRef(null);
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [gen.log?.length]);

  const statusBadge = {
    queued: <Badge color="gray">{t('Queued')}</Badge>,
    running: <Badge color="blue">{t('Running')}</Badge>,
    completed: <Badge color="green">{t('Completed')}</Badge>,
    failed: <Badge color="red">{t('Failed')}</Badge>,
  }[gen.status];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4 text-sm">
        {statusBadge}
        <span className="text-slate-600">{t('{done}/{total} pages', { done: gen.pages_done, total: gen.page_count })}</span>
        <span className="text-slate-600">{t('{n} tokens used', { n: (gen.tokens_used || 0).toLocaleString() })}</span>
      </div>
      {isActive(gen) && <ProgressBar value={gen.progress} />}
      {gen.error && <Alert kind="error">{gen.error}</Alert>}
      <div ref={logRef} className="max-h-56 overflow-y-auto rounded-lg bg-slate-900 p-3 font-mono text-xs leading-relaxed">
        {(gen.log || []).map((l, i) => (
          <div key={i} className={cx(l.level === 'error' && 'text-red-400', l.level === 'warn' && 'text-amber-300', l.level === 'success' && 'text-emerald-400', l.level === 'info' && 'text-slate-300')}>
            <span className="text-slate-500">{new Date(l.t).toLocaleTimeString()}</span> {l.msg}
          </div>
        ))}
        {isActive(gen) && <Loader2 className="mt-1 size-3.5 animate-spin text-slate-400" />}
      </div>
    </div>
  );
}

function PageStatusIcon({ status }) {
  if (status === 'done') return <CheckCircle2 className="size-4 text-emerald-500" />;
  if (status === 'error') return <XCircle className="size-4 text-red-500" />;
  if (status === 'running') return <Loader2 className="size-4 animate-spin text-brand-500" />;
  return <Clock className="size-4 text-slate-300" />;
}

function PagesPreview({ gen, setGen, onReload }) {
  const { t } = useT();
  const toast = useToast();
  const [selected, setSelected] = useState(gen.pages[0]?.key);
  const page = gen.pages.find((p) => p.key === selected) || gen.pages[0];
  const locked = isActive(gen);

  const regeneratePage = async () => {
    try {
      await api.post(`/generations/${gen.id}/pages/${page.key}/regenerate`);
      await onReload();
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  const replacePage = (updated) => setGen((g) => ({ ...g, pages: g.pages.map((p) => (p.key === updated.key ? updated : p)) }));

  return (
    <Card title={t('Preview & edit')} description={t('Review the generated text. Edits are saved automatically and used in the export.')} padded={false}>
      <div className="grid md:grid-cols-[220px_1fr]">
        <ul className="border-b border-slate-100 p-2 md:border-r md:border-b-0">
          {gen.pages.map((p) => (
            <li key={p.key}>
              <button
                type="button"
                onClick={() => setSelected(p.key)}
                className={cx('flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm', p.key === page.key ? 'bg-brand-50 font-medium text-brand-800' : 'text-slate-600 hover:bg-slate-50')}
              >
                <PageStatusIcon status={p.status} />
                <span className="min-w-0 flex-1 truncate">{p.title}</span>
                <span className="text-[11px] text-slate-400">{p.role === 'post' ? t('article') : p.role.replace('_', ' ')}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="min-w-0 p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold text-slate-900">{page.title}</h3>
              <p className="text-xs text-slate-500">
                {t('Template')}: {page.templateTitle} · {page.fields.length} {t('fields')} · {(page.tokens || 0).toLocaleString()} {t('tokens')}
              </p>
            </div>
            <Button size="sm" icon={RefreshCw} onClick={regeneratePage} disabled={locked}>
              {t('Regenerate page')}
            </Button>
          </div>
          {page.error && (
            <Alert kind="error" className="mb-4">
              {page.error}
            </Alert>
          )}
          <PageEditor key={`${gen.id}-${page.key}`} gen={gen} page={page} locked={locked} onPageChange={replacePage} />
        </div>
      </div>
    </Card>
  );
}

const SOURCE_BADGE = { ai: ['blue', 'AI'], auto: ['purple', 'Auto'], manual: ['green', 'Edited'], original: ['yellow', 'Original'] };

function PageEditor({ gen, page, locked, onPageChange }) {
  const { t } = useT();
  const toast = useToast();
  const [values, setValues] = useState(() => Object.fromEntries(page.fields.map((f) => [f.id, f.value ?? ''])));
  const [seo, setSeo] = useState(page.seo || {});
  const [regenerating, setRegenerating] = useState(null);
  const [showOriginal, setShowOriginal] = useState(false);

  // Sync only when the AI changed the page (regeneration bumps tokens/status). Not on autosave
  // responses, otherwise text typed while a save is in flight would be overwritten.
  useEffect(() => {
    setValues(Object.fromEntries(page.fields.map((f) => [f.id, f.value ?? ''])));
    setSeo(page.seo || {});
  }, [page.tokens, page.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const { schedule, status, flush } = useAutosave(async (patch) => {
    const { __seo, __title, ...fields } = patch;
    try {
      const updated = await api.patch(`/generations/${gen.id}/pages/${page.key}`, { fields, seo: __seo, title: __title });
      onPageChange(updated);
    } catch (e) {
      toast(e.message, 'error');
      throw e;
    }
  }, 900);

  const setField = (id, value) => {
    setValues((v) => ({ ...v, [id]: value }));
    schedule({ [id]: value });
  };
  const setSeoField = (key, value) => {
    const next = { ...seo, [key]: value };
    setSeo(next);
    schedule({ __seo: next });
  };

  const regenerate = async (fieldId) => {
    setRegenerating(fieldId);
    try {
      await flush();
      const updated = await api.post(`/generations/${gen.id}/pages/${page.key}/fields/regenerate`, { fieldId });
      onPageChange(updated);
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setRegenerating(null);
    }
  };

  const hasSeo = page.seo && page.seo.slug !== null;
  const links = gen.links || [];
  const linkOptions = (value) => (value && !links.some((l) => l.url === value) ? [{ url: value, label: t('(current value)') }, ...links] : links);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-xs text-slate-600">
          <input type="checkbox" checked={showOriginal} onChange={(e) => setShowOriginal(e.target.checked)} className="accent-brand-600" />
          {t('Show original demo text')}
        </label>
        <SaveStatus status={status} t={t} />
      </div>

      {!['header', 'footer'].includes(page.role) && (
        <Field label={page.role === 'post' ? t('Article title') : t('Page title')}>
          {(id) => <Input id={id} defaultValue={page.title} onChange={(e) => e.target.value.trim() && schedule({ __title: e.target.value })} disabled={locked} />}
        </Field>
      )}

      {hasSeo && (
        <div className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50/60 p-3 sm:grid-cols-[1fr_1fr_160px]">
          <Field label={`${t('SEO title')} (${(seo.title || '').length}/60)`}>
            {(id) => (
              <div className="flex gap-1">
                <Input id={id} value={seo.title || ''} onChange={(e) => setSeoField('title', e.target.value)} disabled={locked} />
                <IconButton icon={regenerating === '_seo.title' ? Loader2 : Sparkles} label={t('Regenerate')} onClick={() => regenerate('_seo.title')} disabled={locked || !!regenerating} className={regenerating === '_seo.title' ? 'animate-spin' : ''} />
              </div>
            )}
          </Field>
          <Field label={`${t('Meta description')} (${(seo.description || '').length}/155)`}>
            {(id) => (
              <div className="flex gap-1">
                <Input id={id} value={seo.description || ''} onChange={(e) => setSeoField('description', e.target.value)} disabled={locked} />
                <IconButton icon={regenerating === '_seo.description' ? Loader2 : Sparkles} label={t('Regenerate')} onClick={() => regenerate('_seo.description')} disabled={locked || !!regenerating} className={regenerating === '_seo.description' ? 'animate-spin' : ''} />
              </div>
            )}
          </Field>
          <Field label={t('Slug')}>{(id) => <Input id={id} value={seo.slug ?? ''} onChange={(e) => setSeoField('slug', e.target.value)} disabled={locked || page.role === 'home'} placeholder="/" />}</Field>
        </div>
      )}

      {page.fields.map((f) => {
        const value = values[f.id] ?? '';
        const plainLen = value.replace(/<[^>]+>/g, '').length;
        const [color, label] = SOURCE_BADGE[f.source] || ['gray', f.source];
        return (
          <div key={f.id} className="rounded-lg border border-slate-200 p-3">
            <div className="mb-1.5 flex flex-wrap items-center gap-2">
              <code className="text-xs text-slate-500">{f.id}</code>
              <Badge color={color}>{t(label)}</Badge>
              {f.format === 'html' && <Badge>HTML</Badge>}
              {f.format === 'link' && <Badge>Link</Badge>}
              {f.hint && <span className="truncate text-xs text-slate-400">{f.hint}</span>}
              {f.format !== 'link' && (
                <span className={cx('ml-auto text-xs tabular-nums', plainLen > f.maxLength || (f.minLength && plainLen < f.minLength) ? 'text-amber-600' : 'text-slate-400')}>
                  {f.minLength ? `min ${f.minLength} · ` : ''}
                  {plainLen}/{f.maxLength}
                </span>
              )}
              {f.source !== 'auto' && (
                <IconButton icon={regenerating === f.id ? Loader2 : Sparkles} label={t('Regenerate this field')} onClick={() => regenerate(f.id)} disabled={locked || !!regenerating} className={regenerating === f.id ? 'animate-spin' : ''} />
              )}
            </div>
            {f.format === 'link' ? (
              <Select value={value} onChange={(e) => setField(f.id, e.target.value)} disabled={locked} aria-label={t('Link')}>
                {!value && <option value="">{t('Not generated yet')}</option>}
                {linkOptions(value).map((l) => (
                  <option key={l.url} value={l.url}>
                    {l.label} — {l.url}
                  </option>
                ))}
              </Select>
            ) : (
              <Textarea
                value={value}
                onChange={(e) => setField(f.id, e.target.value)}
                rows={Math.min(f.minLength ? 12 : 8, Math.max(1, Math.ceil(value.length / 90)))}
                className={cx('resize-y', f.format === 'html' && 'font-mono text-xs')}
                disabled={locked}
                placeholder={page.status === 'pending' ? t('Not generated yet') : ''}
              />
            )}
            {showOriginal && <p className="mt-1.5 text-xs text-slate-400">{t('Original')}: {f.original.replace(/<[^>]+>/g, ' ').slice(0, 300)}</p>}
          </div>
        );
      })}
      {!page.fields.length && (
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <CircleAlert className="size-4" /> {t('This template has no text fields.')}
        </p>
      )}
    </div>
  );
}
