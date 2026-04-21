import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY;

export const gemini = apiKey ? new GoogleGenAI({ apiKey }) : null;

export const GEMINI_MODEL = "gemini-2.5-flash";
