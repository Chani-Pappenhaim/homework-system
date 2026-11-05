-- The site name the teacher chose: the brand and the teacher line (null = the defaults).
ALTER TABLE "AppSettings" ADD COLUMN "siteBrandName" TEXT, ADD COLUMN "siteTeacherName" TEXT;
