import crypto from 'node:crypto';
import net from 'node:net';
import {bad} from './management.mjs';

export const APP_TEMPLATES = [
  {
    id: 'n8n',
    name: 'n8n Workflow Automation',
    category: 'Automation',
    description: 'Fair-code workflow automation tool with 400+ native integrations and visual node canvas.',
    defaultPort: 5678,
    icon: '⚡',
    envSchema: [
      {key: 'N8N_PORT', label: 'Port', default: '5678', required: true},
      {key: 'N8N_PROTOCOL', label: 'Protocol', default: 'http', required: true},
      {key: 'GENERIC_TIMEZONE', label: 'Timezone', default: 'UTC', required: true}
    ],
    composeTemplate: ({name, port, env = {}}) => {
      const p = port || 5678;
      const tz = env.GENERIC_TIMEZONE || 'UTC';
      const compose = `services:
  ${name}:
    image: n8nio/n8n:latest
    container_name: ${name}
    restart: unless-stopped
    ports:
      - "127.0.0.1:${p}:5678"
    environment:
      - N8N_PORT=5678
      - N8N_PROTOCOL=http
      - GENERIC_TIMEZONE=${tz}
      - N8N_DIAGNOSTICS_ENABLED=false
    volumes:
      - ${name}_data:/home/node/.n8n

volumes:
  ${name}_data:
    name: ${name}_data
`;
      return {compose, envText: `N8N_PORT=${p}\nGENERIC_TIMEZONE=${tz}\n`};
    }
  },
  {
    id: 'uptime-kuma',
    name: 'Uptime Kuma',
    category: 'Monitoring',
    description: 'Self-hosted monitoring tool with fancy reactive UI, ping/HTTP checks and alert notifications.',
    defaultPort: 3001,
    icon: '📈',
    envSchema: [
      {key: 'UPTIME_PORT', label: 'Port', default: '3001', required: true}
    ],
    composeTemplate: ({name, port}) => {
      const p = port || 3001;
      const compose = `services:
  ${name}:
    image: louislam/uptime-kuma:1
    container_name: ${name}
    restart: unless-stopped
    ports:
      - "127.0.0.1:${p}:3001"
    volumes:
      - ${name}_data:/app/data

volumes:
  ${name}_data:
    name: ${name}_data
`;
      return {compose, envText: `PORT=${p}\n`};
    }
  },
  {
    id: 'vaultwarden',
    name: 'Vaultwarden (Bitwarden)',
    category: 'Security',
    description: 'Lightweight Bitwarden-compatible server written in Rust, perfect for password management.',
    defaultPort: 8080,
    icon: '🔐',
    envSchema: [
      {key: 'SIGNUPS_ALLOWED', label: 'Allow Signups', default: 'true', required: true}
    ],
    composeTemplate: ({name, port, env = {}}) => {
      const p = port || 8080;
      const signups = env.SIGNUPS_ALLOWED || 'true';
      const compose = `services:
  ${name}:
    image: vaultwarden/server:latest
    container_name: ${name}
    restart: unless-stopped
    ports:
      - "127.0.0.1:${p}:80"
    environment:
      - SIGNUPS_ALLOWED=${signups}
      - WEBSOCKET_ENABLED=true
    volumes:
      - ${name}_data:/data

volumes:
  ${name}_data:
    name: ${name}_data
`;
      return {compose, envText: `SIGNUPS_ALLOWED=${signups}\n`};
    }
  },
  {
    id: 'wordpress',
    name: 'WordPress + MariaDB',
    category: 'CMS',
    description: 'The world\'s most popular web publishing and blogging platform with MariaDB database.',
    defaultPort: 8082,
    icon: '📝',
    envSchema: [
      {key: 'MYSQL_PASSWORD', label: 'Database Password', default: '', required: true, secret: true},
      {key: 'MYSQL_DATABASE', label: 'Database Name', default: 'wordpress', required: true}
    ],
    composeTemplate: ({name, port, env = {}}) => {
      const p = port || 8082;
      const dbPass = env.MYSQL_PASSWORD || crypto.randomBytes(12).toString('hex');
      const dbName = env.MYSQL_DATABASE || 'wordpress';
      const compose = `services:
  ${name}_db:
    image: mariadb:10.11
    container_name: ${name}_db
    restart: unless-stopped
    environment:
      MYSQL_ROOT_PASSWORD: ${dbPass}
      MYSQL_DATABASE: ${dbName}
      MYSQL_USER: wpuser
      MYSQL_PASSWORD: ${dbPass}
    volumes:
      - ${name}_db_data:/var/lib/mysql

  ${name}:
    image: wordpress:latest
    container_name: ${name}
    restart: unless-stopped
    depends_on:
      - ${name}_db
    ports:
      - "127.0.0.1:${p}:80"
    environment:
      WORDPRESS_DB_HOST: ${name}_db:3306
      WORDPRESS_DB_USER: wpuser
      WORDPRESS_DB_PASSWORD: ${dbPass}
      WORDPRESS_DB_NAME: ${dbName}
    volumes:
      - ${name}_html:/var/www/html

volumes:
  ${name}_db_data:
    name: ${name}_db_data
  ${name}_html:
    name: ${name}_html
`;
      return {compose, envText: `MYSQL_PASSWORD=${dbPass}\n`};
    }
  },
  {
    id: 'postgresql',
    name: 'PostgreSQL 16 + pgAdmin',
    category: 'Database',
    description: 'High-performance relational database with pgAdmin web management UI.',
    defaultPort: 5432,
    icon: '🐘',
    envSchema: [
      {key: 'POSTGRES_PASSWORD', label: 'Postgres Password', default: '', required: true, secret: true},
      {key: 'PGADMIN_PORT', label: 'pgAdmin Port', default: '5050', required: true}
    ],
    composeTemplate: ({name, port, env = {}}) => {
      const p = port || 5432;
      const adminPort = env.PGADMIN_PORT || (p + 100);
      const pgPass = env.POSTGRES_PASSWORD || crypto.randomBytes(12).toString('hex');
      const compose = `services:
  ${name}:
    image: postgres:16-alpine
    container_name: ${name}
    restart: unless-stopped
    ports:
      - "127.0.0.1:${p}:5432"
    environment:
      POSTGRES_PASSWORD: ${pgPass}
      POSTGRES_USER: postgres
      POSTGRES_DB: postgres
    volumes:
      - ${name}_data:/var/lib/postgresql/data

  ${name}_admin:
    image: dpage/pgadmin4:latest
    container_name: ${name}_admin
    restart: unless-stopped
    depends_on:
      - ${name}
    ports:
      - "127.0.0.1:${adminPort}:80"
    environment:
      PGADMIN_DEFAULT_EMAIL: admin@cyberpross.internal
      PGADMIN_DEFAULT_PASSWORD: ${pgPass}
    volumes:
      - ${name}_admin_data:/var/lib/pgadmin

volumes:
  ${name}_data:
    name: ${name}_data
  ${name}_admin_data:
    name: ${name}_admin_data
`;
      return {compose, envText: `POSTGRES_PASSWORD=${pgPass}\nPGADMIN_PORT=${adminPort}\n`};
    }
  },
  {
    id: 'redis',
    name: 'Redis 7 + RedisInsight',
    category: 'Database',
    description: 'In-memory data structure store used as a database, cache, and message broker with GUI.',
    defaultPort: 6379,
    icon: '🔴',
    envSchema: [
      {key: 'REDIS_PASSWORD', label: 'Redis Password', default: '', required: true, secret: true},
      {key: 'INSIGHT_PORT', label: 'RedisInsight Port', default: '8001', required: true}
    ],
    composeTemplate: ({name, port, env = {}}) => {
      const p = port || 6379;
      const insightPort = env.INSIGHT_PORT || 8001;
      const pass = env.REDIS_PASSWORD || crypto.randomBytes(12).toString('hex');
      const compose = `services:
  ${name}:
    image: redis:7-alpine
    container_name: ${name}
    restart: unless-stopped
    command: redis-server --requirepass ${pass}
    ports:
      - "127.0.0.1:${p}:6379"
    volumes:
      - ${name}_data:/data

  ${name}_insight:
    image: redis/redisinsight:latest
    container_name: ${name}_insight
    restart: unless-stopped
    depends_on:
      - ${name}
    ports:
      - "127.0.0.1:${insightPort}:5540"
    volumes:
      - ${name}_insight_data:/data

volumes:
  ${name}_data:
    name: ${name}_data
  ${name}_insight_data:
    name: ${name}_insight_data
`;
      return {compose, envText: `REDIS_PASSWORD=${pass}\nINSIGHT_PORT=${insightPort}\n`};
    }
  },
  {
    id: 'nextcloud',
    name: 'Nextcloud Hub',
    category: 'Productivity',
    description: 'Private cloud file hosting, office collaboration, calendars and contacts synchronization.',
    defaultPort: 8083,
    icon: '☁️',
    envSchema: [
      {key: 'NEXTCLOUD_ADMIN_USER', label: 'Admin User', default: 'admin', required: true},
      {key: 'NEXTCLOUD_ADMIN_PASSWORD', label: 'Admin Password', default: '', required: true, secret: true}
    ],
    composeTemplate: ({name, port, env = {}}) => {
      const p = port || 8083;
      const adminUser = env.NEXTCLOUD_ADMIN_USER || 'admin';
      const adminPass = env.NEXTCLOUD_ADMIN_PASSWORD || crypto.randomBytes(12).toString('hex');
      const dbPass = crypto.randomBytes(12).toString('hex');
      const compose = `services:
  ${name}_db:
    image: mariadb:10.11
    container_name: ${name}_db
    restart: unless-stopped
    command: --transaction-isolation=READ-COMMITTED --binlog-format=ROW
    environment:
      MYSQL_ROOT_PASSWORD: ${dbPass}
      MYSQL_PASSWORD: ${dbPass}
      MYSQL_DATABASE: nextcloud
      MYSQL_USER: nextcloud
    volumes:
      - ${name}_db_data:/var/lib/mysql

  ${name}:
    image: nextcloud:apache
    container_name: ${name}
    restart: unless-stopped
    depends_on:
      - ${name}_db
    ports:
      - "127.0.0.1:${p}:80"
    environment:
      MYSQL_PASSWORD: ${dbPass}
      MYSQL_DATABASE: nextcloud
      MYSQL_USER: nextcloud
      MYSQL_HOST: ${name}_db
      NEXTCLOUD_ADMIN_USER: ${adminUser}
      NEXTCLOUD_ADMIN_PASSWORD: ${adminPass}
    volumes:
      - ${name}_data:/var/www/html

volumes:
  ${name}_db_data:
    name: ${name}_db_data
  ${name}_data:
    name: ${name}_data
`;
      return {compose, envText: `NEXTCLOUD_ADMIN_PASSWORD=${adminPass}\n`};
    }
  },
  {
    id: 'gitea',
    name: 'Gitea Git Service',
    category: 'DevOps',
    description: 'Painless, self-hosted Git service with code review, issues, wiki and package registry.',
    defaultPort: 3000,
    icon: '🍵',
    envSchema: [
      {key: 'GITEA_SSH_PORT', label: 'SSH Port', default: '2222', required: true}
    ],
    composeTemplate: ({name, port, env = {}}) => {
      const p = port || 3000;
      const sshPort = env.GITEA_SSH_PORT || 2222;
      const compose = `services:
  ${name}:
    image: gitea/gitea:latest
    container_name: ${name}
    restart: unless-stopped
    ports:
      - "127.0.0.1:${p}:3000"
      - "127.0.0.1:${sshPort}:22"
    environment:
      - USER_UID=1000
      - USER_GID=1000
    volumes:
      - ${name}_data:/data
      - /etc/timezone:/etc/timezone:ro
      - /etc/localtime:/etc/localtime:ro

volumes:
  ${name}_data:
    name: ${name}_data
`;
      return {compose, envText: `PORT=${p}\nSSH_PORT=${sshPort}\n`};
    }
  },
  {
    id: 'ghost',
    name: 'Ghost Publishing Platform',
    category: 'CMS',
    description: 'Modern, headless publishing platform for professional creators, newsletters and blogs.',
    defaultPort: 2368,
    icon: '👻',
    envSchema: [
      {key: 'GHOST_URL', label: 'Site URL', default: 'http://localhost:2368', required: true}
    ],
    composeTemplate: ({name, port, env = {}}) => {
      const p = port || 2368;
      const siteUrl = env.GHOST_URL || `http://localhost:${p}`;
      const compose = `services:
  ${name}:
    image: ghost:5-alpine
    container_name: ${name}
    restart: unless-stopped
    ports:
      - "127.0.0.1:${p}:2368"
    environment:
      url: ${siteUrl}
      NODE_ENV: production
    volumes:
      - ${name}_content:/var/lib/ghost/content

volumes:
  ${name}_content:
    name: ${name}_content
`;
      return {compose, envText: `GHOST_URL=${siteUrl}\n`};
    }
  }
];

