import {Box, Text} from 'ink';
import type Agent from '@tokenring-ai/agent/Agent';
import type {ParsedTreeSelectQuestion, TreeLeaf} from "@tokenring-ai/agent/question";
import AgentManager from '@tokenring-ai/agent/services/AgentManager';
import {AgentExecutionState} from "@tokenring-ai/agent/state/agentExecutionState";
import TokenRingApp from "@tokenring-ai/app";
import {ChatAgentConfigSchema} from "@tokenring-ai/chat";
import formatLogMessages from "@tokenring-ai/utility/string/formatLogMessage";
import {WebHostService} from "@tokenring-ai/web-host";
import SPAResource from "@tokenring-ai/web-host/SPAResource";
import WorkflowService from "@tokenring-ai/workflow/WorkflowService";
import open from 'open';
import React, {type ReactNode, useCallback, useMemo, useState} from 'react';
import {z} from "zod";
import TreeSelect from "../components/inputs/TreeSelect.tsx";
import {useResponsiveLayout} from "../hooks/useResponsiveLayout.ts";
import {CLIConfigSchema} from "../../schema.ts";
import {theme} from '../../theme.ts';

interface AgentSelectionScreenProps {
  app: TokenRingApp;
  config: z.output<typeof CLIConfigSchema>;
  onResponse: (agent: Agent | null) => void;
}

export default function AgentSelectionScreen({
  app,
  onResponse,
  config
}: AgentSelectionScreenProps) {
  const layout = useResponsiveLayout();
  const agentManager = app.requireService(AgentManager);
  const webHostService = app.getService(WebHostService);
  const webHostURL = webHostService?.getURL()?.toString() ?? undefined

  const [err, setError] = React.useState<Error | null>(null);
  const [previewElement, setPreviewElement] = useState<ReactNode | null>(null);

  const handleHighlight = useCallback((value: string) => {
    const [, action, remainder] = value.match(/^(.*?):(.*)$/) ?? [];

    if (action === 'spawn') {
      const configs = agentManager.getAgentConfigs();
      const config = configs[remainder];
      const enabledTools = ((config as any).chat as z.input<typeof ChatAgentConfigSchema>).enabledTools ?? [];
      if (config) {
        setPreviewElement(
          <Box flexDirection="column" flexGrow={1} borderStyle="round" paddingLeft={1} paddingRight={1}>
            <Text color={theme.boxTitle}>{ config.name }</Text>
            <Text color={theme.boxTitle}>{ config.description }{'\n'}</Text>
            <Text>{'\n'}Enabled Tools:{'\n'}{enabledTools.join(", ") || '(none)'}</Text>
          </Box>
        );
      }
    } else if (action === 'connect') {
      const agent = agentManager.getAgent(remainder);
      if (agent) {
        const executionState = agent.getState(AgentExecutionState);

        setPreviewElement(
          <Box flexDirection="column" flexGrow={1} borderStyle="round" paddingLeft={1} paddingRight={1}>
            <Text color={theme.boxTitle}>Agent {agent.id}</Text>
            <Text color={theme.boxTitle}>{ agent.config.name }</Text>
            <Text>Agent is { executionState.idle ? 'idle' : 'running' }</Text>
          </Box>
        );
      }
    } else if (action === 'open') {
      setPreviewElement(
        <Box flexDirection="column" flexGrow={1} borderStyle="round" paddingLeft={1} paddingRight={1}>
          <Text color={theme.boxTitle}>Web Application</Text>
          <Text color={theme.boxTitle}>Launch Web Application</Text>
          <Text>Selecting this item will launch a web browser on your system connected to the specified application.{'\n'}</Text>
          <Text>Or you can click this link to open the application:{'\n'}{ remainder }</Text>
        </Box>
      );
    } else if (action === 'workflow') {
      const workflowService = app.getService(WorkflowService);
      if (workflowService) {
        const workflows = workflowService.listWorkflows();
        const workflow = workflows.find(w => w.key === remainder);
        if (workflow) {
          setPreviewElement(
            <Box flexDirection="column" flexGrow={1} borderStyle="round" paddingLeft={1} paddingRight={1}>
              <Text color={theme.boxTitle}>Run Workflow</Text>
              <Text color={theme.boxTitle}>{ workflow.workflow.name }</Text>
              <Text>{ workflow.workflow.description }</Text>
            </Box>
          );
        }
      }
    }
  }, [agentManager, app]);

  const tree: TreeLeaf[] = useMemo(() => {
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
              value: `open:${webHostURL}${resource.config.prefix.substring(1)}`,
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

    return Object.entries(categories)
      .filter(([_, agents]) => agents.length > 0)
      .map(([category, agents]) => ({
        name: category,
        children: agents.sort((a, b) => a.name.localeCompare(b.name)),
      }));
  }, [agentManager, webHostService, app]);

  const handleSelect = useCallback(async (agentType: string[] | null) => {
    if (!agentType || agentType.length === 0) {
      onResponse(null);
      return;
    }

    const [, action, remainder] = agentType[0].match(/^(.*?):(.*)$/) ?? [];
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
      await open(remainder);
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

  const question: ParsedTreeSelectQuestion = {
    type: "treeSelect",
    label: "Agent Selection",
    minimumSelections: 1,
    maximumSelections: 1,
    defaultValue: [],
    allowFreeform: false,
    tree
  };

  if (layout.minimalMode) {
    return (
      <Box>
        <Text color={theme.chatSystemWarningMessage}>
          Terminal too small. Minimum: 40x10
        </Text>
      </Box>
    );
  }

  return (
    <Box
      flexDirection="column"
      width="100%"
      height="100%"
    >
      <Box flexDirection="row" paddingBottom={layout.isShort ? 0 : 1}>
        <Box flexGrow={1}><Text color={theme.agentSelectionBanner}>{config.screenBanner}</Text></Box>
        { layout.isNarrow ? null : <Box><Text> https://tokenring.ai</Text></Box> }
      </Box>
      <Box paddingBottom={layout.isShort ? 0 : 1}><Text>Select an agent to connect to or spawn</Text></Box>
      <Box flexDirection={layout.isNarrow ? "column" : "row" } flexGrow={1} >
        <Box flexDirection="column" flexGrow={layout.isNarrow ? 0 : 1}>
          <TreeSelect question={question}
            onResponse={handleSelect}
            onHighlight={handleHighlight}
          />
        </Box>
        {previewElement && (
          layout.isNarrow ? (
            <Box width="100%">{ previewElement }</Box>
          ) : layout.isShort ? null : (
            <Box flexGrow={1} width="50%">{ previewElement }</Box>
          )
        )}
      </Box>
      {err &&
        <Box borderStyle="round" paddingLeft={1} paddingRight={1}>
          <Text color={theme.chatSystemErrorMessage}>{formatLogMessages(['Error selecting agent:',err])}</Text>
        </Box>
      }
    </Box>
  );
}
