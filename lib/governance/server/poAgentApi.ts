import { NextResponse } from "next/server";
import { z } from "zod";

import { assertPoAgentExecutionAllowed, PoAgentConfigurationError, runReadOnlyPoAgent, type PoAgentResponse } from "../agent/orchestrator";

const questionSchema = z.object({ question: z.string().trim().min(1).max(2_000) }).strict();
type AgentRunner = (question: string) => Promise<PoAgentResponse>;
interface PoAgentPostOptions {
  environment?: Record<string, string | undefined>;
  runner?: AgentRunner;
}

export async function handlePoAgentPost(request: Request, options: PoAgentPostOptions = {}) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  const parsed = questionSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Question must contain 1 to 2000 characters." }, { status: 400 });
  try {
    assertPoAgentExecutionAllowed(options.environment);
    return NextResponse.json(await (options.runner ?? runReadOnlyPoAgent)(parsed.data.question));
  } catch (error) {
    if (error instanceof PoAgentConfigurationError) return NextResponse.json({ error: error.message, configured: false, readOnly: true }, { status: 503 });
    console.error("PO Agent request failed", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ error: "PO Agent request failed without changing canonical scope.", readOnly: true }, { status: 500 });
  }
}
