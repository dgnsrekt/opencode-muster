/**
 * muster — an opencode plugin.
 *
 * Rebuilds the `lmstudio` provider at opencode startup from whatever LM Studio
 * has loaded right now, so the model picker answers the roll call instead of
 * reading out the whole roster.
 *
 * LM Studio's OpenAI-compatible /v1/models lists every *downloaded* model, so it
 * cannot answer "what is loaded". The native /api/v0/models endpoint carries a
 * `state` field ("loaded" | "not-loaded"), which is what this filters on.
 *
 * Env overrides:
 *   LMSTUDIO_BASE_URL   default http://localhost:1234
 *   LMSTUDIO_ALL_MODELS set to 1 to list downloaded models too (JIT load)
 */

const BASE = (process.env.LMSTUDIO_BASE_URL ?? "http://localhost:1234").replace(/\/+$/, "")
const ALL = process.env.LMSTUDIO_ALL_MODELS === "1"
const TIMEOUT_MS = 2000

export const Muster = async () => {
  return {
    config: async (config) => {
      // Nothing discoverable means nothing offered: without this, opencode
      // falls back to models.dev's built-in lmstudio catalog and lists models
      // that aren't downloaded, let alone loaded.
      const apply = (models) => {
        config.provider ??= {}
        const existing = config.provider.lmstudio ?? {}
        config.provider.lmstudio = {
          ...existing,
          npm: existing.npm ?? "@ai-sdk/openai-compatible",
          name: existing.name ?? "LM Studio",
          options: { baseURL: `${BASE}/v1`, ...existing.options },
          // replace rather than merge, so unloaded models disappear
          models,
          whitelist: Object.keys(models),
        }
      }

      let records
      try {
        const res = await fetch(`${BASE}/api/v0/models`, {
          signal: AbortSignal.timeout(TIMEOUT_MS),
        })
        if (!res.ok) return apply({})
        records = (await res.json()).data
      } catch {
        // LM Studio isn't running
        return apply({})
      }
      if (!Array.isArray(records)) return apply({})

      const usable = records.filter(
        (m) => (m.type === "llm" || m.type === "vlm") && (ALL || m.state === "loaded"),
      )

      const models = {}
      for (const m of usable) {
        const context = m.loaded_context_length ?? m.max_context_length ?? 8192
        models[m.id] = {
          name: label(m),
          attachment: m.type === "vlm",
          tool_call: m.capabilities?.includes("tool_use") ?? false,
          reasoning: m.capabilities?.includes("reasoning") ?? false,
          temperature: true,
          limit: {
            context,
            // leave room for the prompt; LM Studio shares one window
            output: Math.max(4096, Math.min(32768, Math.floor(context / 8))),
          },
          cost: { input: 0, output: 0 },
        }
      }

      apply(models)
    },
  }
}

function label(m) {
  const bits = []
  if (m.quantization) bits.push(m.quantization)
  if (m.compatibility_type) bits.push(m.compatibility_type)
  const ctx = m.loaded_context_length ?? m.max_context_length
  if (ctx) bits.push(`${Math.round(ctx / 1024)}k`)
  return bits.length ? `${m.id} · ${bits.join(" ")}` : m.id
}
