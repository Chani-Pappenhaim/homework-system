-- The name the teacher chose for the emails students get (null = BREVO_SENDER_NAME).
ALTER TABLE "AppSettings" ADD COLUMN "emailSenderName" TEXT;
