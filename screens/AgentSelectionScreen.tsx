/** @jsxImportSource @opentui/react */
import type Agent from '@tokenring-ai/agent/Agent';
import AgentManager from '@tokenring-ai/agent/services/AgentManager';
import TokenRingApp from "@tokenring-ai/app";
import formatLogMessages from "@tokenring-ai/utility/string/formatLogMessage";
import {WebHostService} from "@tokenring-ai/web-host";
import SPAResource from "@tokenring-ai/web-host/SPAResource";
import WorkflowService from "@tokenring-ai/workflow/WorkflowService";
import open from 'open';
import React, {useCallback, useMemo} from 'react';
import {z} from "zod";
import {theme} from '../theme.ts';
import QuestionInputScreen from './QuestionInputScreen.tsx';
import {QuestionRequestSchema} from "@tokenring-ai/agent/HumanInterfaceRequest";
import type {TreeLeaf} from "@tokenring-ai/agent/HumanInterfaceRequest";

interface AgentSelectionScreenProps {
  app: TokenRingApp;
  banner: string;
  onResponse: (agent: Agent | null) => void;
}

export default function AgentSelectionScreen({
  app,
  onResponse,
  banner
}: AgentSelectionScreenProps) {
  const agentManager = app.requireService(AgentManager);
  const webHostService = app.getService(WebHostService);

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

    // Add workflows category
    const workflows = app.getService(WorkflowService);
    if (workflows) {
      const workflowList = workflows.listWorkflows();
      if (workflowList.length > 0) {
        categories['Workflows'] = workflowList.map(({key, workflow}) => ({
          name: `${workflow.name} (${key})`,
          value: `workflow:${key}`,
        }));
      }
    }

    return {
      name: 'Select Agent',
      children: Object.entries(categories)
        .filter(([_, agents]) => agents.length > 0)
        .map(([category, agents]) => ({
          name: category,
          //value: category,
          children: agents.sort((a, b) => a.name.localeCompare(b.name)),
        })),
    };
  }, [agentManager, webHostService, app]);

  const handleSelect = useCallback(async (agentType: string[] | null) => {
    if (!agentType || agentType.length === 0) {
      onResponse(null);
      return;
    }

    const [action, remainder] = agentType[0].split(':');
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
        await open(`${url}${remainder}`);
      }
    } else if (action === 'workflow') {
      try {
        const workflowService = app.requireService(WorkflowService);
        const agent = await workflowService.spawnWorkflow(remainder, { headless: false });

        onResponse(agent);
      } catch (e) {
        setError(e as Error);
      }
    }
  }, [agentManager, webHostService, onResponse, app]);

  const request: z.output<typeof QuestionRequestSchema> = {
    type: "question.request",
    immediate: true,
    timestamp: Date.now(),
    requestId: "agent-selection",
    message: "Select an agent to connect to or spawn:",
    question: {
      type: "treeSelect",
      label: "Agent Selection",
      minimumSelections: 1,
      maximumSelections: 1,
      tree
    },
    autoSubmitAfter: 0
  };

  return (
    <box flexDirection="column">
      <box><text fg={theme.agentSelectionBanner}>{banner}</text></box>
      <QuestionInputScreen
        request={request}
        onResponse={handleSelect}
      />
      {err &&
        <box borderStyle="rounded" paddingLeft={1} paddingRight={1}>
          <text fg={theme.chatSystemErrorMessage}>{formatLogMessages(['Error selecting agent:',err])}</text>
        </box>
      }
    </box>
  );
}