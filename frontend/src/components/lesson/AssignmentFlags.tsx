import { Badge } from '@/components/ui/badge';

/**
 * The badges of an assignment's settings: "hidden" shows only to the teacher
 * (students never receive a hidden assignment), "optional" to everyone.
 */
export function AssignmentFlags({ hidden, optional }: { hidden?: boolean; optional?: boolean }) {
  if (!hidden && !optional) return null;
  return (
    <>
      {hidden && <Badge variant="warning">מוסתרת</Badge>}
      {optional && <Badge variant="muted">רשות</Badge>}
    </>
  );
}
