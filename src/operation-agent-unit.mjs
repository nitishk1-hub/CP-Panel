export const operationAgentUnit=`[Unit]
Description=CyberPross privileged operation agent
After=local-fs.target
Before=server-panel.service
[Service]
Type=simple
User=root
Group=root
UMask=0077
RuntimeDirectory=server-panel-agent
RuntimeDirectoryMode=0700
ExecStart=/opt/server-panel/bin/node /opt/server-panel/app/scripts/privileged-agent.mjs
Restart=on-failure
RestartSec=3
KillMode=control-group
TimeoutStopSec=20
StandardOutput=journal
StandardError=journal
[Install]
WantedBy=multi-user.target
`;
export const operationAgentDropIn=`[Unit]
Wants=server-panel-agent.service
After=server-panel-agent.service
[Service]
Environment=PANEL_AGENT_SOCKET=/run/server-panel-agent/control.sock
Environment=PANEL_AGENT_KEY=/etc/server-panel/agent.key
`;
