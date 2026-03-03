export type AIProvider = "groq";

export interface AIConfig {
  provider: AIProvider;
  model: string;
  apiKeyEnvVar: string;
  maxTokens: number;
}

export const AI_CONFIG: AIConfig = {
  provider: "groq",
  model: "llama-3.3-70b-versatile",
  apiKeyEnvVar: "GROQ_API_KEY",
  maxTokens: 1024,
};
