import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Download, FileArchive, FileCode, FileJson, FileSpreadsheet, FileText, Image, ListChecks, PackageCheck, Plug } from 'lucide-react';
import { api } from '../../api.js';
import { useT } from '../../i18n/index.jsx';
import { useToast } from '../../components/Toast.jsx';
import { useAutosave } from '../../hooks/useAutosave.js';
import { Alert, Button, Card, EmptyState, Field, Input, SaveStatus, Select, Spinner } from '../../components/ui.jsx';
import { StepIssues } from '../../components/StepIssues.jsx';
import { formatDateTime } from '../ProjectsPage.jsx';

const ym = () => {
  const d = new Date();
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}`;
};

export default function DownloadStep({ project, setProject }) {
  const { t } = useT();
  const toast = useToast();
  const navigate = useNavigate();
  const [baseUrl, setBaseUrl] = useState(project.image_base_url);
  const [gens, setGens] = useState(null);
  const [genId, setGenId] = useState(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    api
      .get(`/projects/${project.id}/generations`)
      .then((list) => {
        const usable = list.filter((g) => g.pages_done > 0 && !g.running);
        setGens(usable);
        setGenId(usable[0]?.id ?? null);
      })
      .catch((e) => toast(e.message, 'error'));
  }, [project.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const { schedule, status } = useAutosave(async (patch) => {
    try {
      setProject(await api.patch(`/projects/${project.id}`, patch));
    } catch (e) {
      toast(e.message, 'error');
      throw e;
    }
  });

  const validUrl = !baseUrl || /^https?:\/\/[^\s/]+/i.test(baseUrl.trim());
  const changeUrl = (v) => {
    setBaseUrl(v);
    if (!v || /^https?:\/\/[^\s/]+/i.test(v.trim())) schedule({ image_base_url: v });
  };
  const addUploadsPath = () => {
    const origin = baseUrl.trim().match(/^https?:\/\/[^/]+/i)?.[0];
    if (origin) changeUrl(`${origin}/wp-content/uploads/${ym()}/`);
  };

  const exportZip = async () => {
    setExporting(true);
    try {
      const r = await api.post(`/generations/${genId}/export`);
      // Start the download (attachment: the page stays), then back to the main page
      const a = document.createElement('a');
      a.href = r.download;
      a.download = '';
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast(t('Export ready: the download has started. The final checks are in the zip.'));
      navigate('/projects');
    } catch (e) {
      toast(e.message, 'error');
      setExporting(false);
    }
  };

  const selected = gens?.find((g) => g.id === genId);
  const it = project.language === 'it';
  const contents = [
    [Plug, t('<site>-site.zip'), t('WordPress plugin: upload and activate it, it creates the 5 pages, the service articles, images, menu, contact form, header and footer')],
    [FileJson, 'templates/*.json', t('Header, footer, single post and every page as importable Elementor templates')],
    [FileCode, 'wordpress-import.xml', t('Service articles (category, text, featured image), pages and navigation menu for Tools → Import')],
    [Image, 'images/', t('Renamed and optimized images')],
    [FileText, 'content.md · menu.md', t('All generated text and the menu structure')],
    [FileSpreadsheet, 'seo.csv', t('Title, meta description and slug of each page and article')],
    [PackageCheck, it ? 'ISTRUZIONI.md' : 'INSTRUCTIONS.md', t('Step-by-step import guide')],
    [ListChecks, it ? 'CONTROLLI.md' : 'CHECKS.md', t('Final checks: placeholder images, sample texts, links, contacts')],
  ];

  return (
    <>
      <StepIssues project={project} step="download" t={t} />
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <Card title={t('Images base URL')} description={t('Only for the manual import: images are referenced by URL in the templates. Use the WordPress uploads folder where you will upload them. The WordPress plugin does not need it.')} actions={<SaveStatus status={status} t={t} />}>
            <Field label={t('Base URL')} error={!validUrl ? t('Must start with http:// or https://') : null} hint={t('Example: https://mysite.com/wp-content/uploads/{ym}/', { ym: ym() })}>
              {(id) => (
                <div className="flex gap-2">
                  <Input id={id} value={baseUrl} onChange={(e) => changeUrl(e.target.value)} placeholder={`https://mysite.com/wp-content/uploads/${ym()}/`} invalid={!validUrl} />
                  <Button onClick={addUploadsPath} disabled={!/^https?:\/\/[^/]+\/?$/i.test(baseUrl.trim())} title={t('Append /wp-content/uploads/{ym}/', { ym: ym() })}>
                    + /uploads/{ym()}/
                  </Button>
                </div>
              )}
            </Field>
            <p className="mt-3 text-xs text-slate-500">
              {t('Image size, WEBP conversion and file names are configured in the')}{' '}
              <Link to="../images" className="font-medium text-brand-700 hover:underline">
                {t('Images')}
              </Link>{' '}
              {t('step.')}
            </p>
          </Card>

          <Card title={t('Export')} description={t('Builds the zip from the template and the generated content. You can export again after editing.')}>
            {!gens ? (
              <Spinner />
            ) : !gens.length ? (
              <EmptyState
                icon={FileArchive}
                title={t('Nothing to export yet')}
                description={t('Run a generation first.')}
                action={
                  <Link to="../generate">
                    <Button variant="primary">{t('Generate & Preview')}</Button>
                  </Link>
                }
              />
            ) : (
              <div className="space-y-4">
                <Field label={t('Generation')}>
                  {(id) => (
                    <Select id={id} value={genId ?? ''} onChange={(e) => setGenId(Number(e.target.value))}>
                      {gens.map((g) => (
                        <option key={g.id} value={g.id}>
                          #{g.id} · {g.status} · {t('{done}/{total} pages', { done: g.pages_done, total: g.page_count })} · {formatDateTime(g.created_at)}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
                {selected && selected.pages_done < selected.page_count && (
                  <Alert kind="warning">{t('Some pages of this generation were not generated: they will be exported with their original text.')}</Alert>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button variant="primary" size="lg" icon={Download} onClick={exportZip} loading={exporting} disabled={!genId || !validUrl}>
                    {t('Export & download zip')}
                  </Button>
                  {selected?.output_file && (
                    <>
                      <a href={`/api/generations/${selected.id}/plugin`}>
                        <Button size="lg" icon={Plug}>{t('Download WordPress plugin')}</Button>
                      </a>
                      <a href={`/api/generations/${selected.id}/download`}>
                        <Button size="lg">{t('Download last export')}</Button>
                      </a>
                    </>
                  )}
                </div>
              </div>
            )}
          </Card>
        </div>

        <Card title={t('Package contents')} className="self-start">
          <ul className="space-y-3">
            {contents.map(([Icon, name, desc]) => (
              <li key={name} className="flex gap-3">
                <Icon className="mt-0.5 size-4 shrink-0 text-brand-600" />
                <div>
                  <code className="text-xs font-semibold text-slate-800">{name}</code>
                  <p className="text-xs text-slate-500">{desc}</p>
                </div>
              </li>
            ))}
          </ul>
          <Alert kind="info" className="mt-5">
            {t('Nothing is published from here: install the WordPress plugin on your site (it uploads the images and creates pages, articles and menu), or import everything manually (see INSTRUCTIONS.md).')}
          </Alert>
        </Card>
      </div>
    </>
  );
}
