export interface ScheduledJob {
  name: string;
  run(now?: Date): Promise<{ processed: number }>;
}

export const overdueDetectionJob: ScheduledJob = {
  name: "overdue-allocation-detection",
  async run() {
    return { processed: 0 };
  },
};

