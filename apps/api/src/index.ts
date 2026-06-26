import { createApp } from "./app";

const PORT = Number(process.env.API_PORT ?? 4000);

const app = createApp();

app.listen(PORT, () => {
  console.log(`[api] listening on http://localhost:${PORT}`);
});
