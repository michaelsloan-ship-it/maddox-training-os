import { expect, test } from "@playwright/test";

const labPath = "/ops/po-review-7f3";

test("Phase B Project Owner Lab is unlinked, read-only, and safely testable without a live model", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(`a[href="${labPath}"]`)).toHaveCount(0);
  await expect(page.locator('a[href*="po-agent"], a[href*="po-review"]')).toHaveCount(0);

  await page.goto(labPath);
  await expect(page.getByRole("heading", { name: "Project Owner Lab" })).toBeVisible();
  await expect(page.getByText("READ-ONLY", { exact: true })).toBeVisible();
  await expect(page.getByText("PHASE B", { exact: true })).toBeVisible();
  await expect(page.getByText(/Agent (?:configured|unconfigured)/)).toBeVisible();
  await expect(page.getByText("docs/SCOPE.md", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Save|Apply|Commit|Create PR/i })).toHaveCount(0);

  await page.route("**/api/ops/po-agent", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ answer: "# Recommendation\n\nObserved fact: **canonical scope remains unchanged**. [unsafe](javascript:alert(1))", readOnly: true, canonicalSource: "docs/SCOPE.md", sourceRevision: "browser-fixture", diagnosticCount: 0, usage: { model: "gpt-5.6-sol", inputTokens: 27705, outputTokens: 270, totalTokens: 27975, cachedInputTokens: null, uncachedInputTokens: 27705, estimatedCostUsd: 0.146625, costLabel: "ESTIMATED", costAssumption: "assumes_uncached_input", costLimitation: null }, contextTelemetry: { configuredMode: "shadow", mode: "shadow", taskClass: "po_next_work_explanation", classificationStatus: "supported", fallbackReason: null, baselineInputTokens: 27705, rawEvidenceItemCount: 7, rawEstimatedTokens: 1600, legacyEquivalentEstimatedTokens: 12000, packedEvidenceItemCount: 7, packedEstimatedTokens: 1600, omittedEvidenceCount: 0, mandatoryEvidenceRetained: true, budgetStatus: "FIT", estimatedReductionPercent: 86.7, actualInputTokens: 27705, aggregateRunInputTokens: 27705, aggregateRunOutputTokens: 270, modelRequestCount: 2, perRequestUsage: null, toolCallCount: 1 } }) });
  });
  await page.getByLabel("Product Owner question").fill("Make GOV-PO-AGENT-001 P0");
  await page.getByRole("button", { name: "Ask read-only agent" }).click();
  await expect(page.locator("[data-po-response]")).toContainText("canonical scope remains unchanged");
  await expect(page.locator("[data-po-response] h2")).toHaveText("Recommendation");
  await expect(page.locator("[data-po-response] strong")).toHaveText("canonical scope remains unchanged");
  await expect(page.locator('[data-po-response] a[href^="javascript:"]')).toHaveCount(0);
  await expect(page.locator("[data-po-usage]")).toContainText("27975");
  await expect(page.locator("[data-po-usage]")).toContainText("$0.146625");
  await expect(page.locator("[data-po-usage]")).toContainText("Uncached input");
  await expect(page.locator("[data-po-context-telemetry]")).toContainText("shadow");
  await expect(page.locator("[data-po-context-telemetry]")).toContainText("86.7%");

  await page.goto("/today");
  await expect(page).toHaveURL(/\/day\/\d{4}-\d{2}-\d{2}$/);
});
