import { NextResponse, type NextRequest } from "next/server";
import { AiRefusalError, AiUnavailableError } from "@/lib/ai/claude";
import { AI_TASKS, isAiTask } from "@/lib/ai/schemas";
import { runAiTask } from "@/lib/ai/tasks";

export async function POST(request: NextRequest, { params }: { params: Promise<{ task: string }> }) {
  const { task } = await params;
  if (!isAiTask(task)) return NextResponse.json({ error: "unknown_task" }, { status: 404 });

  // Only the Verso app itself may call these endpoints from a browser.
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== request.headers.get("host")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body: unknown = await request.json().catch(() => null);
  const input = AI_TASKS[task].request.safeParse(body);
  if (!input.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  try {
    // The union of task inputs is validated above for this exact task.
    const result = await runAiTask(task, input.data as never);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof AiUnavailableError) return NextResponse.json({ error: "ai_not_configured" }, { status: 503 });
    if (error instanceof AiRefusalError) return NextResponse.json({ error: "declined" }, { status: 422 });
    console.error(`AI task ${task} failed`, error);
    return NextResponse.json({ error: "ai_failed" }, { status: 502 });
  }
}
