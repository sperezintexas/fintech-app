/**
 * pm2-runtime: run web (Next.js) and smart-scheduler (Agenda worker) in one container.
 * Set JOB_RUNNER=false in .env.local to skip starting the scheduler (e.g. local testing).
 * Default (unset or true): scheduler runs. See Dockerfile and README.md.
 */
const runScheduler = process.env.JOB_RUNNER !== "false";

module.exports = {
  apps: [
    { name: "web", script: "pnpm", args: ["-C", "apps/frontend", "run", "start"], env: { NODE_ENV: "production" }, cwd: "/app" },
    ...(runScheduler
      ? [
          {
            name: "scheduler",
            script: "pnpm",
            args: ["run", "start:scheduler"],
            autorestart: true,
            max_restarts: 10,
            restart_delay: 4000,
          },
        ]
      : []),
  ],
};
