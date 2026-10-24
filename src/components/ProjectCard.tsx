type ProjectCardProps = {
  name: string
  category: string
  type: string
  website: string
  number: number
}

function ProjectCard({ name, category, type, website, number }: ProjectCardProps) {
  return (
    <a
      href={website}
      target="_blank"
      rel="noreferrer"
      className="group flex min-h-36 flex-col justify-between rounded-lg border border-slate-800 bg-slate-900 p-4 transition hover:border-cyan-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300 sm:min-h-40 sm:p-5"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-mono text-[10px] tracking-wider text-slate-600">
          NODE_{String(number).padStart(2, '0')}
        </span>
        <span className="rounded border border-slate-700 px-2 py-1 font-mono text-[9px] uppercase tracking-wider text-slate-500">
          {category}
        </span>
      </div>

      <div className="mt-6 flex items-end justify-between gap-3 sm:mt-7">
        <div className="min-w-0">
          <h2 className="wrap-break-word text-sm font-medium tracking-tight text-slate-100 group-hover:text-cyan-100 sm:text-base">
            {name}
          </h2>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-slate-600">
            {type}
          </p>
        </div>
        <span className="grid size-8 shrink-0 place-items-center rounded-md border border-slate-700 text-slate-500 group-hover:border-cyan-700 group-hover:text-cyan-200">
          <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="size-4">
            <path
              d="M4.5 10h11m0 0-4.5-4.5M15.5 10 11 14.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </div>
    </a>
  )
}

export default ProjectCard
