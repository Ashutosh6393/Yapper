import { db } from "@yapper/db";
import { createApp } from "./app";
import { startTrashPurgeScheduler } from "./cron";

const PORT = Number(process.env.API_PORT ?? 4000);

const app = createApp();

// Hourly in-process purge of notes trashed > 24h ago. Started here (not in app.ts) so tests that
// mount the app never spin up a timer.
startTrashPurgeScheduler(db);

app.listen(PORT, () => {
  console.log(`[api] listening on http://localhost:${PORT}`);
});
