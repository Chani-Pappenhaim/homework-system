// Email payload types live with the queue definitions (single source of truth);
// re-exported here so the email module has a local, intention-revealing import.
export type {
  EmailJobMap,
  EmailJobName,
  EmailJobData,
  DeadlineReportRow,
} from '../infrastructure/queues/job-types';
