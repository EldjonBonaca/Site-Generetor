import { useEffect, useState } from 'react';
import { Bot, KeyRound, Pencil, PlugZap, Plus, Trash2, X } from 'lucide-react';
import { api } from '../api.js';
import { useT } from '../i18n/index.jsx';
import { useToast } from '../components/Toast.jsx';
import { Alert, Badge, Button, EmptyState, Field, IconButton, Input, Modal, PageHeader, Select, Spinner } from '../components/ui.jsx';

export default function ProvidersPage() {
  const { t } = useT();
  const toast = useToast();
  const [types, setTypes] = useState([]);
  const [providers, setProviders] = useState(null);
  const [editing, setEditing] = useState(null); // null | {} (new) | provider
  const [testing, setTesting] = useState(null);
  const [results, setResults] = useState({});

  const load = () => api.get('/providers').then(setProviders);
  useEffect(() => {
    Promise.all([api.get('/providers/types').then(setTypes), load()]).catch((e) => toast(e.message, 'error'));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const test = async (p) => {
    setTesting(p.id);
    try {
      const r = await api.post(`/providers/${p.id}/test`);
      setResults((x) => ({ ...x, [p.id]: r }));
    } catch (e) {
      setResults((x) => ({ ...x, [p.id]: { ok: false, error: e.message } }));
    } finally {
      setTesting(null);
    }
  };

  const remove = async (p) => {
    if (!window.confirm(t('Delete provider "{name}"?', { name: p.name }))) return;
    try {
      await api.del(`/providers/${p.id}`);
      load();
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  const typeLabel = (type) => types.find((x) => x.type === type)?.label || type;

  return (
    <>
      <PageHeader
        title={t('AI Providers')}
        description={t('Connect one or more AI accounts with your API keys. Keys are stored encrypted and never shown again.')}
        actions={
          <Button variant="primary" icon={Plus} onClick={() => setEditing({})}>
            {t('Add provider')}
          </Button>
        }
      />
      {!providers ? (
        <div className="flex justify-center py-20">
          <Spinner />
        </div>
      ) : !providers.length ? (
        <EmptyState
          icon={Bot}
          title={t('No providers connected')}
          description={t('Add Anthropic (Claude), OpenAI (ChatGPT), Google Gemini or any OpenAI-compatible service. Use "Demo (offline mock)" to try the workflow without a key.')}
          action={
            <Button variant="primary" icon={Plus} onClick={() => setEditing({})}>
              {t('Add provider')}
            </Button>
          }
        />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {providers.map((p) => {
            const r = results[p.id];
            return (
              <li key={p.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-900">{p.name}</p>
                    <p className="text-sm text-slate-500">{typeLabel(p.type)}</p>
                  </div>
                  <div className="flex gap-1">
                    <IconButton icon={Pencil} label={t('Edit')} onClick={() => setEditing(p)} />
                    <IconButton icon={Trash2} label={t('Delete')} onClick={() => remove(p)} className="hover:text-red-600" />
                  </div>
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <dt className="text-slate-500">{t('Model')}</dt>
                  <dd className="truncate font-mono text-xs leading-5 text-slate-800">{p.model}</dd>
                  <dt className="text-slate-500">{t('API key')}</dt>
                  <dd className="font-mono text-xs leading-5 text-slate-800">{p.has_key ? p.key_hint : <span className="text-slate-400">{t('none')}</span>}</dd>
                  {p.base_url && (
                    <>
                      <dt className="text-slate-500">{t('Base URL')}</dt>
                      <dd className="truncate text-xs leading-5 text-slate-800">{p.base_url}</dd>
                    </>
                  )}
                  <dt className="text-slate-500">{t('Temperature / max tokens')}</dt>
                  <dd className="text-xs leading-5 text-slate-800">
                    {p.temperature} / {p.max_tokens.toLocaleString()}
                  </dd>
                </dl>
                <div className="mt-4 flex items-center gap-3">
                  <Button size="sm" icon={PlugZap} onClick={() => test(p)} loading={testing === p.id}>
                    {t('Test connection')}
                  </Button>
                  {r && (r.ok ? <Badge color="green">{t('OK · {ms} ms', { ms: r.latencyMs })}</Badge> : <Badge color="red">{t('Failed')}</Badge>)}
                </div>
                {r && !r.ok && (
                  <Alert kind="error" className="mt-3">
                    {r.error}
                  </Alert>
                )}
                {r?.ok && <p className="mt-2 truncate text-xs text-slate-500">{t('Reply')}: “{r.reply}”</p>}
              </li>
            );
          })}
        </ul>
      )}

      {editing && (
        <ProviderForm
          types={types}
          provider={editing.id ? editing : null}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
            toast(t('Provider saved'));
          }}
        />
      )}
    </>
  );
}

function ProviderForm({ types, provider, onClose, onSaved }) {
  const { t } = useT();
  const [type, setType] = useState(provider?.type || types[0]?.type || 'anthropic');
  const meta = types.find((x) => x.type === type) || {};
  const [form, setForm] = useState(() => ({
    name: provider?.name || '',
    api_key: '',
    base_url: provider?.base_url || '',
    models: provider?.models || meta.defaultModels || [],
    model: provider?.model || meta.defaultModels?.[0] || '',
    temperature: provider?.temperature ?? 0.7,
    max_tokens: provider?.max_tokens ?? 8192,
  }));
  const [newModel, setNewModel] = useState('');
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState(null);

  const changeType = (next) => {
    setType(next);
    const m = types.find((x) => x.type === next);
    setForm((f) => ({ ...f, models: m.defaultModels, model: m.defaultModels[0] || '', base_url: m.requiresBaseUrl ? m.defaultBaseUrl : '' }));
    setTestResult(null);
  };
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const payload = () => ({ ...form, type, temperature: Number(form.temperature), max_tokens: Number(form.max_tokens), name: form.name || meta.label });

  const addModel = () => {
    const m = newModel.trim();
    if (!m) return;
    setForm((f) => ({ ...f, models: [...new Set([...f.models, m])], model: m }));
    setNewModel('');
  };
  const removeModel = (m) => setForm((f) => ({ ...f, models: f.models.filter((x) => x !== m), model: f.model === m ? f.models.find((x) => x !== m) || '' : f.model }));

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      if (provider) await api.patch(`/providers/${provider.id}`, payload());
      else await api.post('/providers', payload());
      onSaved();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      // Saved provider + no new key typed: test the stored key
      const r = provider && !form.api_key ? await api.post(`/providers/${provider.id}/test`, { model: form.model }) : await api.post('/providers/test', payload());
      setTestResult(r);
    } catch (e) {
      setTestResult({ ok: false, error: e.message });
    } finally {
      setTesting(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={provider ? t('Edit provider') : t('Add provider')}
      size="lg"
      footer={
        <>
          <Button icon={PlugZap} onClick={test} loading={testing} className="mr-auto">
            {t('Test connection')}
          </Button>
          <Button onClick={onClose}>{t('Cancel')}</Button>
          <Button variant="primary" onClick={save} loading={saving}>
            {t('Save')}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('Provider type')}>
          {(id) => (
            <Select id={id} value={type} onChange={(e) => changeType(e.target.value)} disabled={!!provider}>
              {types.map((x) => (
                <option key={x.type} value={x.type}>
                  {x.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t('Name')}>{(id) => <Input id={id} value={form.name} onChange={set('name')} placeholder={meta.label} />}</Field>
        {meta.description && <p className="-mt-2 text-xs text-slate-500 sm:col-span-2">{meta.description}</p>}

        {type !== 'mock' && (
          <Field
            label={t('API key')}
            required={meta.requiresKey && !provider?.has_key}
            hint={provider?.has_key ? t('Saved key: {hint}. Leave empty to keep it.', { hint: provider.key_hint }) : t('Stored encrypted (AES-256-GCM). It will never be shown again.')}
            className="sm:col-span-2"
          >
            {(id) => (
              <div className="relative">
                <KeyRound className="pointer-events-none absolute top-2.5 left-3 size-4 text-slate-400" />
                <Input id={id} type="password" autoComplete="off" value={form.api_key} onChange={set('api_key')} placeholder={meta.keyPlaceholder} className="pl-9 font-mono" />
              </div>
            )}
          </Field>
        )}
        {(meta.requiresBaseUrl || form.base_url) && (
          <Field label={t('Base URL')} required={meta.requiresBaseUrl} hint={t('e.g. https://openrouter.ai/api/v1 · https://api.groq.com/openai/v1 · http://localhost:11434/v1')} className="sm:col-span-2">
            {(id) => <Input id={id} value={form.base_url} onChange={set('base_url')} placeholder={meta.defaultBaseUrl} />}
          </Field>
        )}

        <Field label={t('Model')} hint={t('Model names change over time: edit the list below.')} className="sm:col-span-2">
          {(id) => (
            <Select id={id} value={form.model} onChange={set('model')}>
              {form.models.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <div className="sm:col-span-2">
          <div className="flex flex-wrap gap-1.5">
            {form.models.map((m) => (
              <span key={m} className="inline-flex items-center gap-1 rounded-md bg-slate-100 py-0.5 pr-1 pl-2 font-mono text-xs text-slate-700">
                {m}
                <button type="button" onClick={() => removeModel(m)} className="rounded text-slate-400 hover:text-slate-700" aria-label={t('Remove')}>
                  <X className="size-3.5" />
                </button>
              </span>
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            <Input value={newModel} onChange={(e) => setNewModel(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addModel()} placeholder={t('Add a model name…')} className="font-mono" />
            <Button onClick={addModel} icon={Plus}>
              {t('Add')}
            </Button>
          </div>
        </div>

        <Field label={`${t('Temperature')}: ${form.temperature}`} hint={t('Lower = more consistent, higher = more creative.')}>
          {(id) => <input id={id} type="range" min={0} max={1.5} step={0.1} value={form.temperature} onChange={set('temperature')} className="w-full accent-brand-600" />}
        </Field>
        <Field label={t('Max tokens')} hint={t('Max length of each answer. 8192 is a good default.')}>
          {(id) => <Input id={id} type="number" min={256} max={200000} step={256} value={form.max_tokens} onChange={set('max_tokens')} />}
        </Field>
      </div>

      {error && (
        <Alert kind="error" className="mt-4">
          {error}
        </Alert>
      )}
      {testResult &&
        (testResult.ok ? (
          <Alert kind="success" className="mt-4" title={t('Connection OK · {ms} ms', { ms: testResult.latencyMs })}>
            {t('Reply')}: “{testResult.reply}”
          </Alert>
        ) : (
          <Alert kind="error" className="mt-4" title={t('Connection failed')}>
            {testResult.error}
          </Alert>
        ))}
    </Modal>
  );
}
