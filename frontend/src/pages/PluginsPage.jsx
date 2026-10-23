import { useEffect, useRef, useState } from 'react';
import { Check, PackagePlus, Plug, Trash2 } from 'lucide-react';
import { api } from '../api.js';
import { useT } from '../i18n/index.jsx';
import { useToast } from '../components/Toast.jsx';
import { Badge, Button, Card, EmptyState, IconButton, PageHeader, Spinner } from '../components/ui.jsx';

/** Plugins the WordPress plugin of every site installs and activates (wp-plugin/plugin.php). */
const FREE_PLUGINS = ['Elementor', 'Contact Form 7', 'Yoast SEO', 'Ultimate Addons for Elementor', 'LocalWeb All In One', 'Loginizer', 'WP Fastest Cache', 'Really Simple SSL', 'Joinchat (WhatsApp, if on)'];

/** Premium plugins uploaded once (e.g. WP Fastest Cache Premium): installed on every site exported afterwards. */
export default function PluginsPage() {
  const { t } = useT();
  const toast = useToast();
  const [list, setList] = useState(null);
  const [uploading, setUploading] = useState(false);
  const input = useRef(null);

  useEffect(() => {
    api.get('/bundled-plugins').then(setList).catch((e) => toast(e.message, 'error'));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const upload = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const body = new FormData();
      body.append('file', file);
      const plugin = await api.upload('/bundled-plugins', body);
      setList((l) => [...(l || []).filter((p) => p.zip !== plugin.zip && p.file.split('/')[0] !== plugin.file.split('/')[0]), plugin].sort((a, b) => a.name.localeCompare(b.name)));
      toast(t('Plugin "{name}" uploaded: it is installed on every site you export from now on.', { name: plugin.name }));
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setUploading(false);
      if (input.current) input.current.value = '';
    }
  };

  const remove = async (p) => {
    if (!window.confirm(t('Remove "{name}"? Sites exported afterwards will not install it.', { name: p.name }))) return;
    try {
      await api.del(`/bundled-plugins/${p.zip}`);
      setList((l) => l.filter((x) => x.zip !== p.zip));
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  return (
    <>
      <PageHeader
        title={t('WordPress plugins')}
        description={t('Plugins installed and activated on every site by the WordPress plugin you download from the export.')}
        actions={
          <>
            <input ref={input} type="file" accept=".zip" className="hidden" onChange={(e) => upload(e.target.files[0])} />
            <Button variant="primary" icon={PackagePlus} loading={uploading} onClick={() => input.current?.click()}>
              {t('Upload premium plugin (.zip)')}
            </Button>
          </>
        }
      />
      <div className="space-y-6">
        <Card title={t('Premium plugins')} description={t('Upload the .zip of a plugin you own (e.g. WP Fastest Cache Premium): it is put inside the WordPress plugin of every site exported from now on, and installed and activated after the free plugins. Export the site again after uploading.')}>
          {!list ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : !list.length ? (
            <EmptyState icon={Plug} title={t('No premium plugins')} description={t('Upload the .zip file you downloaded from the plugin website.')} />
          ) : (
            <ul className="divide-y divide-slate-100">
              {list.map((p) => (
                <li key={p.zip} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900">
                      {p.name} {p.version && <span className="text-sm font-normal text-slate-500">v{p.version}</span>}
                    </p>
                    <p className="truncate font-mono text-xs text-slate-500">
                      {p.file} · {(p.size / 1e6).toFixed(1)} MB{p.uploaded_by ? ` · ${p.uploaded_by}` : ''}
                    </p>
                  </div>
                  <IconButton icon={Trash2} label={t('Delete')} onClick={() => remove(p)} className="hover:text-red-600" />
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title={t('Installed on every site')} description={t('Free plugins from wordpress.org, installed and activated automatically. Only the Hello Elementor theme is kept; when the site is ready the builder plugin removes itself.')}>
          <div className="flex flex-wrap gap-2">
            {FREE_PLUGINS.map((name) => (
              <Badge key={name} color="green">
                <Check className="size-3" />
                {name}
              </Badge>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}
