#!/usr/bin/env bun
import { $ } from "bun";
import chalk from "chalk";
import boxen from "boxen";
import logUpdate from "log-update";

const PROJECT_ROOT = process.env.PROJECT_ROOT || process.cwd();
const GUI_PATH = `${PROJECT_ROOT}/frontend`;
const BACKEND_PATH = `${PROJECT_ROOT}/backend`;
const DB_PATH = `${PROJECT_ROOT}/shared`;

async function deploy_default({
  remote,
  vm_title,
  suffix,
}: {
  remote: string;
  vm_title: string;
  suffix: string;
}) {
  const REMOTE_ROOT = `${remote}:/home/notes-assistant`;
  try {
    // GUI
    await runStep(
      "1/7",
      vm_title,
      "Installing GUI dependencies.",
      ["bun i"],
      GUI_PATH
    );

    await runStep(
      "2/7",
      vm_title,
      "Building GUI.",
      ["bun", "run", `build-${suffix}`],
      GUI_PATH
    );

    // Pushes
    await runStep(
      "3/7",
      vm_title,
      "Updating GUI.",
      [
        "rsync",
        "-av",
        `--exclude-from=${PROJECT_ROOT}/.rsyncignore`,
        "dist/",
        `${REMOTE_ROOT}/gui`,
      ],
      GUI_PATH
    );

    await runStep(
      "4/7",
      vm_title,
      "Updating backend files.",
      [
        "rsync",
        "-av",
        `--exclude-from=${PROJECT_ROOT}/.rsyncignore`,
        "./",
        `${REMOTE_ROOT}/backend/`,
      ],
      BACKEND_PATH
    );

    await runStep(
      "5/7",
      vm_title,
      "Updating shared files.",
      [
        "rsync",
        "-av",
        `--exclude-from=${PROJECT_ROOT}/.rsyncignore`,
        "./",
        `${REMOTE_ROOT}/shared/`,
      ],
      DB_PATH
    );

    // Remote Commands
    await runStep(
      "6/7",
      vm_title,
      "Running migrations",
      [
        "ssh",
        remote,
        `"cd /home/notes-assistant/shared && bun i && bun drizzle-kit push"`,
      ],
      PROJECT_ROOT
    );

    // Remote Commands
    await runStep(
      "7/7",
      vm_title,
      "Installing dependencies, building and restarting server.",
      [
        "ssh",
        remote,
        `"cd /home/notes-assistant/backend && bun install && bun run build && pm2 delete notes-server-${suffix} || true && pm2 start 'bun start' --name notes-server-${suffix}"`,
      ],
      PROJECT_ROOT
    );

    logUpdate(
      boxen(chalk.green("Completed successfully."), {
        title: `${vm_title} ✓`,
        borderStyle: "round",
        borderColor: "green",
        padding: 0.5,
      })
    );
    logUpdate.done();
  } catch (error) {}
}

async function deploy_backend_only({
  remote,
  vm_title,
  suffix,
}: {
  remote: string;
  vm_title: string;
  suffix: string;
}) {
  const REMOTE_ROOT = `${remote}:/home/notes-assistant`;

  try {
    await runStep(
      "1/3",
      vm_title,
      "Building backend.",
      ["bun", "run", "build"],
      BACKEND_PATH
    );

    await runStep(
      "2/3",
      vm_title,
      "Deploying server files.",
      [
        "rsync",
        "-av",

        `--exclude-from=${PROJECT_ROOT}/.rsyncignore`,
        "dist/",
        "package.json",
        "bun.lockb",
        `${REMOTE_ROOT}/backend/`,
      ],
      BACKEND_PATH
    );

    await runStep(
      "3/3",
      vm_title,
      "Installing dependencies and restarting server.",
      [
        "ssh",
        remote,
        `"cd /home/notes-assistant/backend && bun install --production && pm2 delete notes-server-${suffix} || true && pm2 start 'bun run start' --name notes-server-${suffix}"`,
      ],
      PROJECT_ROOT
    );

    logUpdate(
      boxen(chalk.green("Completed successfully."), {
        title: `${vm_title} ✓`,
        borderStyle: "round",
        borderColor: "green",
        padding: 0.5,
      })
    );
    logUpdate.done();
  } catch (error) {}
}

async function runStep(
  stepNumber: string,
  vm_title: string,
  title: string,
  cmd: string[],
  cwd: string
) {
  // constants
  const command = cmd.join(" ");
  const stepLog = `[${stepNumber}]`;

  // loader
  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  let index = 0;

  const logInterval = setInterval(() => {
    const frame = frames[(index = ++index % frames.length)];
    logUpdate(
      boxen(
        `${chalk.magenta(stepLog)} ${title}\ncwd: ${chalk.dim(cwd)}\n${chalk.dim(command)}`,
        {
          title: `${vm_title} ${frame}`,
          borderStyle: "round",
          borderColor: "magenta",
          padding: 0.5,
        }
      )
    );
  }, 80);

  try {
    await $`${{ raw: command }}`.cwd(cwd).quiet();
  } catch (error) {
    logUpdate(
      boxen(
        `${chalk.red(stepLog)} ${title}\ncwd: ${chalk.dim(cwd)}\n${chalk.dim(command)}\n\n${error}\n${
          error.stderr?.toString()?.trim() || "No extra info provided."
        }`,
        {
          title: `${vm_title} x`,
          borderStyle: "round",
          borderColor: "red",
          padding: 0.5,
        }
      )
    );
    logUpdate.done();
    throw error;
  } finally {
    clearTimeout(logInterval);
  }
}

const NOTES_EU = {
  remote: "root@168.231.104.96",
  vm_title: "EU (Production)",
  suffix: "eu",
};

(async () => {
  console.clear();
  switch (process.argv[2]) {
    case "eu":
      await deploy_default(NOTES_EU);
      break;
    case "backends-only":
      await deploy_backend_only(NOTES_EU);
      break;
    case "all":
    default:
      await deploy_default(NOTES_EU);
      break;
  }
})();
