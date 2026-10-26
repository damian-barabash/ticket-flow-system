// Route chunk loaders shared by React.lazy and hover-prefetch, so hovering a
// project card downloads the board chunk before the click lands.
export const loadProjectDetail = () => import('../pages/ProjectDetail')
export const loadCalendar = () => import('../pages/Calendar')

const done = new Set()
export function prefetch(loader) {
  if (done.has(loader)) return
  done.add(loader)
  loader().catch(() => done.delete(loader))
}
