import OpenAI from "openai";
import { AI_CONFIG } from "./ai-config";

export function getGroqClient() {
  return new OpenAI({
    apiKey: process.env[AI_CONFIG.apiKeyEnvVar],
    baseURL: "https://api.groq.com/openai/v1",
  });
}
