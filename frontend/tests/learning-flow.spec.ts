import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const base = "http://localhost:5173";
const evidence = "../.omo/evidence/learning-flow";
const passage = "Students learn more effectively when they explain why an answer is correct. Reading the same answer repeatedly can feel familiar, but applying the idea to a new situation provides stronger evidence of understanding.";
const generated = {
	subject: "english", topic: "독해", passage,
	prompt: "According to the passage, what provides stronger evidence of understanding?",
	options: ["Applying an idea to a new situation", "Memorizing an answer number", "Reading the same answer repeatedly", "Avoiding explanations", "Skipping unfamiliar questions"],
	answer: 0,
	explanation: "마지막 문장에서 새로운 상황에 개념을 적용하는 것이 이해의 더 강한 근거라고 했습니다. 같은 답을 반복해서 읽어 익숙해지는 것과 실제 적용을 구분하세요.",
};

test("material import rejects private destinations through the live backend", async ({ request }) => {
	const response = await request.post(`${base}/api/import/material`, { data: { url: "https://127.0.0.1/exam" } });
	expect(response.status()).toBe(422);
	expect(await response.json()).toEqual({ error: "안전하지 않은 대상 주소는 가져올 수 없습니다." });
});

for (const width of [390, 1440]) {
	for (const theme of ["light", "dark"] as const) {
		test(`material → attempt → coaching → focused retry at ${width} ${theme}`, async ({ browser }) => {
			const context = await browser.newContext({
				viewport: { width, height: 900 }, colorScheme: theme,
				isMobile: width === 390, hasTouch: width === 390, deviceScaleFactor: width === 390 ? 3 : 1,
			});
			const page = await context.newPage();
			const errors: string[] = [];
			page.on("pageerror", (error) => errors.push(error.message));
			await page.route("**/api/ai/status", (route) => route.fulfill({ json: { configured: true, model: "mock" } }));
			await page.route("**/api/ai/material", (route) => route.fulfill({ json: { questions: [generated] } }));
			await page.route("**/api/ai/explain", (route) => {
				expect(route.request().postDataJSON().question.passage).toBe(passage);
				return route.fulfill({ json: { explanation: "새로운 상황에 적용할 수 있는지 확인하는 것이 근거예요." } });
			});
			const capture = async (state: string) => {
				await mkdir(evidence, { recursive: true });
				await page.screenshot({ path: `${evidence}/${width}-${theme}-${state}.png`, fullPage: true });
				expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
			};
			try {
				await page.goto(base);
				await capture("home-empty");
				await page.getByLabel("문제 생성 과목").selectOption("english");
				await page.getByLabel("생성 문항 수").selectOption("1");
				await page.getByLabel("자료 이름 · 출처 (선택)").fill("모의고사 독해 연습");
				await page.getByLabel("지문 또는 원문 문제").fill(passage);
				await page.getByRole("button", { name: "자료로 문제 만들기", exact: true }).click();
				await expect(page.getByText("1문제를 만들었어요", { exact: true })).toBeVisible();
				await capture("material-preview");
				await page.locator(".material-preview summary").click();
				await expect(page.locator(".material-explanation")).toContainText("새로운 상황");
				await capture("material-answer");
				await page.getByRole("button", { name: "1문제 문제집에 추가", exact: true }).click();
				await page.reload();
				await page.locator(".subject-card.english").getByRole("button", { name: "추가한 문제만 풀기" }).click();
				await expect(page.getByLabel("문제 지문")).toHaveText(passage);
				await expect(page.getByText("자료: 모의고사 독해 연습", { exact: true })).toBeVisible();
				await capture("question");
				await page.locator(".option").nth(1).click();
				await page.getByRole("button", { name: "정답 확인하기" }).click();
				await expect(page.locator(".feedback")).toContainText(generated.explanation);
				await page.getByRole("button", { name: "AI 추가 해설", exact: true }).click();
				await expect(page.locator(".ai-explanation")).toBeVisible();
				await capture("feedback");
				await page.getByRole("button", { name: "결과 보기" }).click();
				const coach = page.getByRole("region", { name: "맞춤 학습 지도" });
				await expect(coach).toContainText("정답률 0%");
				await expect(coach).toContainText("서로 다른 문제 1개");
				await capture("results");
				await coach.getByText("최근 오답의 근거 되짚기", { exact: true }).click();
				await expect(coach).toContainText(passage);
				await capture("coach-expanded");
				await coach.getByRole("button", { name: "독해 보완 연습", exact: true }).click();
				await expect(page.getByRole("heading", { level: 1 })).toContainText("독해 보완");
				await page.locator(".option").nth(0).click();
				await page.getByRole("button", { name: "정답 확인하기" }).click();
				await page.getByRole("button", { name: "결과 보기" }).click();
				await expect(coach).toContainText("가장 최근에는 맞혔어요");
				await expect(coach).toContainText("확인 필요");
				await capture("reassessment");
				await page.getByRole("button", { name: "홈으로", exact: true }).click();
				await page.reload();
				await expect(coach).toContainText("최근 2회 중 1회 정답");
				await capture("home-persisted");
				await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
				await page.screenshot({ path: `${evidence}/${width}-${theme}-scrolled-end.png` });
				expect(errors).toEqual([]);
			} finally { await context.close(); }
		});
	}
}
