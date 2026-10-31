import type { Prisma } from '@prisma/client';

/** Loads the ids of the lesson files an assignment's AI review relies on, for `assignmentForViewer`. */
export const AI_REFERENCE_FILES_INCLUDE = {
  aiReferenceFiles: { select: { id: true }, orderBy: { uploadedAt: 'asc' } },
} as const;

/** The order a lesson's assignments are shown in: the order the teacher added them. */
export const ASSIGNMENT_ORDER: Prisma.AssignmentOrderByWithRelationInput[] = [{ createdAt: 'asc' }, { id: 'asc' }];

/** The assignments a student may see: the ones the teacher has not hidden. */
export const VISIBLE_ASSIGNMENT = { hidden: false } as const;

/** Narrows an assignment query to what the given role may see; the teacher sees them all. */
export function assignmentsVisibleTo(role: string): Prisma.AssignmentWhereInput {
  return role === 'ADMIN' ? {} : VISIBLE_ASSIGNMENT;
}

/** Assignments a student is expected to hand in: shown to her and not optional. */
export const MANDATORY_ASSIGNMENT = { hidden: false, optional: false } as const;

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
