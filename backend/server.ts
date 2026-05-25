import { deleteNote } from "apis/notes/delete-note";
import { getAllUsersNotes } from "apis/notes/get-all-users-notes.js";
import { getNoteAdmin } from "apis/notes/get-note-admin.js";
import { getNoteTitle } from "apis/notes/get-note-title";
import { getNote } from "apis/notes/get-note.js";
import { getNotes } from "apis/notes/get-notes";
import { updateNote } from "apis/notes/update-note";
import { createProfile } from "apis/profiles/create-profile.js";
import { getProfile } from "apis/profiles/get-profile.js";
import { getProfiles } from "apis/profiles/get-profiles.js";
import { updateProfileRole } from "apis/profiles/update-profile-role.js";
import { getReminders } from "apis/reminders/get-reminders";
import { getOpenAIEphemeralToken } from "apis/transcription/get-openai-ephemeral-token.js";
import { getTranscription } from "apis/transcription/get-transcription.js";
import { updateUser } from "apis/users/updateUser";
import { connectToDatabase } from "clients/mongoose_client";
import { textToVoice } from "clients/text_to_voice";
import cors from "cors";
import express from "express/index";
import http from "node:http";
import https from "https";
import { costMiddleware } from "middleware/costMiddleware.js";
import { createQueryMiddleware } from "middleware/createQueryMiddleware";
import cron from "node-cron";
import cluster from "node:cluster";
import fs from "node:fs";
import { cpus } from "node:os";
import { getLatestUsdToEurRate } from "utils/ecbConversionRates.js";
import { logger } from "utils/logger.js";
import searchRelevantNotes from "./apis/notes/search-relevant-notes.js";
import { storeNote } from "./apis/notes/store-note.js";
import { verifyJWT } from "./authentication/verifyJWT.js";
import { errorHandler } from "./middleware/common/errorHandler.js";
import { timeLogger } from "./middleware/timeMiddleware.js";
import { asyncHandler } from "./utils/asyncHandler.js";
import { clerkMiddleware } from "@clerk/express";

// override console methods to use logger so we will have consistent logging
console.log = (...args) => logger.info(args.join(" "));
console.error = (...args) => logger.error(args.join(" "));
console.warn = (...args) => logger.warn(args.join(" "));
console.debug = (...args) => logger.debug(args.join(" "));

if (cluster.isPrimary) {
  console.log(`Primary ${process.pid} is running`);

  // Start N workers for the number of CPUs
  for (let i = 0; i < cpus().length / 2; i++) {
    cluster.fork();
  }

  setupCronJobs();

  cluster.on("exit", (worker, code, signal) => {
    console.log(`Worker ${worker.process.pid} exited`);
  });
} else {
  // await connectToDatabase();

  const app = express();

  // Middleware to parse JSON bodies
  app.use(
    cors({
      origin: [
        "https://mysert.com",
        "https://mysert.com:80",
        "http://168.231.104.96:42096",
        "http://168.231.104.96",
        "http://168.231.104.96:80",
        "http://localhost:8080",
        "http://localhost:8081",
        "http://localhost:5173",
      ],
      methods: "GET,POST,PUT,DELETE,OPTIONS",
      allowedHeaders: "Content-Type,Authorization",
      credentials: true,
    }),
    express.json({ limit: "100mb" }), // Move this here with limit
    express.urlencoded({ limit: "100mb", extended: true }),
    express.raw({ limit: "100mb", type: "audio/*" })
  );

  app.use(timeLogger);
  app.use(costMiddleware);
  app.use(clerkMiddleware());

  // Default Pagination and Ordering Middleware
  const queryMiddleware = createQueryMiddleware({
    defaultSort: [{ field: "created_at", direction: "DESC" }],
    maxLimit: 250,
  });

  // Notes
  app.get("/api/get-notes", verifyJWT, queryMiddleware, asyncHandler(getNotes));
  app.get("/api/get-note", verifyJWT, asyncHandler(getNote));
  app.get("/api/get-note-admin", verifyJWT, asyncHandler(getNoteAdmin));
  app.get(
    "/api/get-reminders",
    verifyJWT,
    queryMiddleware,
    asyncHandler(getReminders)
  );

  app.post("/api/search-notes", verifyJWT, asyncHandler(searchRelevantNotes));
  app.post("/api/store-note", verifyJWT, asyncHandler(storeNote));
  app.post("/api/get-note-title", verifyJWT, asyncHandler(getNoteTitle));
  app.post("/api/delete-note", verifyJWT, asyncHandler(deleteNote));
  app.post("/api/update-note", verifyJWT, asyncHandler(updateNote));

  // Transcription
  app.post("/api/get-transcription", verifyJWT, asyncHandler(getTranscription));
  app.get(
    "/api/get-openai-ephemeral-token",
    verifyJWT,
    asyncHandler(getOpenAIEphemeralToken)
  );

  // Google Voice
  app.post("/api/text-to-voice", verifyJWT, asyncHandler(textToVoice));

  // User Management
  app.get(
    "/api/get-profiles",
    verifyJWT,
    queryMiddleware,
    asyncHandler(getProfiles)
  );
  app.get("/api/get-profile", verifyJWT, asyncHandler(getProfile));
  app.get(
    "/api/get-all-users-notes",
    verifyJWT,
    queryMiddleware,
    asyncHandler(getAllUsersNotes)
  );
  app.post("/api/update-user", verifyJWT, asyncHandler(updateUser));
  app.post(
    "/api/update-profile-role",
    verifyJWT,
    asyncHandler(updateProfileRole)
  );
  app.post("/api/create-profile", asyncHandler(createProfile));

  // always after routes //
  const PORT = process.env.APP_PORT;
  app.use(errorHandler);

  // --- Server: plain HTTP in dev (no TLS certs in container), HTTPS in prod ---
  const isDev = process.env.MODE === "dev";
  const server = isDev
    ? http.createServer(app)
    : https.createServer(handleHTTPSCertificates(), app);

  server.listen({ port: PORT, reusePort: true }, async () => {
    console.log(
      `Wine-Assistant Server (${isDev ? "HTTP" : "HTTPS"}) is running on port: [${PORT}]`
    );
  });
}

function handleHTTPSCertificates() {
  return {
    key:
      process.env.MODE !== "dev"
        ? fs.readFileSync("/etc/letsencrypt/live/www.mysert.com/privkey.pem")
        : "",
    cert:
      process.env.MODE !== "dev"
        ? fs.readFileSync("/etc/letsencrypt/live/www.mysert.com/fullchain.pem")
        : "",
  };
}

function setupCronJobs() {
  // Schedule cron job to run at 2:00 AM every day
  // Format: "0 2 * * *" = At 02:00 (2:00 AM)

  cron.schedule("0,15,27,45 * * * *", async () => getLatestUsdToEurRate(), {
    name: "get_ECB_conversion_rates",
    timezone: "UTC",
  });

  logger.info("Registered recurring jobs successfully");
}
