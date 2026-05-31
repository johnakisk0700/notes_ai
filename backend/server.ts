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
import { updateProfileName } from "apis/profiles/update-profile-name.js";
import { getOpenAIEphemeralToken } from "apis/transcription/get-openai-ephemeral-token.js";
import { getTranscription } from "apis/transcription/get-transcription.js";
import { deleteUser } from "apis/users/delete-user.js";
import { getWines } from "apis/wines/get-wines.js";
import { getCustomers } from "apis/customers/get-customers.js";
import { getThreads } from "apis/threads/get-threads.js";
import { getThread } from "apis/threads/get-thread.js";
import { deleteThread } from "apis/threads/delete-thread.js";
import { updateToolTransaction } from "apis/threads/update-tool-transaction.js";
import { connectToDatabase } from "clients/mongoose_client";
import { pruneOrphanChatImages } from "services/chat-threads";
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
import uploadChatImage from "./apis/notes/upload-chat-image.js";
import getChatImage from "./apis/notes/get-chat-image.js";
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
  // Chat-thread persistence lives in Mongo. Connect in the background with retry:
  // the API serves immediately (notes + streamed answers work) whether or not Mongo
  // is up, persistence starts once connected, and the driver auto-reconnects on drops.
  // Best-effort throughout — see clients/mongoose_client.ts and services/chat-threads.ts.
  connectToDatabase();

  // Mongo-backed crons must run in a worker (the primary never connects to Mongo), but only ONE
  // worker should run them — pin to worker id 1 so the orphan-image sweep doesn't fan out across
  // every worker. The sweep itself is idempotent + fail-safe, so a duplicate run would be harmless.
  if (cluster.worker?.id === 1) {
    cron.schedule("30 3 * * *", () => void pruneOrphanChatImages(), {
      name: "prune_orphan_chat_images",
      timezone: "UTC",
    });
  }

  const app = express();

  // Middleware to parse JSON bodies
  app.use(
    cors({
      // Prod is same-origin: the native host nginx serves the SPA and proxies /api
      // under https://mneme.narusec.io. Localhost entries cover dev (Vite) + local
      // prod test (frontend container on :8081).
      origin: [
        "https://mneme.narusec.io",
        "http://localhost:5173",
        "http://localhost:8081",
      ],
      methods: "GET,POST,PUT,DELETE,OPTIONS",
      allowedHeaders: "Content-Type,Authorization",
      credentials: true,
    })
  );

  // Image uploads get a SMALLER body limit than the global 100mb (which exists for audio).
  // This must run BEFORE the global express.json below: a body parser short-circuits once a
  // body is parsed (req._body), and Express runs middleware in registration order — so the
  // first parser to match wins. Scoped to /api/chat-image, the global parser then no-ops for
  // it. 12mb comfortably covers an 8MB image base64-encoded (~10.7MB) plus JSON overhead.
  app.use("/api/chat-image", express.json({ limit: "12mb" }));

  app.use(
    express.json({ limit: "100mb" }), // 100mb for audio transcription (base64 in JSON body)
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

  app.post("/api/search-notes", verifyJWT, asyncHandler(searchRelevantNotes));
  app.post("/api/store-note", verifyJWT, asyncHandler(storeNote));
  app.post("/api/get-note-title", verifyJWT, asyncHandler(getNoteTitle));
  app.post("/api/delete-note", verifyJWT, asyncHandler(deleteNote));
  app.post("/api/update-note", verifyJWT, asyncHandler(updateNote));

  // Chat image attachments (stored on disk; chat messages carry a reference)
  app.post("/api/chat-image", verifyJWT, asyncHandler(uploadChatImage));
  app.get("/api/chat-image/:id", verifyJWT, asyncHandler(getChatImage));

  // Transcription
  app.post("/api/get-transcription", verifyJWT, asyncHandler(getTranscription));
  app.get("/api/get-openai-ephemeral-token", verifyJWT, asyncHandler(getOpenAIEphemeralToken));

  // Google Voice
  app.post("/api/text-to-voice", verifyJWT, asyncHandler(textToVoice));

  // User Management
  app.get("/api/get-profiles", verifyJWT, queryMiddleware, asyncHandler(getProfiles));
  app.get("/api/get-profile", verifyJWT, asyncHandler(getProfile));
  app.get("/api/get-all-users-notes", verifyJWT, queryMiddleware, asyncHandler(getAllUsersNotes));
  app.post("/api/delete-user", verifyJWT, asyncHandler(deleteUser));
  app.post("/api/update-profile-role", verifyJWT, asyncHandler(updateProfileRole));
  app.post("/api/update-profile-name", verifyJWT, asyncHandler(updateProfileName));
  app.post("/api/create-profile", asyncHandler(createProfile));

  // Editor autocomplete data (wines / customers)
  app.get("/api/get-wines", verifyJWT, asyncHandler(getWines));
  app.get("/api/get-customers", verifyJWT, asyncHandler(getCustomers));

  // AI chat threads (persisted in Mongo)
  app.get("/api/get-threads", verifyJWT, queryMiddleware, asyncHandler(getThreads));
  app.get("/api/get-thread", verifyJWT, asyncHandler(getThread));
  app.post("/api/delete-thread", verifyJWT, asyncHandler(deleteThread));
  app.post("/api/update-tool-transaction", verifyJWT, asyncHandler(updateToolTransaction));

  // always after routes //
  const PORT = process.env.APP_PORT;
  app.use(errorHandler);

  // --- Server: HTTP or HTTPS ---
  // Serve plain HTTP when MODE=dev (no certs in the dev container) OR when
  // BACKEND_TLS=off (prod behind the native nginx, which terminates TLS and proxies
  // to :5100). Serve HTTPS only when terminating TLS directly — reading certs from
  // TLS_KEY_PATH / TLS_CERT_PATH. Keeping TLS off MODE means the dev-auth-bypass
  // (gated on MODE=dev) can never engage while serving HTTP in production.
  const tlsEnabled = process.env.MODE !== "dev" && process.env.BACKEND_TLS !== "off";
  const server = tlsEnabled ? https.createServer(handleHTTPSCertificates(), app) : http.createServer(app);

  server.listen({ port: PORT, reusePort: true }, async () => {
    console.log(`Wine-Assistant Server (${tlsEnabled ? "HTTPS" : "HTTP"}) is running on port: [${PORT}]`);
  });
}

function handleHTTPSCertificates() {
  const keyPath = process.env.TLS_KEY_PATH ?? "/etc/letsencrypt/live/mneme.narusec.io/privkey.pem";
  const certPath = process.env.TLS_CERT_PATH ?? "/etc/letsencrypt/live/mneme.narusec.io/fullchain.pem";
  return { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) };
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
