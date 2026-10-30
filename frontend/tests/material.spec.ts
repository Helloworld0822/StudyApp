import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const base = "http://localhost:5173";
const evidence = "../.omo/evidence/material-ui";
const text = "민서는 도서관에서 책을 빌렸다. 책을 읽으며 새로운 사실을 알아가는 일이 즐거웠다.";

test.beforeEach(async ({ page }) => {
	await page.route("**/api/ai/status", (route) => route.fulfill({ json: { configured: true, model: "mock" } }));
});

for (const [subject, topic] of [["korean", "읽기"], ["english", "독해"], ["math", "방정식"]] as const) {
	test(`${subject} material generation saves passage and provenance after reload`, async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		let calls = 0;
		await page.route("**/api/ai/material", async (route) => {
			calls += 1;
			expect(route.request().postDataJSON()).toEqual({ subject, topic, text, difficulty: "standard", count: 1 });
			await route.fulfill({ json: { questions: [{ subject, topic, prompt: "이 자료에서 알 수 있는 사실은?", passage: text, options: ["책을 빌렸다", "운동했다", "잠들었다", "여행했다", "요리했다"], answer: 0, explanation: "자료에서 도서관에서 책을 빌렸다고 했습니다." }] } });
		});
		await page.goto(base);
		await page.getByLabel("문제 생성 과목").selectOption(subject);
		await page.getByLabel("생성 문항 수").selectOption("1");
		await page.getByLabel("자료 이름 · 출처 (선택)").fill("모의고사 연습 자료");
		await page.getByLabel("지문 또는 원문 문제").fill(text);
		expect(calls).toBe(0);
		await page.getByRole("button", { name: "자료로 문제 만들기", exact: true }).click();
		await expect(page.getByText("1문제를 만들었어요", { exact: true })).toBeVisible();
		await expect(page.locator(".material-preview .material-passage")).toHaveText(text);
		await expect(page.locator(".material-preview details")).not.toHaveAttribute("open");
		await mkdir(evidence, { recursive: true });
		await page.screenshot({ path: `${evidence}/${subject}-preview-390.png`, fullPage: true });
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
		await page.getByRole("button", { name: "1문제 문제집에 추가", exact: true }).click();
		await expect(page.getByRole("button", { name: "생성 문제를 추가했어요" })).toBeDisabled();
		await page.reload();
		const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("oneul-imported-questions-v1") ?? "[]"));
		expect(stored).toEqual(expect.arrayContaining([expect.objectContaining({ subject, topic, passage: text, sourceLabel: "모의고사 연습 자료", aiGenerated: true })]));
		expect(calls).toBe(1);
	});
}

test("source is editable and retained on generated questions", async ({ page }) => {
	await page.route("**/api/import/material", (route) => route.fulfill({ json: { text, sourceUrl: "https://example.org/exam", sourceTitle: "공개 시험 자료" } }));
	await page.route("**/api/ai/material", async (route) => {
		await route.fulfill({ json: { questions: [{ subject: "korean", topic: "읽기", prompt: "자료의 중심 내용은?", options: ["독서", "운동", "미술", "요리", "여행"], answer: 0, explanation: "책을 읽으며 사실을 알아가는 즐거움을 설명합니다." }] } });
	});
	await page.goto(base);
	await page.getByText("공개 웹페이지에서 본문 가져오기", { exact: true }).click();
	await page.getByLabel("자료 페이지 URL", { exact: true }).fill("https://example.org/exam");
	await page.getByRole("button", { name: "자료 본문 가져오기", exact: true }).click();
	await expect(page.getByLabel("지문 또는 원문 문제")).toHaveValue(text);
	await expect(page.getByLabel("자료 이름 · 출처 (선택)")).toHaveValue("공개 시험 자료");
	await page.getByLabel("지문 또는 원문 문제").fill(`${text} 보충 문장입니다.`);
	await page.getByLabel("생성 문항 수").selectOption("1");
	await page.getByRole("button", { name: "자료로 문제 만들기", exact: true }).click();
	await page.getByRole("button", { name: "1문제 문제집에 추가", exact: true }).click();
	expect(await page.evaluate(() => localStorage.getItem("oneul-imported-questions-v1"))).toContain('"sourceUrl":"https://example.org/exam"');
});

