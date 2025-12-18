/** @jsxImportSource @opentui/react */
import type Agent from '@tokenring-ai/agent/Agent';
import type AgentManager from '@tokenring-ai/agent/services/AgentManager';
import { WebHostService } from "@tokenring-ai/web-host";
import SPAResource from "@tokenring-ai/web-host/SPAResource";
import React, { useCallback, useMemo } from 'react';
import type { TreeLeaf } from './TreeSelectionScreen.tsx';
import TreeSelectionScreen from './TreeSelectionScreen.tsx';
import open from 'open';
import { theme } from '../theme.ts';

interface AgentSelectionScreenProps {
  webHostService?: WebHostService;
  agentManager: AgentManager;
  banner: string;
  onResponse: (agent: Agent | null) => void;
}

export default function AgentSelectionScreen({
  webHostService,
  agentManager,
  onResponse,
  banner
}: AgentSelectionScreenProps) {
  const [err, setError] = React.useState<Error | null>(null);
  const tree: TreeLeaf = useMemo(() => {
    const configs = Object.entries(agentManager.getAgentConfigs());

    const categories: Record<string, TreeLeaf[]> = {};

    if (webHostService) {
      const webResources = webHostService.getResources();
      for (const resourceName in webResources) {
        const resource = webResources[resourceName];
        if (resource instanceof SPAResource) {
          const webApps = categories['Web Application'] ??= [];
          webApps.push(
            {
              name: `Connect to ${resourceName}`,
              value: `open:${resource.config.prefix.substring(1)}`,
            }
          );
        }
      }
    }

    configs.forEach(([type, config]) => {
      const leaf: TreeLeaf = {
        name: `${config.name} (${type})`,
        value: `spawn:${type}`,
      };

      const category = config.category || 'Other';
      if (!categories[category]) {
        categories[category] = [];
      }
      categories[category].push(leaf);
    });

    const currentAgents = agentManager.getAgents();
    if (currentAgents.length > 0) {
      categories['Current Agents'] = currentAgents.map(agent => ({
        name: agent.name,
        value: `connect:${agent.id}`,
      }));
    }

    return {
      name: 'Select Agent',
      children: Object.entries(categories)
        .filter(([_, agents]) => agents.length > 0)
        .map(([category, agents]) => ({
          name: category,
          value: category,
          children: agents.sort((a, b) => a.name.localeCompare(b.name)),
        })),
    };
  }, [agentManager]);

  const handleSelect = useCallback(async (agentType: string | null) => {
    if (!agentType) {
      onResponse(null);
      return;
    }

    const [action, remainder] = agentType.split(':');
    if (action === 'spawn') {
      try {
        const agent = await agentManager.spawnAgent({ agentType: remainder, headless: false });
        if (agent) onResponse(agent);
      } catch (e) {
        setError(e as Error);
      }
    } else if (action === 'connect') {
      const agent = agentManager.getAgent(remainder);
      if (agent) onResponse(agent);
    } else if (action === 'open') {
      const url = webHostService?.getURL()?.toString() ?? undefined
      if (!url) {
        setError(new Error('The web host service does not appear to be bound to a valid host/port.'));
      } else {
        open(`${url}${remainder}`);
      }
    }
  }, [agentManager, webHostService, onResponse]);

  return (
    <box flexDirection="column">
      <box><text fg={theme.agentSelectionBanner}>{banner}</text></box>
      <TreeSelectionScreen
        request={{ type: 'askForSingleTreeSelection', message: "Select an agent or activity", title: "Agent Selection", tree }}
        onResponse={handleSelect}
      />
      {err &&
        <box borderStyle="rounded" paddingLeft={1} paddingRight={1}>
          <text fg={theme.chatSystemErrorMessage}>{err.message}</text>
        </box>
      }
    </box>
  );
}
