import { loadAuthConfig } from "./config";
import { createAuthAppFromDatabase } from "./app";

const config = loadAuthConfig();
const { app, pool } = createAuthAppFromDatabase(config);
const server = app.listen(config.port, () => {
  console.log(`AssetFlow auth API listening on http://127.0.0.1:${config.port}/api/v1/auth`);
});

const shutdown = async () => {
  server.close();
  await pool.end();
};

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
