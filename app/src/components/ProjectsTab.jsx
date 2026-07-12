import { useState } from 'react'
import { Plus } from 'lucide-react'
import { ProjectCard } from './ProjectCard.jsx'

export function ProjectsTab({ projects, tasks, onOpenProject, onCreateProject }) {
  const [showArchived, setShowArchived] = useState(false)

  const visible = projects.filter((p) => (showArchived ? true : !p.archived))

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <label className="flex items-center gap-1.5 text-xs text-gray-500">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          Mostrar archivados
        </label>
        <button
          type="button"
          onClick={onCreateProject}
          className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
        >
          <Plus size={15} />
          Nuevo proyecto
        </button>
      </div>

      {visible.length === 0 ? (
        <div className="flex h-48 flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 text-gray-400">
          <p className="text-sm">Aún no hay proyectos.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((project) => (
            <ProjectCard key={project.id} project={project} tasks={tasks} onOpen={() => onOpenProject(project)} />
          ))}
        </div>
      )}
    </div>
  )
}
