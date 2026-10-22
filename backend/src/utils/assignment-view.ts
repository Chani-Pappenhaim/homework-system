/** Loads the ids of the lesson files an assignment's AI review relies on, for `assignmentForViewer`. */
export const AI_REFERENCE_FILES_INCLUDE = {
  aiReferenceFiles: { select: { id: true }, orderBy: { uploadedAt: 'asc' } },
} as const;

interface AssignmentRow {
  aiInstructions?: string | null;
  aiReferenceFiles?: { id: string }[];
}

/**
 * An assignment as the given role may see it. The teacher gets the files the AI
 * review relies on as plain ids; a student gets neither them nor the teacher's
 * private prompt to the AI.
 */
export function assignmentForViewer<T extends AssignmentRow>(assignment: T, role: string) {
  const { aiInstructions, aiReferenceFiles, ...rest } = assignment;
  if (role !== 'ADMIN') return rest;
  return { ...rest, aiInstructions, aiReferenceFileIds: (aiReferenceFiles ?? []).map((f) => f.id) };
}