test("unconfigured AI keeps input available and generation disabled", async ({ page }) => {
	await page.route("**/api/ai/status", (route) => route.fulfill({ json: { configured: false, model: "mock" } }));
	await page.goto(base);
	await page.getByLabel("지문 또는 원문 문제").fill(text);
	await expect(page.getByRole("button", { name: "자료로 문제 만들기", exact: true })).toBeDisabled();
	await expect(page.getByText("문제 생성을 위해 서버 API 키 설정이 필요해요.", { exact: false })).toBeVisible();
});

test("rejects malformed or mismatched generated output and shows API errors", async ({ page }) => {
	let mode = 0;
	await page.route("**/api/ai/material", (route) => {
		mode += 1;
		return mode === 1
			? route.fulfill({ json: { questions: [{ subject: "math", topic: "방정식", prompt: "bad", options: ["1", "2"], answer: 0, explanation: "" }] } })
			: route.fulfill({ status: 422, json: { error: "이 자료로 문제를 만들 수 없어요." } });
	});
	await page.goto(base);
	await page.getByLabel("지문 또는 원문 문제").fill(text);
	await page.getByRole("button", { name: "자료로 문제 만들기", exact: true }).click();
	await expect(page.getByText("생성된 문제 형식이 올바르지 않아요.", { exact: false })).toBeVisible();
	await expect(page.locator(".material-preview")).toHaveCount(0);
	await page.getByRole("button", { name: "자료로 문제 만들기", exact: true }).click();
	await expect(page.getByText("이 자료로 문제를 만들 수 없어요.", { exact: true })).toBeVisible();
});

test("loading blocks duplicate submits and input changes", async ({ page }) => {
	let complete: (() => void) | undefined;
	const pending = new Promise<void>((resolve) => { complete = resolve; });
	let calls = 0;
	await page.route("**/api/ai/material", async (route) => {
		calls += 1;
		await pending;
		await route.fulfill({ status: 503, json: { error: "잠시 후 다시 시도해 주세요." } });
	});
	await page.goto(base);
	await page.getByLabel("지문 또는 원문 문제").fill(text);
	await page.getByRole("button", { name: "자료로 문제 만들기", exact: true }).click();
	await expect(page.getByRole("button", { name: "문제를 만드는 중…", exact: true })).toBeDisabled();
	await expect(page.getByLabel("지문 또는 원문 문제")).toBeDisabled();
	await expect(page.getByLabel("문제 생성 과목")).toBeDisabled();
	expect(calls).toBe(1);
	complete?.();
	await expect(page.getByText("잠시 후 다시 시도해 주세요.", { exact: true })).toBeVisible();
});

test("full library cannot save another generated question", async ({ page }) => {
	await page.addInitScript(() => {
		localStorage.setItem("oneul-imported-questions-v1", JSON.stringify(Array.from({ length: 500 }, (_, index) => ({
			id: `capacity-${index}`, subject: "korean", topic: "읽기", prompt: `기존 문제 ${index}`,
			options: ["1", "2", "3", "4", "5"], answer: 0, explanation: "설명", aiGenerated: true,
		}))));
	});
	await page.route("**/api/ai/material", (route) => route.fulfill({ json: { questions: [{
		subject: "korean", topic: "읽기", prompt: "새 문제", options: ["1", "2", "3", "4", "5"], answer: 0, explanation: "새 설명",
	}] } }));
	await page.goto(base);
	await page.getByLabel("지문 또는 원문 문제").fill(text);
	await page.getByLabel("생성 문항 수").selectOption("1");
	await page.getByRole("button", { name: "자료로 문제 만들기", exact: true }).click();
	await expect(page.getByRole("button", { name: "1문제 문제집에 추가", exact: true })).toBeDisabled();
	await expect(page.locator(".material-preview")).toContainText("합계 500개까지 저장할 수 있어요.");
});
