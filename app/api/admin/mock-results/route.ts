import { NextRequest, NextResponse } from "next/server";

import {
  examBankJsonError,
  requireExamBankAdmin,
} from "../../../../lib/cambridgeExamBankServer";
import {
  editAdminMockResult,
  getAdminAwaitingMockResultCount,
  loadAdminMockResultReviews,
  MockResultWorkflowError,
  reviewTeacherMockResult,
  validateAdminMockResultEditInput,
} from "../../../../lib/mockResultWorkflowServer";

function expectedWorkflowError(error: any) {
  const message = String(error?.message || "");
  const allowed = [
    "not awaiting Admin review",
    "was not found",
    "All four Mock Exam scores",
    "Only Awaiting Admin Review or Published results",
    "Awaiting Review results cannot",
    "Published results require",
  ];
  return allowed.find((part) => message.includes(part)) ? message : "";
}

export async function GET(request: NextRequest) {
  try {
    const admin = await requireExamBankAdmin(request);
    if (admin.response) return admin.response;

    if (request.nextUrl.searchParams.get("mode") === "count") {
      return NextResponse.json(
        { awaiting_review: await getAdminAwaitingMockResultCount() },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    return NextResponse.json(
      { results: await loadAdminMockResultReviews() },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Admin Mock Result review load failed:", error);
    return examBankJsonError("Unable to load Mock Results for review.", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = await requireExamBankAdmin(request);
    if (admin.response) return admin.response;

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return examBankJsonError("Invalid Mock Result review request.", 400);
    }

    const action = body.action;
    if (
      action === "save_changes" ||
      action === "save_and_publish" ||
      action === "save_published"
    ) {
      const input = validateAdminMockResultEditInput(body);
      const result = await editAdminMockResult(admin.userId, input);
      const messages = {
        save_changes:
          "Admin changes saved. The result remains Awaiting Admin Review.",
        save_and_publish:
          "Admin changes saved and the Mock Result was published.",
        save_published:
          "Published Mock Result updated successfully.",
      } as const;

      return NextResponse.json({ result, message: messages[input.action] });
    }

    if (
      Object.keys(body).some(
        (key) => !["result_id", "action", "review_note"].includes(key)
      )
    ) {
      return examBankJsonError("Invalid Mock Result review request.", 400);
    }

    if (action !== "publish" && action !== "return") {
      return examBankJsonError("Choose a valid review action.", 400);
    }

    const result = await reviewTeacherMockResult({
      actorId: admin.userId,
      resultId: String(body.result_id || ""),
      action,
      reviewNote:
        typeof body.review_note === "string" ? body.review_note : "",
    });

    return NextResponse.json({
      result,
      message:
        action === "publish"
          ? "Mock Result published successfully."
          : "Mock Result returned to the Teacher for correction.",
    });
  } catch (error) {
    if (error instanceof MockResultWorkflowError) {
      return examBankJsonError(error.message, error.status);
    }
    const expected = expectedWorkflowError(error);
    if (expected) return examBankJsonError(expected, 409);

    console.error("Admin Mock Result review action failed:", error);
    return examBankJsonError("Unable to update the Mock Result review.", 500);
  }
}
