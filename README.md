# Muster

[![License: MIT](https://img.shields.io/badge/License-MIT-informational.svg)](LICENSE)
![opencode plugin](https://img.shields.io/badge/opencode-plugin-8A63D2.svg)
![No build step](https://img.shields.io/badge/build-none-brightgreen.svg)
![Zero dependencies](https://img.shields.io/badge/dependencies-0-brightgreen.svg)
![No network egress](https://img.shields.io/badge/egress-none-brightgreen.svg)

An [opencode](https://opencode.ai) plugin that lists the LM Studio models you have
**loaded right now** — not every model you have ever downloaded.

A muster roll is the list of who actually turned up, as opposed to everyone on the
books. That is the whole idea. LM Studio's OpenAI-compatible `/v1/models` is the
roster: it returns every downloaded model with no way to tell which are in memory.
So the picker fills with names that are merely on disk, and choosing one either
stalls the session while it loads or evicts something you were using.

Muster reads LM Studio's native `/api/v0/models` instead, which carries a `state`
field, and rebuilds the `lmstudio` provider from the loaded ones alone. The model
list matches `lms ps`.

## Install

No build step, no npm, no dependencies. Drop the file in your opencode plugin
directory:

```sh
curl -fsSL https://raw.githubusercontent.com/dgnsrekt/opencode-muster/main/muster.js \
  -o ~/.config/opencode/plugin/muster.js
```

Restart opencode. For a single project instead, use `.opencode/plugin/` in the
project root.

Nothing else is required — no provider block, no config. If you already have a
`provider.lmstudio` entry, Muster keeps your `baseURL`, `name`, `npm` and any other
options you set, and replaces only the model list.

## What it reads from LM Studio

Each loaded model is registered with metadata taken from the running instance,
not guessed:

| LM Studio | opencode | Note |
| --- | --- | --- |
| `id` | model id | preserved exactly, so per-host instances stay distinct |
| `loaded_context_length` | `limit.context` | the live allocation, not the model maximum |
| `type: "vlm"` | `attachment` | image input for vision models |
| `capabilities: tool_use` | `tool_call` | |
| `capabilities: reasoning` | `reasoning` | |
| `quantization`, `compatibility_type` | display name | e.g. `qwen/qwen3-27b · Q8_0 gguf 262k` |

`limit.output` is a conservative plugin policy — one eighth of context, floored at
4,096 and capped at 32,768 — because LM Studio reports a context window but no
separate generation limit. Cost is set to zero.

The generated `whitelist` matters more than it looks: opencode merges models.dev's
built-in `lmstudio` catalog into the provider, which would otherwise add well-known
model names you have never downloaded. The whitelist keeps them out.

## Configuration

Two environment variables, both optional:

| Variable | Default | Effect |
| --- | --- | --- |
| `LMSTUDIO_BASE_URL` | `http://localhost:1234` | Non-default host or port |
| `LMSTUDIO_ALL_MODELS` | unset | Set to `1` to list downloaded models too, so LM Studio can load them on demand |

## Behaviour worth knowing

**Discovery runs once, at startup.** opencode's `config` hook fires when it starts,
so the list reflects what was loaded at that moment. Load a different model and
restart opencode to pick it up. There is no hook that re-runs on config refresh.

**If nothing is loaded, nothing is offered.** LM Studio unreachable, a non-200
response, or an empty result all produce an empty model list rather than a fallback
to models.dev entries you cannot run. The LM Studio provider simply does not appear
in the picker. An empty list is the honest answer; a list of unrunnable models is not.

**Per-instance ids are preserved.** If you serve one model from several hosts, LM
Studio reports each instance separately and Muster keeps them separate — so
`llm1-studio/gemma-4-26b` and `llm2-studio/gemma-4-26b` remain two entries you can
target individually, rather than collapsing into one.

**Everything stays local.** The only network call is to your own LM Studio server,
with a 2-second timeout.

## Requirements

- opencode with the plugin `config` hook (`@opencode-ai/plugin` 1.17+)
- LM Studio with the local server enabled and the native `/api/v0/models` endpoint

## License

[MIT](LICENSE)
