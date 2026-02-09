/**
 * pm2-runtime: run web (Next.js) and smart-scheduler (Agenda worker) in one container.
 * Runner stage has npm only; both apps are started via npm. See Dockerfile and README.md.
 */
module.exports = {
  apps: [
    { name: "web", script: "npm", args: "start", env: { NODE_ENV: "production" } },
    {
      name: "scheduler",
      script: "npm",
      args: ["run", "start:scheduler"],
      autorestart: true,
      max_restarts: 10,
      restart_delay: 4000,
    },
  ],
};
