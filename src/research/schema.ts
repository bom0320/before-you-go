import { z } from 'zod';
import { procedureOutput, type ProcedureInput } from '../procedure/schema.js';

export const researchLimits = Object.freeze({
  maxRounds: 3, maxSearchQueries: 4, maxSources: 6,
  totalTimeoutMs: 90_000, requestTimeoutMs: 15_000, modelTimeoutMs: 30_000,
  maxDocumentBytes: 1_000_000, maxDocumentChars: 24_000, maxRedirects: 3,
});
export type ResearchLimits = { -readonly [K in keyof typeof researchLimits]: number };
export const findingSchema = z.strictObject({
  key: z.string().min(1).max(80),
  sourceId: z.string().min(1),
  quote: z.string().min(20).max(1500),
  claim: z.string().min(1).max(1000),
  scope: z.string().min(1).max(1000),
});
export const draftSchema = procedureOutput.omit({ evidence: true });
export const completeSchema = z.strictObject({
  type: z.literal('complete'), findings: z.array(findingSchema).max(24), draft: draftSchema,
});
export const decisionSchema = z.strictObject({ decision: z.union([
  z.strictObject({ type: z.literal('search'), queries: z.array(z.string().trim().min(1).max(300)).min(1).max(4) }),
  z.strictObject({ type: z.literal('inspect'), sourceIds: z.array(z.string().min(1)).min(1).max(6) }),
  completeSchema,
  z.strictObject({ type: z.literal('needs_information'), questions: procedureOutput.shape.missingInformation.min(1).max(4) }),
]) });
export type Decision = z.infer<typeof decisionSchema>['decision'];
export type Completion = z.infer<typeof completeSchema>;
export type Finding = z.infer<typeof findingSchema>;
export const reviewSchema = z.strictObject({
  draftSupported: z.boolean(),
  reason: z.string().min(1).max(1000),
  findings: z.array(z.strictObject({
    key: z.string(), verdict: z.enum(['supported', 'uncertain', 'unsupported']), reason: z.string().max(1000),
  })).max(24),
});
export type Review = z.infer<typeof reviewSchema>;
export type Candidate = { id: string; url: string };
export type Source = Candidate & { text: string; retrievedAt: string; links: string[] };
export type ResearchContext = {
  input: ProcedureInput;
  candidates: Candidate[];
  sources: Source[];
  failures: { sourceId: string; code: string }[];
  feedback: string[];
  remaining: { rounds: number; searches: number; inspections: number };
};
export type ResearchDependencies = {
  decide(context: ResearchContext, signal: AbortSignal): Promise<Decision>;
  search(query: string, signal: AbortSignal): Promise<string[]>;
  inspect(candidate: Candidate, signal: AbortSignal): Promise<Source>;
  review(context: ResearchContext, completion: Completion, signal: AbortSignal): Promise<Review>;
};
export class ResearchError extends Error {
  constructor(public readonly code: string, message: string) { super(message); this.name = 'ResearchError'; }
}
