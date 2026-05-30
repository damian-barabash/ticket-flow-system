import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { TopBar } from '../components/TopBar'
import { ProjectFormModal } from '../components/ProjectFormModal'
import { Spinner, EmptyState } from '../components/ui'
import { Tour } from '../components/Tour'

function ProjectCard({ project, index, counts, onOpen, tour }) {
  const open = counts?.open ?? 0
  const done = counts?.done ?? 0
  return (
    <button
      onClick={onOpen}
      data-tour={tour ? 'project-card' : undefined}
      className="group brackets relative flex flex-col overflow-hidden border border-line bg-surface text-left transition-colors hover:border-line2"
    >
      <div className="relative aspect-[16/9] w-full overflow-hidden bg-surface2">
        {project.cover_url ? (
          <img
            src={project.cover_url}
            alt=""
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="dotgrid h-full w-full" />
        )}
        <span className="absolute left-3 top-3 label bg-bg/70 px-1.5 py-0.5">
          № {String(index + 1).padStart(2, '0')}
        </span>
      </div>

      <div className="flex flex-1 flex-col p-5">
        <h3 className="text-[15px] font-medium text-ink">{project.name}</h3>
        {project.description && (
          <p className="mt-1.5 line-clamp-2 text-xs text-faint">{project.description}</p>
        )}
        <div className="mt-4 flex items-center gap-4 border-t border-line pt-3">
          <span className="flex items-center gap-1.5 label">
            <span className="inline-block h-1.5 w-1.5 bg-accent" />
            {open} открыто
          </span>
          <span className="flex items-center gap-1.5 label">
            <span className="inline-block h-1.5 w-1.5 bg-ok" />
            {done} готово
          </span>
        </div>
      </div>
    </button>
  )
}

export default function Projects() {
  const { isAdmin } = useAuth()
  const navigate = useNavigate()
  const [projects, setProjects] = useState([])
  const [counts, setCounts] = useState({})
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { data: projs } = await supabase
      .from('projects')
      .select('id, name, description, cover_url, created_at, archived')
      .eq('archived', false)
      .order('created_at', { ascending: false })

    const list = projs ?? []
    setProjects(list)

    // ticket counts per project (RLS already scopes to visible tickets)
    const { data: tix } = await supabase.from('tickets').select('project_id, status')
    const map = {}
    for (const t of tix ?? []) {
      const c = (map[t.project_id] ??= { open: 0, done: 0 })
      if (t.status === 'done' || t.status === 'rejected') c.done++
      else c.open++
    }
    setCounts(map)
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="min-h-screen">
      <TopBar />

      <main className="mx-auto max-w-[1320px] px-6 py-10">
        <div className="mb-9 flex items-end justify-between gap-4">
          <div>
            <span className="label">Каталог · MMXXVI</span>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink">
              Проекты
            </h1>
            <p className="mt-1.5 text-sm text-faint">
              {isAdmin
                ? 'Управляйте проектами, клиентами и тикетами'
                : 'Ваши проекты и тикеты по ним'}
            </p>
          </div>
          {isAdmin && (
            <button onClick={() => setShowForm(true)} data-tour="new-project" className="btn-solid">
              + Новый проект
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center py-24">
            <Spinner className="h-6 w-6" />
          </div>
        ) : projects.length === 0 ? (
          <EmptyState
            title="Пока нет проектов"
            hint={
              isAdmin
                ? 'Создайте первый проект, чтобы начать принимать тикеты.'
                : 'Администратор ещё не добавил вас в проекты.'
            }
          >
            {isAdmin && (
              <button onClick={() => setShowForm(true)} className="btn-ghost">
                + Новый проект
              </button>
            )}
          </EmptyState>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((p, i) => (
              <ProjectCard
                key={p.id}
                project={p}
                index={i}
                tour={i === 0}
                counts={counts[p.id]}
                onOpen={() => navigate(`/projects/${p.id}`)}
              />
            ))}
          </div>
        )}
      </main>

      <ProjectFormModal open={showForm} onClose={() => setShowForm(false)} onSaved={load} />

      {!loading && (
        <Tour
          storageKey={isAdmin ? 'projects-admin' : 'projects-client'}
          steps={
            isAdmin
              ? [
                  {
                    title: 'Добро пожаловать в Ticket Flow',
                    text: 'Здесь вы ведёте проекты и тикеты клиентов. Пройдём за 20 секунд.',
                  },
                  {
                    target: '[data-tour="new-project"]',
                    title: 'Создайте проект',
                    text: 'Жми сюда, чтобы добавить проект и поставить ему обложку.',
                  },
                  {
                    target: '[data-tour="users"]',
                    title: 'Добавьте клиентов',
                    text: 'В разделе «Пользователи» заводите клиентов и привязывайте их к проектам.',
                  },
                ]
              : [
                  {
                    title: 'Добро пожаловать 👋',
                    text: 'Здесь ваши проекты. Внутри проекта вы создаёте тикеты — что нужно поправить или добавить.',
                  },
                  projects.length > 0 && {
                    target: '[data-tour="project-card"]',
                    title: 'Откройте проект',
                    text: 'Жми сюда, чтобы зайти в проект и увидеть тикеты по нему.',
                  },
                ].filter(Boolean)
          }
        />
      )}
    </div>
  )
}
