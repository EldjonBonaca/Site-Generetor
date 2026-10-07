import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bot, Eye, FileText, PlugZap } from 'lucide-react';
import { api } from '../../api.js';
import { useT } from '../../i18n/index.jsx';
import { useToast } from '../../components/Toast.jsx';
import { Alert, Badge, Button, Card, EmptyState, Field, Modal, Select, Spinner } from '../../components/ui.jsx';
import { StepIssues } from '../../components/StepIssues.jsx';

/** AI provider choice + the built-in site prompt (read-only: the same prompt for every site). */
export default function AiStep({ project, setProject }) {
  const { t } = useT();
  const toast = useToast();
  const [providers, setProviders] = useState(null);
  const [sitePrompt, setSitePrompt] = useState(null);
  const [plan, setPlan] = useState(null);
  const [pageKey, setPageKey] = useState('');
  const [testing, setTesting] = useState(false);
  const [preview, setPreview] = useState(null);
  const gen = project.settings.generation;

  useEffect(() => {
    Promise.all([api.get('/providers'), api.get('/prompts/site'), api.get(`/projects/${project.id}/plan`)])
      .then(([pv, sp, pl]) => {
        setProviders(pv);
        setSitePrompt(sp);
        setPlan(pl);
        setPageKey(pl.pages[0]?.key || '');
        // Pick the only provider automatically
        if (!gen.providerId && pv.length === 1) save({ providerId: pv[0].id });
      })
      .catch((e) => toast(e.message, 'error'));
  }, [project.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (patch) => {
    try {
      setProject(await api.patch(`/projects/${project.id}`, { settings: { generation: patch } }));
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  const provider = providers?.find((p) => p.id === gen.providerId);

  const test = async () => {
    setTesting(true);
    try {
      const r = await api.post(`/providers/${provider.id}/test`);
      if (r.ok) toast(t('Connection OK ({ms} ms): "{reply}"', { ms: r.latencyMs, reply: r.reply }));
      else toast(r.error, 'error');
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setTesting(false);
    }
  };

  const openPreview = async () => {
    const page = plan.pages.find((p) => p.key === pageKey);
    setPreview({ loading: true, title: page?.title });
    try {
      setPreview({ ...(await api.post('/prompts/preview', { projectId: project.id, pageKey })), title: page?.title });
    } catch (e) {
      toast(e.message, 'error');
      setPreview(null);
    }
  };

  if (!providers || !plan || !sitePrompt) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );
  }

  return (
    <>
      <StepIssues project={project} step="ai" t={t} />
      <div className="space-y-6">
        <Card title={t('AI provider')} description={t('The account used to write the content. Only this provider receives your data.')}>
          {!providers.length ? (
            <EmptyState
              icon={Bot}
              title={t('No AI provider connected')}
              description={t('Add Claude, ChatGPT, Gemini or any OpenAI-compatible service with your API key.')}
              action={
                <Link to="/settings/providers">
                  <Button variant="primary">{t('Connect a provider')}</Button>
                </Link>
              }
            />
          ) : (
            <div className="flex flex-wrap items-end gap-3">
              <Field label={t('Provider')} className="min-w-64 flex-1">
                {(id) => (
                  <Select id={id} value={gen.providerId || ''} onChange={(e) => save({ providerId: e.target.value ? Number(e.target.value) : null })}>
                    <option value="">{t('— Select —')}</option>
                    {providers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} · {p.model}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              {provider && (
                <Button icon={PlugZap} onClick={test} loading={testing}>
                  {t('Test connection')}
                </Button>
              )}
              <Link to="/settings/providers" className="pb-2 text-sm font-medium text-brand-700 hover:underline">
                {t('Manage providers')}
              </Link>
            </div>
          )}
          {provider?.type === 'mock' && (
            <Alert kind="warning" className="mt-4">
              {t('The demo provider writes placeholder text without calling any AI. Use it to test the workflow.')}
            </Alert>
          )}
        </Card>

        <Card
          title={t('Prompt')}
          description={t('Every site is written with the same built-in prompt: all pages, header, footer and service articles. The site data, services and images are filled in automatically.')}
          actions={<Badge color="blue">{sitePrompt.name}</Badge>}
        >
          {!plan.pages.length ? (
            <Alert kind="info">{t('Select a kit and map its templates first, then you can preview the final prompt of each page.')}</Alert>
          ) : (
            <div className="flex flex-wrap items-end gap-3">
              <Field label={t('Preview the final prompt of')} className="min-w-64 flex-1">
                {(id) => (
                  <Select id={id} value={pageKey} onChange={(e) => setPageKey(e.target.value)}>
                    {plan.pages.map((p) => (
                      <option key={p.key} value={p.key}>
                        {p.title}
                        {p.role === 'post' ? ` (${t('article')})` : ''}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Button icon={Eye} onClick={openPreview}>
                {t('Preview')}
              </Button>
              <Button variant="ghost" icon={FileText} onClick={() => setPreview({ title: sitePrompt.name, prompt: sitePrompt.content, raw: true })}>
                {t('Show the prompt')}
              </Button>
            </div>
          )}
        </Card>
      </div>

      <Modal open={!!preview} onClose={() => setPreview(null)} title={`${preview?.raw ? t('Prompt') : t('Final prompt')}: ${preview?.title || ''}`} size="xl">
        {preview?.loading ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : (
          preview && (
            <>
              {!preview.raw && (
                <div className="mb-3 flex flex-wrap gap-2">
                  <Badge>≈ {preview.estimatedTokens.toLocaleString()} {t('input tokens')}</Badge>
                </div>
              )}
              <pre className="rounded-lg bg-slate-900 p-4 text-xs leading-relaxed whitespace-pre-wrap text-slate-100">{preview.prompt}</pre>
            </>
          )
        )}
      </Modal>
    </>
  );
}
