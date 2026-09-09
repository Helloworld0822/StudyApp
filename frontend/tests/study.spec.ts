import { test, expect, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { questions } from "../src/questions";
import { questionSchema } from "../src/imported";

const base = "http://localhost:5173";
const evidence = "../.omo/evidence";

test("live backend health and unsafe import rejection", async ({ request }) => {
	const health = await request.get(`${base}/api/health`);
	expect(health.status()).toBe(200);
	expect(await health.json()).toEqual({ status: "ok" });
	const rejected = await request.post(`${base}/api/import/questions`, {
		data: { url: "https://127.0.0.1/questions", subject: "math" },
	});
	expect(rejected.status()).toBe(422);
	expect(await rejected.json()).toEqual({
		error: "안전하지 않은 대상 주소는 가져올 수 없습니다.",
	});
	const invalid = await request.post(`${base}/api/ai/generate`, {
		data: {
			question: {
				subject: "math",
				topic: "addition",
				prompt: "1+1?",
				options: ["1", "2"],
				answer: 1,
				explanation: "",
			},
		},
	});
	expect(invalid.status()).toBe(400);
});

async function capture(page: Page, name: string) {
	await mkdir(evidence, { recursive: true });
	await page.screenshot({ path: `${evidence}/${name}.png`, fullPage: true });
	expect(
		await page.evaluate(
			() => document.documentElement.scrollWidth <= innerWidth,
		),
	).toBe(true);
}
async function answer(page: Page, wrong = false) {
	const prompt = await page.locator(".question-card > h2").innerText();
	const question = questions.find((item) => item.prompt === prompt);
	if (!question) throw new Error(`Unknown question: ${prompt}`);
	await expect(page.locator(".option")).toHaveCount(5);
	await expect(
		page.getByRole("button", { name: "정답 확인하기" }),
	).toBeDisabled();
	await page
		.locator(".option")
		.nth(wrong ? (question.answer + 1) % 5 : question.answer)
		.click();
	await page.getByRole("button", { name: "정답 확인하기" }).click();
	await expect(page.locator(".feedback")).toContainText(
		wrong ? "조금 아쉬워요." : "정답이에요!",
	);
	await expect(page.locator(".option:disabled")).toHaveCount(5);
}

test("five subjects, score, persistence, review and responsive pages", async ({
	page,
}) => {
	const errors: string[] = [];
	page.on("pageerror", (error) => errors.push(error.message));
	expect(questions).toHaveLength(54);
	expect(new Set(questions.map((item) => item.id)).size).toBe(54);
	for (const question of questions)
		expect(questionSchema.safeParse(question).success).toBe(true);
	await page.setViewportSize({ width: 1280, height: 900 });
	await page.route("**/api/ai/status", (route) =>
		route.fulfill({ json: { configured: false, model: "QA unconfigured" } }),
	);
	await page.goto(base);
	await capture(page, "home-1280");
	for (const width of [768, 390]) {
		await page.setViewportSize({ width, height: 844 });
		await capture(page, `home-${width}`);
	}
	for (const [subjectIndex, subject] of [
		"수학",
		"영어",
		"국어",
		"이산수학",
		"알고리즘",
	].entries()) {
		await page
			.getByRole("button", { name: `${subject} 5문제 시작`, exact: true })
			.click();
		for (let index = 0; index < 5; index++) {
			if (index === 0) await capture(page, `quiz-${subjectIndex}-390`);
			await answer(page, subjectIndex === 0 && index === 0);
			if (subjectIndex === 0 && index === 0) {
				await expect(
					page.getByText("AI 연결 설정이 필요해요.", { exact: false }),
				).toBeVisible();
				await capture(page, "feedback-390");
			}
			await page
				.getByRole("button", { name: index === 4 ? "결과 보기" : "다음 문제" })
				.click();
		}
		await expect(page.locator(".result-card > strong")).toHaveText(
			subjectIndex === 0 ? "4 / 5" : "5 / 5",
		);
		if (subjectIndex === 0) await capture(page, "results-390");
		await page.getByRole("button", { name: "홈으로", exact: true }).click();
	}
	await page.reload();
	await expect(page.locator(".stats")).toContainText("25문제 풀이");
	await expect(page.locator(".review-link")).toContainText("1");
	await page.locator(".review-link").click();
	await capture(page, "review-390");
	await answer(page);
	await page.getByRole("button", { name: "결과 보기" }).click();
	await expect(page.getByRole("button", { name: "한 번 더 풀기" })).toHaveCount(
		0,
	);
	await page.getByRole("button", { name: "홈으로", exact: true }).click();
	await page.reload();
	await expect(page.locator(".review-link")).toContainText("0");
	expect(errors).toEqual([]);
});

test("import validation, preview, duplicate protection and AI save with mock provider responses", async ({
	page,
}) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto(base);
	await page.getByLabel("문제 페이지 URL").fill("https://127.0.0.1/questions");
	await page.getByRole("button", { name: "문제 미리보기" }).click();
	await expect(page.locator(".import-message")).not.toBeEmpty();
	await capture(page, "import-error-390");
	const imported = {
		...questions[0],
		id: "fixture-import-1",
		sourceUrl: "https://example.org/questions",
	};
	await page.route("**/api/import/questions", (route) =>
		route.fulfill({
			json: {
				sourceUrl: imported.sourceUrl,
				sourceTitle: "QA fixture",
				questions: [imported],
				warnings: [],
			},
		}),
	);
	await page.getByLabel("문제 페이지 URL").fill(imported.sourceUrl);
	await page.getByRole("button", { name: "문제 미리보기" }).click();
	await expect(page.getByText("1문제를 찾았어요")).toBeVisible();
	await capture(page, "import-preview-390");
	await page.getByRole("button", { name: "1문제 추가하기" }).click();
	await page.reload();
	await page.getByLabel("문제 페이지 URL").fill(imported.sourceUrl);
	await page.getByRole("button", { name: "문제 미리보기" }).click();
	await expect(
		page.getByRole("button", { name: "이미 추가한 문제예요" }),
	).toBeDisabled();
	await page.route("**/api/ai/status", (route) =>
		route.fulfill({ json: { configured: true, model: "QA mock" } }),
	);
	await page.route("**/api/ai/explain", (route) =>
		route.fulfill({ json: { explanation: "모의 제공자 추가 해설입니다." } }),
	);
	await page.route("**/api/ai/generate", (route) =>
		route.fulfill({
			json: {
				question: {
					subject: "math",
					topic: "덧셈",
					prompt: "3 + 4는 얼마인가요?",
					options: ["5", "6", "7", "8", "9"],
					answer: 2,
					explanation: "3에 4를 더하면 7입니다.",
				},
			},
		}),
	);
	await page.getByRole("button", { name: "추가한 문제만 풀기" }).click();
	await answer(page);
	await page.getByRole("button", { name: "AI 추가 해설", exact: true }).click();
	await expect(page.getByText("모의 제공자 추가 해설입니다.")).toBeVisible();
	await page.getByRole("button", { name: "5지선다 유사 문제 만들기" }).click();
	await expect(page.locator(".ai-generated li")).toHaveCount(5);
	await capture(page, "ai-preview-390");
	await page.getByRole("button", { name: "확인하고 문제집에 추가" }).click();
	await expect(
		page.getByRole("button", { name: "문제집에 추가했어요" }),
	).toBeDisabled();
	await page.reload();
	const saved = await page.evaluate(() =>
		localStorage.getItem("oneul-imported-questions-v1"),
	);
	expect(saved).toContain("3 + 4는 얼마인가요?");
});
