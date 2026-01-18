/** @jsxImportSource @opentui/react */
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
import {CLIConfigSchema} from "../schema.ts";
import {theme} from '../theme.ts';

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
          <box flexDirection="column" flexGrow={1} borderStyle="rounded" paddingLeft={1} paddingRight={1} title={ config.name }>
            <text fg={theme.boxTitle}>{ config.description }<br /></text>
            <text paddingTop={1}><strong>Enabled Tools:</strong><br />{enabledTools.join(", ") || '(none)'}</text>
          </box>
        );
      }
    } else if (action === 'connect') {
      const agent = agentManager.getAgent(remainder);
      if (agent) {
        const executionState = agent.getState(AgentExecutionState);

        setPreviewElement(
          <box flexDirection="column" flexGrow={1} borderStyle="rounded" paddingLeft={1} paddingRight={1} title={`Agent ${agent.id}`}>
            <text fg={theme.boxTitle}>{ agent.config.name }</text>
            <text>Agent is { executionState.idle ? 'idle' : 'running' }</text>
          </box>
        );
      }
    } else if (action === 'open') {
      setPreviewElement(
        <box flexDirection="column" flexGrow={1} borderStyle="rounded" paddingLeft={1} paddingRight={1} title="Web Application">
          <text fg={theme.boxTitle}>Launch Web Application</text>
          <text>Selecting this item will launch a web browser on your system connected to the specified application.<br /></text>
          <text>Or you can click this link to open the application:<br />{ remainder }</text>
        </box>
      );
    } else if (action === 'workflow') {
      const workflowService = app.getService(WorkflowService);
      if (workflowService) {
        const workflows = workflowService.listWorkflows();
        const workflow = workflows.find(w => w.key === remainder);
        if (workflow) {
          setPreviewElement(
            <box flexDirection="column" flexGrow={1} borderStyle="rounded" paddingLeft={1} paddingRight={1} title="Run Workflow">
              <text fg={theme.boxTitle}>{ workflow.workflow.name }</text>
              <text>{ workflow.workflow.description }</text>
            </box>
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
      <box>
        <text fg={theme.chatSystemWarningMessage}>
          Terminal too small. Minimum: 40x10
        </text>
      </box>
    );
  }


  return (
    <box
      flexDirection="column"
      width="100%"
      height="100%"
      backgroundColor={theme.screenBackground}
    >
      <box flexDirection="row" paddingBottom={layout.isShort ? 0 : 1}>
        <box flexGrow={1}><text fg={theme.agentSelectionBanner}>{config.screenBanner}</text></box>
        { layout.isNarrow ? null : <box><text> https://tokenring.ai</text></box> }
      </box>
      <box paddingBottom={layout.isShort ? 0 : 1}><text>Select an agent to connect to or spawn</text></box>
      <box flexDirection={layout.isNarrow ? "column" : "row" } flexGrow={1} >
        <box flexDirection="column" flexGrow={layout.isNarrow ? 0 : 1}>
          <TreeSelect question={question}
            onResponse={handleSelect}
            onHighlight={handleHighlight}
          />
        </box>
        {previewElement && (
          layout.isNarrow ? (
            <box width="100%" marginTop={1}>{ previewElement }</box>
          ) : layout.isShort ? null : (
            <box flexGrow={1} width="50%" maxWidth={75} marginLeft={1}>{ previewElement }</box>
          )
        )}
      </box>
      {err &&
        <box borderStyle="rounded" paddingLeft={1} paddingRight={1}>
          <text fg={theme.chatSystemErrorMessage}>{formatLogMessages(['Error selecting agent:',err])}</text>
        </box>
      }
    </box>
  );
}