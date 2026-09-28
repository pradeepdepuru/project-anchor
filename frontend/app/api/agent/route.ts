import { createMCPClient } from '@ai-sdk/mcp'
import { createOpenAI } from '@ai-sdk/openai'
import { isStepCount, streamText } from 'ai'
import { ANCHOR_SYSTEM_PROMPT, buildAnchorSystemPrompt } from '@/sanity/lib/agentPrompt'

export const dynamic = 'force-dynamic'

// OpenRouter provider instance using OpenAI-compatible interface
const openrouter = createOpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY,
})

/**
 * Project Anchor — Next.js Agent Streaming API Endpoint
 *
 * Connects to the Sanity Context MCP endpoint to provide live schema context
 * and query execution (initial_context, groq_query) for the patient companion agent.
 * Routed through OpenRouter engine.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { messages, prompt, patientName, patientId, activeChoresSummary, caregiverName } = body

    const mcpUrl = process.env.SANITY_CONTEXT_MCP_URL
    const readToken = process.env.SANITY_API_READ_TOKEN

    let mcpClient: Awaited<ReturnType<typeof createMCPClient>> | null = null
    let tools: Record<string, any> = {}

    // Initialize MCP Client with strict protocol fallback for Sanity's global servers

    if (mcpUrl) {
      try {
        const targetProjectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || 't3retdwe';
        const personalizedCloudUrl = `https://api.sanity.io/v1/context/organizations/oky0bdg3q/mcp/for-project-anchor`;

        mcpClient = await createMCPClient({
          transport: {
            type: 'http',
            url: personalizedCloudUrl,
            headers: {
              'Authorization': `Bearer ${process.env.SANITY_API_READ_TOKEN || readToken}`
            },
            initialProtocolVersion: '2024-11-05',
          },
          version: '2024-11-05',
          protocolVersionDiscovery: false,
        })

        // Use mcpClient.tools() instead of mcpClient.listTools() based on your template
        const retrievedTools = await mcpClient.tools()

        tools = {
          ...(retrievedTools.initial_context ? { initial_context: retrievedTools.initial_context } : {}),
          ...(retrievedTools.groq_query ? { groq_query: retrievedTools.groq_query } : {}),
          ...retrievedTools,
        }
      } catch (mcpError) {
        console.warn('Failed to establish Sanity Context MCP connection:', mcpError)
      }
    }


    const hasTools = Object.keys(tools).length > 0

    // Recursively strip unsupported propertyNames from schemas at any depth
    const cleanSchema = (obj: any): any => {
      if (!obj || typeof obj !== 'object') return obj
      if (Array.isArray(obj)) return obj.map(cleanSchema)
      const result: Record<string, any> = {}
      for (const [k, v] of Object.entries(obj)) {
        if (k === 'propertyNames') continue
        result[k] = cleanSchema(v)
      }
      return result
    }

    const cleanTool = (tool: any): any => {
      if (!tool || typeof tool !== 'object') return tool
      const cleaned = { ...tool }

      if (cleaned.parameters) {
        if (cleaned.parameters.jsonSchema) {
          cleaned.parameters = {
            ...cleaned.parameters,
            jsonSchema: cleanSchema(cleaned.parameters.jsonSchema),
          }
        } else {
          cleaned.parameters = cleanSchema(cleaned.parameters)
        }
      }

      if (cleaned.inputSchema) {
        if (cleaned.inputSchema.jsonSchema) {
          cleaned.inputSchema = {
            ...cleaned.inputSchema,
            jsonSchema: cleanSchema(cleaned.inputSchema.jsonSchema),
          }
        } else {
          cleaned.inputSchema = cleanSchema(cleaned.inputSchema)
        }
      }

      return cleaned
    }

    const cleanTools = Object.fromEntries(
      Object.entries(tools).map(([name, tool]) => [name, cleanTool(tool)]),
    )

    // Ensure type-safe, normalized array of messages for AI SDK
    const rawMessages =
      Array.isArray(messages) && messages.length > 0
        ? messages
        : [{ role: 'user', content: prompt || 'Hello Anchor' }]

    const formattedMessages = rawMessages.map((m: any) => ({
      role: (m.role === 'system'
        ? 'system'
        : m.role === 'assistant'
          ? 'assistant'
          : 'user') as 'system' | 'assistant' | 'user',
      content:
        typeof m.content === 'string'
          ? m.content
          : Array.isArray(m.parts)
            ? m.parts
              .filter((p: any) => p.type === 'text')
              .map((p: any) => p.text)
              .join('') || JSON.stringify(m.parts)
            : JSON.stringify(m.content ?? ''),
    }))

    // Build dynamic runtime prompt tailored to active patient and day
    const systemPrompt = buildAnchorSystemPrompt({
      patientName: patientName || 'Robert',
      caregiverName,
      currentDate: new Date().toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      }),
      activeChoresSummary,
    })

    // Stream model execution via OpenRouter with compassionate validation prompt and MCP tools
    const result = streamText({
      model: openrouter(process.env.OPENROUTER_MODEL || 'openrouter/free'),
      system: systemPrompt,
      messages: formattedMessages,
      ...(hasTools ? { tools: cleanTools, stopWhen: isStepCount(5) } : {}),
      onFinish: async () => {
        if (mcpClient) {
          try {
            await mcpClient.close()
          } catch (closeError) {
            console.warn('Error closing MCP client connection:', closeError)
          }
        }
      },
    })

    return result.toTextStreamResponse()
  } catch (error) {
    console.error('Agent streaming endpoint error:', error)
    return new Response(
      JSON.stringify({
        error: 'Failed to process agent request',
        details: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      },
    )
  }
}
