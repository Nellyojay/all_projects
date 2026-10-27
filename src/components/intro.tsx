import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import ProjectCard from './ProjectCard'

const projects = [
  { name: 'Dice Rounds', published: false, category: 'Games', type: 'Interactive', website: 'https://dicerounds.example.com' },
  { name: 'Hottish', published: true, category: 'Community', type: 'Membership', website: 'https://nellyojay.github.io/hottish' },
  { name: 'Adumun', published: true, category: 'Business', type: 'Platform', website: 'https://nellyojay.github.io/adumun' },
  { name: 'Vumio', published: true, category: 'Entertainment', type: 'Platform', website: 'https://nellyojay.github.io/vuma.com' },
  { name: 'Household Harmony', published: true, category: 'Services', type: 'Form', website: 'https://nellyojay.github.io/householdharmony' },
  { name: 'MULIMA', published: true, category: 'Commerce', type: 'Marketplace', website: 'https://nellyojay.github.io/mulima.com' },
  { name: 'My Web Profile', published: false, category: 'Personal', type: 'Portfolio', website: 'https://mywebprofile.example.com' },
  { name: 'Okello CPA Portal', published: true, category: 'Finance', type: 'Client portal', website: 'https://nellyojay.github.io/cpa-with-okello' },
  { name: 'Owenstore', published: true, category: 'Commerce', type: 'Record Keeping', website: 'https://nellyojay.github.io/owenstore' },
  { name: 'Requisition', published: false, category: 'Tools', type: 'Form', website: 'https://requisition.example.com' },
  { name: 'MyStickyNote', published: true, category: 'Personal', type: 'Note-taking', website: 'https://nellyojay.github.io/mystickynote' },
  { name: 'The Soundz', published: false, category: 'Entertainment', type: 'Events', website: 'https://thesoundz.example.com' },
]

const filters = ['All', 'Commerce', 'Community', 'Education', 'Finance', 'Games', 'Personal', 'Services', 'Tools']

function SearchIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="size-4">
      <circle cx="8.8" cy="8.8" r="5.8" stroke="currentColor" strokeWidth="1.5" />
      <path d="m13.2 13.2 3.3 3.3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function Intro() {
  const navigate = useNavigate()
  const [activeFilter, setActiveFilter] = useState('All')
  const [query, setQuery] = useState('')

  const visibleProjects = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    return projects
      .filter((project) => {
        const matchesCategory = activeFilter === 'All' || project.category === activeFilter
        const matchesQuery =
          normalizedQuery.length === 0 ||
          `${project.name} ${project.category} ${project.type}`.toLowerCase().includes(normalizedQuery)

        return matchesCategory && matchesQuery
      })
      .sort((first, second) => first.name.localeCompare(second.name))
  }, [activeFilter, query])

  return (
    <main className="relative min-h-screen bg-background text-foreground">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-linear-to-b from-primary-soft/30 to-transparent" />

      <div className="relative pb-10">
        <header className="sticky top-0 z-10 border-b border-border py-2 backdrop-blur-3xl">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
            <a
              href="#/"
              className="flex items-center gap-3"
              aria-label="Project index home"
            >
              <span className="grid size-9 place-items-center rounded-lg border border-primary-dark bg-primary-soft">
                <span className="size-2.5 rotate-45 border border-primary-light bg-primary/30" />
              </span>
              <span className="text-sm font-semibold tracking-[0.16em] text-foreground">PROUD.DEV</span>
            </a>
            <button
              type="button"
              onClick={() => navigate('/space')}
              className="rounded-md text-xs border border-border-strong bg-surface px-2 py-2 font-mono font-semibold uppercase tracking-wider transition hover:border-primary-dark hover:bg-surface-hover"
            >
              Enter my space
            </button>
          </div>
        </header>

        <div className="px-4 sm:px-6 lg:px-8 mx-auto max-w-7xl">
          <section className="py-6">
            <div className="font-mono text-[11px] uppercase tracking-[0.24em] text-primary/80">
              <span className="mr-2 text-muted">01 //</span> Personal web archive
            </div>
            <div className="mt-8 grid gap-8 lg:grid-cols-2 lg:items-end">
              <div>
                <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-foreground sm:text-6xl">
                  A universe of
                  <span className="pb-4 block bg-linear-to-r from-primary-light to-secondary bg-clip-text text-transparent">things I built.</span>
                </h1>
              </div>
              <div className="flex gap-8 border-l border-border pl-6 lg:mb-1">
                <div>
                  <p className="font-mono text-3xl text-foreground">{String(projects.length).padStart(2, '0')}</p>
                  <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.16em] text-muted">Projects</p>
                </div>
                <div>
                  <p className="font-mono text-3xl text-foreground">{String(new Set(projects.map((project) => project.category)).size).padStart(2, '0')}</p>
                  <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.16em] text-muted">Categories</p>
                </div>
              </div>
            </div>
          </section>

          <section aria-label="Project directory">
            <div className="flex flex-col gap-5 border-y border-border py-5 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex gap-2 overflow-x-auto pb-1 lg:flex-wrap lg:pb-0">
                {filters.map((filter) => (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => setActiveFilter(filter)}
                    aria-pressed={activeFilter === filter}
                    className={`shrink-0 rounded-md border px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider transition ${activeFilter === filter
                      ? 'border-primary-dark bg-primary-soft text-primary-light'
                      : 'border-border text-muted hover:border-border-strong hover:text-foreground'
                      }`}
                  >
                    {filter}
                  </button>
                ))}
              </div>

              <label className="flex h-10 w-full items-center gap-2.5 rounded-md border border-border bg-surface px-3 text-muted focus-within:border-primary-dark lg:max-w-xs">
                <SearchIcon />
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Find a project..."
                  className="min-w-0 flex-1 bg-transparent font-mono text-xs text-foreground outline-none placeholder:text-muted"
                />
                <span className="font-mono text-[9px] text-muted">/</span>
              </label>
            </div>

            <div className="mb-4 mt-6 flex items-center justify-between font-mono text-[10px] uppercase tracking-wider text-muted">
              <span>Directory / {activeFilter}</span>
              <span>{String(visibleProjects.length).padStart(2, '0')} results</span>
            </div>

            {visibleProjects.length > 0 ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {visibleProjects.map((project, index) => (
                  <ProjectCard
                    key={project.name}
                    {...project}
                    number={index + 1}
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-border-strong px-6 py-16 text-center">
                <p className="text-sm text-muted">No projects match that search.</p>
                <button
                  type="button"
                  onClick={() => {
                    setQuery('')
                    setActiveFilter('All')
                  }}
                  className="mt-3 font-mono text-xs text-primary hover:text-primary-light"
                >
                  Clear filters
                </button>
              </div>
            )}
          </section>
        </div>

        <footer
          className="mt-12 flex flex-col gap-2 border-t border-border pt-5 font-mono text-[9px] uppercase tracking-wider text-muted sm:flex-row sm:items-center sm:justify-between "
        >
          <div className="mx-auto max-w-7xl">
            <span>PROUD.DEV<span className="px-1 text-subtle">/</span>PERSONAL WEB ARCHIVE</span>
          </div>
        </footer>
      </div>
    </main>
  )
}

export default Intro
