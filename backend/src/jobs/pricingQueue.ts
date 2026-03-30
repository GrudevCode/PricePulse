import { Queue, Worker, Job } from 'bullmq';
import { runPricingEngine } from '../services/claudePricingEngine';
import { getDb, schema } from '../db';

const QUEUE_NAME = 'pricing-engine';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// BullMQ bundles its own ioredis — pass URL string config directly
function getConnectionConfig() {
  const url = new URL(REDIS_URL);
  return {
    host: url.hostname,
    port: parseInt(url.port || '6379'),
    password: url.password || undefined,
    db: url.pathname ? parseInt(url.pathname.slice(1)) || 0 : 0,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  };
}

let queue: Queue | null = null;
let worker: Worker | null = null;

export function getPricingQueue(): Queue {
  if (!queue) {
    queue = new Queue(QUEUE_NAME, {
      connection: getConnectionConfig(),
      defaultJobOptions: {
        removeOnComplete: 50,
        removeOnFail: 100,
        attempts: 2,
        backoff: { type: 'exponential', delay: 5000 },
      },
    });
  }
  return queue;
}

export function startPricingWorker(): Worker {
  if (!worker) {
    worker = new Worker(
      QUEUE_NAME,
      async (job: Job) => {
        const { venueId, manualTrigger } = job.data as { venueId: string; manualTrigger: boolean };
        console.log(`[Queue] Processing pricing job for venue ${venueId}`);
        await runPricingEngine(venueId, manualTrigger);
      },
      {
        connection: getConnectionConfig(),
        concurrency: 3,
      }
    );

    worker.on('completed', (job) => {
      console.log(`[Queue] Job ${job.id} completed for venue ${job.data.venueId}`);
    });

    worker.on('failed', (job, err) => {
      console.error(`[Queue] Job ${job?.id} failed:`, err.message);
    });
  }
  return worker;
}

export async function scheduleVenuePricingJobs(): Promise<void> {
  const db = getDb();
  const allVenues = await db.query.venues.findMany();
  const q = getPricingQueue();

  const existingJobs = await q.getRepeatableJobs();
  for (const job of existingJobs) {
    await q.removeRepeatableByKey(job.key);
  }

  for (const venue of allVenues) {
    await q.add(
      `pricing-${venue.id}`,
      { venueId: venue.id, manualTrigger: false },
      {
        repeat: { every: 60000 },
        jobId: `recurring-${venue.id}`,
      }
    );
    console.log(`[Queue] Scheduled pricing job for venue: ${venue.name}`);
  }
}

export async function addVenueToSchedule(venueId: string): Promise<void> {
  const q = getPricingQueue();
  await q.add(
    `pricing-${venueId}`,
    { venueId, manualTrigger: false },
    {
      repeat: { every: 60000 },
      jobId: `recurring-${venueId}`,
    }
  );
}

export async function triggerImmediatePricing(venueId: string): Promise<void> {
  const q = getPricingQueue();
  await q.add(
    `pricing-manual-${venueId}`,
    { venueId, manualTrigger: true },
    { priority: 1 }
  );
}
