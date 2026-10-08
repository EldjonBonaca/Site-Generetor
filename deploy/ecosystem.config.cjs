// PM2 process file: keeps the app running and restarts it on crash / reboot.
//   pm2 start deploy/ecosystem.config.cjs && pm2 save
// Settings (PORT, APP_PASSWORD, ...) are read from backend/.env.
module.exports = {
  apps: [
    {
      name: 'site-generator',
      cwd: `${__dirname}/../backend`,
      script: 'src/server.js',
      node_args: '--disable-warning=ExperimentalWarning',
      // One instance only: generation jobs and SQLite live in this process.
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '1G',
      env: { NODE_ENV: 'production' },
    },
  ],
};
