// ============================================================
// AI CONFIG — Change model & provider HERE. Nothing else needed.
// ============================================================

export type AIProvider = "groq" | "openai" | "anthropic";

export interface AIConfig {
  provider: AIProvider;
  model: string;
  apiKeyEnvVar: string;
  baseURL: string;
  maxTokens: number;
}

// ✅ Active config
export const AI_CONFIG: AIConfig = {
  provider: "groq",
  model: "llama-3.3-70b-versatile",
  apiKeyEnvVar: "GROQ_API_KEY",
  baseURL: "https://api.groq.com/openai/v1",
  maxTokens: 1024,
};

// ─── Presets — uncomment to switch ───────────────────────────

// Groq models:
// model: "llama-3.3-70b-versatile"   best quality (default)
// model: "llama-3.1-8b-instant"      fastest
// model: "mixtral-8x7b-32768"        long context
// model: "gemma2-9b-it"              lightweight

// OpenAI:
// export const AI_CONFIG: AIConfig = {
//   provider: "openai",
//   model: "gpt-4o-mini",
//   apiKeyEnvVar: "OPENAI_API_KEY",
//   baseURL: "https://api.openai.com/v1",
//   maxTokens: 1024,
// };

// Anthropic:
// export const AI_CONFIG: AIConfig = {
//   provider: "anthropic",
//   model: "claude-3-5-haiku-20241022",
//   apiKeyEnvVar: "ANTHROPIC_API_KEY",
//   baseURL: "https://api.anthropic.com/v1",
//   maxTokens: 1024,
// };
