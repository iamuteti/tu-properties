module.exports = {
  apps: [
    {
      name: 'tu-properties-api-prod',
      cwd: './backend',
      script: 'dist/main.js',
      instances: 1,
      autorestart: true,
      exec_mode: 'fork',
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
      },
    },
    {
      name: 'tu-properties-front-prod',
      cwd: './frontend',
      script: 'npm',
      args: 'run start',
      instances: 1,
      autorestart: true,
      exec_mode: 'fork',
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
}
