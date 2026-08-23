import { handlePoAgentPost } from "@/lib/governance/server/poAgentApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handlePoAgentPost(request);
}
