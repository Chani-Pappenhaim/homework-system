-- The "excused" status became partial attendance, counted as half an absence. Renaming keeps every existing mark.
ALTER TYPE "AttendanceStatus" RENAME VALUE 'EXCUSED' TO 'PARTIAL';