export async function isPortAvailable(port) {
  return new Promise(resolve => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, '127.0.0.1');
  });
}

export async function findNextAvailablePort(startPort) {
  let port = Number(startPort);
  for (let i = 0; i < 50; i++) {
    if (await isPortAvailable(port)) return port;
    port++;
  }
  return startPort;
}

export function createAppsCatalog({workspace, websites, jobs}) {
  return {
    async list() {
      // Find currently installed/running apps by inspecting compose drafts or containers
      let drafts = [];
      try {
        drafts = await workspace.drafts();
      } catch {}

      return APP_TEMPLATES.map(t => {
        const isDeployed = drafts.some(d => d.name === t.id || d.name.startsWith(t.id + '-'));
        return {
          id: t.id,
          name: t.name,
          category: t.category,
          description: t.description,
          defaultPort: t.defaultPort,
          icon: t.icon,
          envSchema: t.envSchema,
          installed: isDeployed
        };
      });
    },

    async get(id) {
      const template = APP_TEMPLATES.find(t => t.id === id);
      if (!template) throw bad('App template not found', 404);
      const availablePort = await findNextAvailablePort(template.defaultPort);
      return {
        ...template,
        suggestedPort: availablePort
      };
    },

    async deploy({appId, name, port, env = {}, domain, publishProxy = true, confirm = false}, log = () => {}) {
      if (confirm !== true) throw bad('Deployment confirmation required');
      const template = APP_TEMPLATES.find(t => t.id === appId);
      if (!template) throw bad('App template not found', 404);

      const targetName = (name || template.id).toLowerCase().replace(/[^a-z0-9_-]/g, '-');
      const targetPort = Number(port) || (await findNextAvailablePort(template.defaultPort));

      log(`Generating Docker Compose configuration for ${template.name}...`);
      const {compose, envText} = template.composeTemplate({
        name: targetName,
        port: targetPort,
        env
      });

      log(`Preparing compose draft for project "${targetName}"...`);
      const draft = await workspace.prepareCompose({
        name: targetName,
        compose,
        environment: envText
      });

      log(`Deploying ${targetName} stack with Docker Compose...`);
      await workspace.deployCompose({
        draft: draft.draft,
        revision: draft.revision
      }, log);

      let proxyResult = null;
      if (domain && websites) {
        log(`Configuring automatic reverse proxy for ${domain} -> 127.0.0.1:${targetPort}...`);
        try {
          proxyResult = await websites.quickProxy({
            domain,
            upstream: `http://127.0.0.1:${targetPort}`,
            publish: publishProxy !== false,
            confirm: true
          });
          log(`Reverse proxy created for ${domain}`);
        } catch (err) {
          log(`Warning: Reverse proxy setup failed: ${err.message}`);
          proxyResult = {warning: err.message};
        }
      }

      log(`App ${template.name} deployed successfully on port ${targetPort}!`);
      return {
        ok: true,
        appId,
        name: targetName,
        port: targetPort,
        domain: domain || null,
        proxyResult,
        tunnelRouting: domain ? `Point Cloudflare Tunnel Public Hostname (${domain}) to http://127.0.0.1:${targetPort} or http://127.0.0.1:19180 (Coraza WAF). Cloudflare handles Edge SSL automatically without origin certificates.` : undefined
      };
    }
  };
}
