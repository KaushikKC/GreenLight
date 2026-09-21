import { eq } from "drizzle-orm";
import { z } from "zod";

import { db, schema } from "@/db";

export const createJobInput = z.object({
  type: z.enum(schema.jobType.enumValues),
  refId: z.uuid().optional(),
});
export type CreateJobInput = z.infer<typeof createJobInput>;

export type Job = typeof schema.jobs.$inferSelect;

/** Public shape returned by the API. Hides worker-internal fields. */
export function toJobDto(job: Job) {
  return {
    id: job.id,
    type: job.type,
    refId: job.refId,
    status: job.status,
    attempts: job.attempts,
    error: job.error,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
  };
}
export type JobDto = ReturnType<typeof toJobDto>;

export async function createJob(input: CreateJobInput): Promise<Job> {
  const [job] = await db
    .insert(schema.jobs)
    .values({ type: input.type, refId: input.refId })
    .returning();
  return job;
}

export async function getJob(id: string): Promise<Job | undefined> {
  const [job] = await db
    .select()
    .from(schema.jobs)
    .where(eq(schema.jobs.id, id))
    .limit(1);
  return job;
}

export async function listRecentJobs(limit = 10): Promise<Job[]> {
  return db.query.jobs.findMany({
    orderBy: (jobs, { desc }) => [desc(jobs.createdAt)],
    limit,
  });
}
