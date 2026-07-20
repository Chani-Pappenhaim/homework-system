/*
  Warnings:

  - You are about to drop the column `score` on the `Grade` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Grade" DROP COLUMN "score",
ADD COLUMN     "contentScore" DOUBLE PRECISION,
ADD COLUMN     "submissionScore" DOUBLE PRECISION;
