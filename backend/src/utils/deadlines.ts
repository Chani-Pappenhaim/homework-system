/**
 * A deadline carried over from a copied lesson or course: kept while it is
 * still ahead, dropped once it passed (copying last year's course must not
 * create assignments that are already overdue). The teacher sets a new one.
 */
export function upcomingDeadline(deadline: Date | null | undefined): Date | null {
  return deadline && deadline.getTime() >= Date.now() ? deadline : null;
}

/** How many of these deadlines a copy drops, so the teacher can be told. */
export function countPastDeadlines(items: { deadline?: Date | null }[]): number {
  return items.filter((a) => a.deadline && !upcomingDeadline(a.deadline)).length;
}
