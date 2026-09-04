/**
 * TeamSpace DSH tools — read-only context for the agent.
 *
 * Zero runtime deps on @deepseek-ai/* packages: Node resolves linked plugin
 * modules from this directory, so peerDeps alone do not work. Tools are
 * registered with the host-provided `ctx.tools` registry.
 */

import { TeamSpaceClient } from './client.js'

export const name = 'teamspace-tools'
export const inject = ['tools']

/**
 * @param {Record<string, unknown>} [raw]
 */
function resolveConfig(raw = {}) {
  return {
    baseUrl: String(raw.baseUrl || 'http://127.0.0.1:8090'),
    token: String(raw.token || ''),
    autoDevLogin: raw.autoDevLogin !== false,
    devUserId: Number(raw.devUserId) || 1,
    timeoutMs: Number(raw.timeoutMs) || 15_000,
  }
}

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {Record<string, unknown>} [rawConfig]
 */
export function apply(ctx, rawConfig) {
  const config = resolveConfig(rawConfig)
  const client = new TeamSpaceClient(config)

  ctx.tools.register({
    name: 'teamspace_list_projects',
    description:
      'List TeamSpace projects the current user can see. '
      + 'Call this when the user asks about projects, project space, or which projects exist. '
      + 'Returns project id, code, name, and basic metadata for follow-up tools.',
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          items: {
            type: 'array',
            items: { type: 'object', additionalProperties: true },
          },
          count: { type: 'integer' },
        },
        required: ['items', 'count'],
      },
      render: (_args, value) => [{ type: 'text', text: formatProjects(value) }],
    },
    async execute(_args, exec) {
      const data = await client.get('/api/projects', { signal: exec.signal })
      const items = Array.isArray(data?.items) ? data.items : []
      return { items, count: items.length }
    },
  })

  ctx.tools.register({
    name: 'teamspace_get_requirement',
    description:
      'Fetch one TeamSpace requirement by id, optionally with its timeline. '
      + 'Use when the user asks about a requirement, its status, assignees, specs, '
      + 'or progress history. Prefer listing projects first if the requirement id is unknown.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        requirement_id: {
          type: 'integer',
          description: 'Requirement id (numeric).',
        },
        include_timeline: {
          type: 'boolean',
          description: 'If true, also fetch GET /api/requirements/{id}/timeline. Default false.',
        },
      },
      required: ['requirement_id'],
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          requirement: { type: 'object', additionalProperties: true },
          timeline: { type: 'object', additionalProperties: true },
        },
        required: ['requirement'],
      },
      render: (_args, value) => [{ type: 'text', text: formatRequirement(value) }],
    },
    async execute(args, exec) {
      const id = args.requirement_id
      const requirement = await client.get(`/api/requirements/${id}`, { signal: exec.signal })
      /** @type {{ requirement: object, timeline?: object }} */
      const result = { requirement }
      if (args.include_timeline) {
        result.timeline = await client.get(`/api/requirements/${id}/timeline`, { signal: exec.signal })
      }
      return result
    },
  })

  ctx.tools.register({
    name: 'teamspace_list_bugs',
    description:
      'List bugs in a TeamSpace project. '
      + 'Use when the user asks about open defects, bug status, or what needs fixing. '
      + 'Requires project_id (from teamspace_list_projects). '
      + 'Optionally filter to open-like statuses only.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        project_id: {
          type: 'integer',
          description: 'Project id that owns the bugs.',
        },
        open_only: {
          type: 'boolean',
          description:
            'If true, keep only bugs whose status is not VERIFIED/CLOSED/DONE/RESOLVED. Default true.',
        },
        requirement_id: {
          type: 'integer',
          description: 'Optional: only bugs linked to this requirement id.',
        },
      },
      required: ['project_id'],
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          items: {
            type: 'array',
            items: { type: 'object', additionalProperties: true },
          },
          count: { type: 'integer' },
          project_id: { type: 'integer' },
        },
        required: ['items', 'count', 'project_id'],
      },
      render: (_args, value) => [{ type: 'text', text: formatBugs(value) }],
    },
    async execute(args, exec) {
      const projectId = args.project_id
      const data = await client.get(`/api/projects/${projectId}/bugs`, { signal: exec.signal })
      let items = Array.isArray(data?.items) ? data.items : []
      if (args.requirement_id) {
        const rid = args.requirement_id
        items = items.filter((b) => Number(b.requirement_id) === rid || Number(b.RequirementID) === rid)
      }
      const openOnly = args.open_only !== false
      if (openOnly) {
        items = items.filter((b) => isOpenBugStatus(b.status ?? b.Status))
      }
      return { items, count: items.length, project_id: projectId }
    },
  })

  ctx.tools.register({
    name: 'teamspace_get_workspace',
    description:
      'Fetch the current user TeamSpace workspace summary (personal todos / assigned work). '
      + 'Use when the user asks what they should work on, their pending tasks, '
      + 'or an overview of assigned requirements and bugs.',
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: true,
      },
      render: (_args, value) => [{ type: 'text', text: formatWorkspace(value) }],
    },
    async execute(_args, exec) {
      const data = await client.get('/api/workspace', { signal: exec.signal })
      return data && typeof data === 'object' ? data : { raw: data }
    },
  })
}

function formatProjects(value) {
  const lines = [`TeamSpace projects (${value.count}):`]
  for (const p of value.items) {
    const id = p.id ?? p.ID
    const code = p.code ?? p.Code ?? ''
    const name = p.name ?? p.Name ?? ''
    lines.push(`- #${id} ${code ? `[${code}] ` : ''}${name}`)
  }
  return lines.join('\n')
}

function formatRequirement(value) {
  const r = value.requirement || {}
  const id = r.id ?? r.ID
  const title = r.title ?? r.Title ?? ''
  const status = r.status ?? r.Status ?? ''
  const lines = [
    `Requirement #${id}: ${title}`,
    `status: ${status}`,
    `payload: ${safeJson(r)}`,
  ]
  if (value.timeline) {
    lines.push(`timeline: ${safeJson(value.timeline)}`)
  }
  return lines.join('\n')
}

function formatBugs(value) {
  const lines = [`Bugs in project #${value.project_id} (${value.count}):`]
  for (const b of value.items) {
    const id = b.id ?? b.ID
    const title = b.title ?? b.Title ?? ''
    const status = b.status ?? b.Status ?? ''
    const sev = b.severity ?? b.Severity ?? ''
    lines.push(`- #${id} [${status}${sev ? `/${sev}` : ''}] ${title}`)
  }
  return lines.join('\n')
}

function formatWorkspace(value) {
  return `TeamSpace workspace summary:\n${safeJson(value)}`
}

function isOpenBugStatus(status) {
  const s = String(status || '').toUpperCase()
  if (!s) return true
  return !['VERIFIED', 'CLOSED', 'DONE', 'RESOLVED'].includes(s)
}

function safeJson(value) {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}
