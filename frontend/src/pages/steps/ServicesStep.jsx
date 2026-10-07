import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, ImageOff, Layers, Plus, Trash2 } from 'lucide-react';
import { api } from '../../api.js';
import { useT } from '../../i18n/index.jsx';
import { useToast } from '../../components/Toast.jsx';
import { useAutosave } from '../../hooks/useAutosave.js';
import { Button, Card, EmptyState, Field, IconButton, Input, SaveStatus, Textarea } from '../../components/ui.jsx';
import { StepIssues } from '../../components/StepIssues.jsx';

export default function ServicesStep({ project, reload }) {
  const { t } = useT();
  const toast = useToast();
  const [services, setServices] = useState(project.services);
  const [images, setImages] = useState([]);
  const [adding, setAdding] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  useEffect(() => {
    api.get(`/projects/${project.id}/images`).then(setImages).catch(() => {});
  }, [project.id]);

  const add = async () => {
    setAdding(true);
    try {
      const s = await api.post(`/projects/${project.id}/services`, { name: '' });
      setServices((list) => [...list, s]);
      reload();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setAdding(false);
    }
  };

  const remove = async (s) => {
    try {
      await api.del(`/services/${s.id}`);
      setServices((list) => list.filter((x) => x.id !== s.id));
      reload();
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  const onDragEnd = async ({ active, over }) => {
    if (!over || active.id === over.id) return;
    const oldIndex = services.findIndex((s) => s.id === active.id);
    const newIndex = services.findIndex((s) => s.id === over.id);
    const next = arrayMove(services, oldIndex, newIndex);
    setServices(next);
    try {
      await api.put(`/projects/${project.id}/services/order`, { ids: next.map((s) => s.id) });
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  return (
    <>
      <StepIssues project={project} step="services" t={t} />
      <Card
        title={t('Services')}
        description={t('One page is generated for each service by duplicating the "Service" template. Drag to reorder.')}
        actions={
          <Button variant="primary" icon={Plus} onClick={add} loading={adding}>
            {t('Add service')}
          </Button>
        }
      >
        {!services.length ? (
          <EmptyState icon={Layers} title={t('No services yet')} description={t('Add the services the business offers, e.g. "Boiler repair".')} />
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={services.map((s) => s.id)} strategy={verticalListSortingStrategy}>
              <ul className="space-y-3">
                {services.map((s, i) => (
                  <ServiceRow
                    key={s.id}
                    index={i}
                    service={s}
                    image={images.find((img) => img.role === 'service' && img.service_id === s.id)}
                    onChange={(updated) => setServices((list) => list.map((x) => (x.id === updated.id ? updated : x)))}
                    onRemove={() => remove(s)}
                    onSaved={reload}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        )}
      </Card>
    </>
  );
}

function ServiceRow({ service, index, image, onChange, onRemove, onSaved }) {
  const { t } = useT();
  const toast = useToast();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: service.id });
  const [form, setForm] = useState({ name: service.name, description: service.description, slug: service.slug });
  const slugEdited = useRef(false);

  const { schedule, status } = useAutosave(async (patch) => {
    try {
      const updated = await api.patch(`/services/${service.id}`, patch);
      onChange(updated);
      // Server may adjust the slug (uniqueness / auto-sync with name)
      if (!slugEdited.current || 'slug' in patch) setForm((f) => ({ ...f, slug: updated.slug }));
      onSaved();
    } catch (e) {
      toast(e.message, 'error');
      throw e;
    }
  });

  const set = (key) => (e) => {
    const value = e.target.value;
    if (key === 'slug') slugEdited.current = true;
    setForm((f) => ({ ...f, [key]: value }));
    schedule({ [key]: value });
  };

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex gap-3 rounded-lg border border-slate-200 bg-white p-4 ${isDragging ? 'z-10 shadow-lg ring-2 ring-brand-500/30' : ''}`}
    >
      <button type="button" className="mt-7 h-8 cursor-grab touch-none text-slate-400 hover:text-slate-600 active:cursor-grabbing" aria-label={t('Drag to reorder')} {...attributes} {...listeners}>
        <GripVertical className="size-5" />
      </button>
      <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-[1fr_220px]">
        <Field label={`${index + 1}. ${t('Service name')}`} required error={!form.name.trim() ? t('Required') : null}>
          {(id) => <Input id={id} value={form.name} onChange={set('name')} placeholder={t('e.g. Boiler repair')} autoFocus={!service.name} />}
        </Field>
        <Field label={t('Slug')} hint={`/${form.slug}`}>
          {(id) => <Input id={id} value={form.slug} onChange={set('slug')} />}
        </Field>
        <Field label={t('Short description')} hint={t('Optional: the AI will expand it.')} className="sm:col-span-2">
          {(id) => <Textarea id={id} rows={2} value={form.description} onChange={set('description')} />}
        </Field>
      </div>
      <div className="flex w-24 shrink-0 flex-col items-end justify-between gap-2">
        <div className="flex items-center gap-1">
          <SaveStatus status={status} t={t} />
          <IconButton icon={Trash2} label={t('Delete')} onClick={onRemove} className="hover:text-red-600" />
        </div>
        <Link to="../images" className="block w-24" title={t('Service image (assign it in the Images step)')}>
          {image ? (
            <img src={`/api/images/${image.id}/file`} alt={image.alt_text} className="h-16 w-24 rounded-md object-cover ring-1 ring-slate-200" />
          ) : (
            <span className="flex h-16 w-24 flex-col items-center justify-center rounded-md border border-dashed border-amber-300 bg-amber-50 text-[11px] text-amber-700">
              <ImageOff className="mb-0.5 size-4" />
              {t('No image')}
            </span>
          )}
        </Link>
      </div>
    </li>
  );
}
