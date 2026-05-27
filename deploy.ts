#!/usr/bin/env bun
import { $ } from "bun";
import chalk from "chalk";
import boxen from "boxen";
import logUpdate from "log-update";

// ── Deploy ───────────────────────────────────────────────────────────────────
// Native host nginx (TLS + SPA + /api proxy) in front of a Dockerized backend +
// data services. Full runbook + one-time VM prerequisites: docs/deployment.md.
//
//   bun deploy.ts eu        full deploy: build the SPA, sync repo + build to the VM,
//                           bring up the Docker stack (migrations run automatically).
//   bun deploy.ts backend   fast path: sync backend/shared, rebuild + restart the
//                           backend container (also reruns pending migrations).
//
// Secrets (backend/.env — Clerk/OpenRouter/… keys) live ON THE VM and are never
// rsynced (see .rsyncignore). The Clerk *publishable* key is baked into the SPA
// build below (public by design) — set the Clerk *production* key for prod.

const PROJECT_ROOT = process.env.PROJECT_ROOT || process.cwd();
const FRONTEND_PATH = `${PROJECT_ROOT}/frontend`;
const COMPOSE = "docker compose -f docker-compose.yml -f docker-compose.prod.yml";

// Frontend build-time config (Vite inlines VITE_*; api.ts reads VITE_API_PROD_URL).
const VITE_API_PROD_URL = process.env.VITE_API_PROD_URL ?? "https://mneme.narusec.io/api/";
const VITE_CLERK_PUBLISHABLE_KEY = process.env.VITE_CLERK_PUBLISHABLE_KEY ?? "";

type Target = { remote: string; vm_title: string; remoteRoot: string };

const NOTES_EU: Target = {
  remote: "root@168.231.104.96",
  vm_title: "mneme.narusec.io (Production)",
  remoteRoot: "/home/notes-assistant",
};

async function deployFull(t: Target) {
  try {
    if (!VITE_CLERK_PUBLISHABLE_KEY) {
      console.warn(
        chalk.yellow(
          "⚠️  VITE_CLERK_PUBLISHABLE_KEY is empty — the SPA will throw 'Missing Publishable Key'.\n" +
            "   Set the Clerk production publishable key before deploying (see docs/deployment.md)."
        )
      );
    }

    await runStep("1/5", t, "Building frontend (Vite, prod env).", ["bun", "run", "build"], FRONTEND_PATH, {
      VITE_API_PROD_URL,
      VITE_CLERK_PUBLISHABLE_KEY,
    });

    await runStep("2/5", t, "Syncing repo to VM.", [
      "rsync",
      "-az",
      "--delete-after",
      `--exclude-from=${PROJECT_ROOT}/.rsyncignore`,
      "./",
      `${t.remote}:${t.remoteRoot}/`,
    ]);

    await runStep("3/5", t, "Syncing SPA build to the nginx root.", [
      "rsync",
      "-az",
      "--delete-after",
      "frontend/dist/",
      `${t.remote}:${t.remoteRoot}/gui/`,
    ]);

    await runStep("4/5", t, "Building + starting the Docker stack (runs migrations).", [
      "ssh",
      t.remote,
      `"cd ${t.remoteRoot} && ${COMPOSE} up -d --build"`,
    ]);

    await runStep("5/5", t, "Pruning dangling images.", ["ssh", t.remote, `"docker image prune -f"`]);

    done(t);
  } catch {
    /* runStep already rendered the failure box */
  }
}

async function deployBackendOnly(t: Target) {
  try {
    await runStep("1/3", t, "Syncing backend + shared to VM.", [
      "rsync",
      "-az",
      `--exclude-from=${PROJECT_ROOT}/.rsyncignore`,
      "backend",
      "shared",
      "docker-compose.yml",
      "docker-compose.prod.yml",
      "package.json",
      "bun.lock",
      "tsconfig.json",
      "qdrant_config.yaml",
      `${t.remote}:${t.remoteRoot}/`,
    ]);

    await runStep("2/3", t, "Rebuilding + restarting backend (reruns migrations).", [
      "ssh",
      t.remote,
      `"cd ${t.remoteRoot} && ${COMPOSE} up -d --build backend"`,
    ]);

    await runStep("3/3", t, "Pruning dangling images.", ["ssh", t.remote, `"docker image prune -f"`]);

    done(t);
  } catch {
    /* runStep already rendered the failure box */
  }
}

async function runStep(
  stepNumber: string,
  t: Target,
  title: string,
  cmd: string[],
  cwd: string = PROJECT_ROOT,
  env?: Record<string, string>
) {
  const command = cmd.join(" ");
  const stepLog = `[${stepNumber}]`;
  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  let index = 0;

  const logInterval = setInterval(() => {
    const frame = frames[(index = ++index % frames.length)];
    logUpdate(
      boxen(`${chalk.magenta(stepLog)} ${title}\ncwd: ${chalk.dim(cwd)}\n${chalk.dim(command)}`, {
        title: `${t.vm_title} ${frame}`,
        borderStyle: "round",
        borderColor: "magenta",
        padding: 0.5,
      })
    );
  }, 80);

  try {
    const shell = $`${{ raw: command }}`.cwd(cwd).quiet();
    await (env ? shell.env({ ...process.env, ...env }) : shell);
  } catch (error: any) {
    logUpdate(
      boxen(
        `${chalk.red(stepLog)} ${title}\ncwd: ${chalk.dim(cwd)}\n${chalk.dim(command)}\n\n${error}\n${
          error.stderr?.toString()?.trim() || "No extra info provided."
        }`,
        { title: `${t.vm_title} ✗`, borderStyle: "round", borderColor: "red", padding: 0.5 }
      )
    );
    logUpdate.done();
    throw error;
  } finally {
    clearInterval(logInterval);
  }
}

function done(t: Target) {
  logUpdate(
    boxen(chalk.green("Completed successfully."), {
      title: `${t.vm_title} ✓`,
      borderStyle: "round",
      borderColor: "green",
      padding: 0.5,
    })
  );
  logUpdate.done();
}

(async () => {
  console.clear();
  switch (process.argv[2]) {
    case "backend":
    case "backend-only":
      await deployBackendOnly(NOTES_EU);
      break;
    case "eu":
    case "all":
    default:
      await deployFull(NOTES_EU);
      break;
  }
})();
