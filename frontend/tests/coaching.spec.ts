import { test, expect, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { analyzeTopics, selectFocusedQuestions, topicGuidance, type Attempt } from "../src/coaching";
import { questions, type Question } from "../src/questions";

const base = "http://localhost:5173";
const evidence = "../.omo/evidence/coaching";
const key = "oneul-learning-attempts-v1";
const fractions = questions.filter((question) => question.subject === "math" && question.topic === "분수");
const first = fractions[0];
if (first === undefined) throw new TypeError("Expected fraction fixtures");

const attempt = (question: Question, correct: boolean, at: number): Attempt => ({
	questionId: question.id,
	subject: question.subject,
	topic: question.topic,
	selectedAnswer: correct ? question.answer : (question.answer + 1) % 5,
	correct,
	at,
});

test("topic evidence uses latest five attempts and separates subjects", () => {
	const earlyWrong = fractions.map((question, index) => attempt(question, false, index));
	const laterCorrect = Array.from({ length: 5 }, (_, index) => {
		const question = fractions[index % fractions.length];
		if (question === undefined) throw new TypeError("Expected fixture");
		return attempt(question, true, 10 + index);
	});
	const topics = analyzeTopics([...earlyWrong, ...laterCorrect, { ...attempt(first, false, 20), subject: "english" }], questions);
	const math = topics.find((topic) => topic.subject === "math");
	expect(math?.recent).toHaveLength(5);
	expect(math?.accuracy).toBe(100);
	expect(math?.distinct).toBe(3);
	expect(math?.status).toBe("steady");
	expect(math?.improving).toBe(true);
	expect(topics.find((topic) => topic.subject === "english")?.accuracy).toBe(0);
});

test("repeating one correct answer cannot establish stable understanding", () => {
	const repeated = Array.from({ length: 7 }, (_, index) => attempt(first, true, index));
	const topic = analyzeTopics(repeated, questions)[0];
	expect(topic?.accuracy).toBe(100);
	expect(topic?.distinct).toBe(1);
	expect(topic?.status).toBe("limited");
	expect(analyzeTopics([], questions)).toEqual([]);
});

test("focused practice selects exact topic, latest mistakes then unseen then correct", () => {
	const second = fractions[1];
	const third = fractions[2];
	if (second === undefined || third === undefined) throw new TypeError("Expected three fractions");
	const attempts = [attempt(first, false, 1), attempt(first, true, 4), attempt(second, false, 3)];
	expect(selectFocusedQuestions(questions, attempts, { subject: "math", topic: "분수" }).map((question) => question.id))
		.toEqual([second.id, third.id, first.id]);
	expect(selectFocusedQuestions(questions, attempts, { subject: "math", topic: "없는 주제" })).toEqual([]);
	expect(topicGuidance({ subject: "korean", topic: "읽기" }).join(" ")).toContain("근거 문장");
	expect(topicGuidance({ subject: "english", topic: "기초 문법" }).join(" ")).toContain("주어·동사");
});

test("attempt storage rejects damaged data and retains latest 2000 attempts", async ({ page }) => {
	await page.goto(base);
	const output = await page.evaluate(async ({ storageKey, seed }) => {
		const modulePath = "/src/coaching.ts";
		const { loadAttempts, saveAttempts } = await import(modulePath);
		localStorage.setItem(storageKey, "{broken");
		const damaged = loadAttempts();
		localStorage.setItem(storageKey, JSON.stringify([{ ...seed, selectedAnswer: 9 }]));
		const invalid = loadAttempts();
		const notice = saveAttempts(Array.from({ length: 2005 }, (_, at) => ({ ...seed, at })));
		const saved = loadAttempts();
		return { damaged, invalid, notice, length: saved.attempts.length, first: saved.attempts[0]?.at, last: saved.attempts.at(-1)?.at };
	}, { storageKey: key, seed: attempt(first, false, 0) });
	expect(output.damaged.attempts).toEqual([]);
	expect(output.damaged.notice).not.toBeNull();
	expect(output.invalid.attempts).toEqual([]);
	expect(output.invalid.notice).not.toBeNull();
	expect(output.notice).toBeNull();
	expect(output.length).toBe(2000);
	expect(output.first).toBe(5);
	expect(output.last).toBe(2004);
});

async function capture(page: Page, name: string) {
	await mkdir(evidence, { recursive: true });
	await page.screenshot({ path: `${evidence}/${name}.png`, fullPage: true });
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

test("coach empty state, subject filters and insufficient evidence", async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto(base);
	const coach = page.getByRole("region", { name: "맞춤 학습 지도" });
	await expect(coach.getByText("먼저 풀어 보면, 함께 방향을 찾을 수 있어요")).toBeVisible();
	await capture(page, "empty-390");
	await page.evaluate(({ key, attempts }) => localStorage.setItem(key, JSON.stringify(attempts)), {
		key,
		attempts: Array.from({ length: 5 }, (_, index) => attempt(first, true, index)),
	});
	await page.reload();
	await expect(coach.getByText("확인 필요", { exact: true })).toBeVisible();
	await expect(coach.getByText(/서로 다른 문제 1개/)).toBeVisible();
	await expect(coach.getByText("최근 풀이 안정적", { exact: true })).toHaveCount(0);
	await coach.getByLabel("학습 지도 과목").selectOption("english");
	await expect(coach.getByText("먼저 풀어 보면, 함께 방향을 찾을 수 있어요")).toBeVisible();
	await coach.getByLabel("학습 지도 과목").selectOption("math");
	await capture(page, "limited-390");
});

test("coach keeps passage evidence and records an answer before session completion", async ({ page }) => {
	const material: Question = {
		...first, id: "ai-coach-passage", subject: "korean", topic: "읽기", aiGenerated: true,
		prompt: "글의 중심 내용은 무엇인가요?", sourceLabel: "직접 입력한 연습 자료",
		passage: "책을 읽고 핵심 내용을 한 문장으로 정리하면 글의 구조를 이해하는 데 도움이 된다.",
	};
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto(base);
	await page.evaluate(({ key, question, answer }) => {
		localStorage.setItem("oneul-imported-questions-v1", JSON.stringify([question]));
		localStorage.setItem(key, JSON.stringify([answer]));
	}, { key, question: material, answer: attempt(material, false, 1) });
	await page.reload();
	const coach = page.getByRole("region", { name: "맞춤 학습 지도" });
	await coach.getByText("최근 오답의 근거 되짚기", { exact: true }).click();
	await expect(coach.getByText(material.passage ?? "", { exact: true })).toBeVisible();
	await expect(coach.getByText("자료: 직접 입력한 연습 자료", { exact: true })).toBeVisible();
	await capture(page, "passage-evidence-390");
	await coach.getByRole("button", { name: "읽기 보완 연습", exact: true }).click();
	await page.locator(".option").nth(material.answer).click();
	await page.getByRole("button", { name: "정답 확인하기" }).click();
	await page.getByRole("button", { name: "홈으로 이동" }).click();
	await page.reload();
	await expect(coach.getByText(/가장 최근에는 맞혔어요/)).toBeVisible();
	const saved = await page.evaluate((storageKey) => localStorage.getItem(storageKey), key);
	expect(JSON.parse(saved ?? "[]")).toHaveLength(2);
});

test("weak-topic practice, corrective evidence, reassessment and reload persistence", async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await page.route("**/api/ai/status", (route) => route.fulfill({ json: { configured: false, model: "QA" } }));
	await page.goto(base);
	await page.evaluate(({ key, attempts }) => localStorage.setItem(key, JSON.stringify(attempts)), {
		key,
		attempts: fractions.map((question, index) => attempt(question, false, index)),
	});
	await page.reload();
	const coach = page.getByRole("region", { name: "맞춤 학습 지도" });
	await expect(coach.getByText("보완 추천", { exact: true })).toBeVisible();
	await coach.getByText("최근 오답의 근거 되짚기", { exact: true }).click();
	await expect(coach.getByText(/내 선택:/)).toBeVisible();
	await capture(page, "weak-1440");
	for (let round = 0; round < 2; round += 1) {
		await coach.getByRole("button", { name: "분수 보완 연습", exact: true }).click();
		for (let index = 0; index < fractions.length; index += 1) {
			await expect(page.locator(".question-card > .topic").first()).toContainText("분수");
			const prompt = await page.locator(".question-card > h2").innerText();
			const question = fractions.find((item) => item.prompt === prompt);
			if (question === undefined) throw new TypeError("Focused practice escaped its topic");
			await page.locator(".option").nth(question.answer).click();
			await page.getByRole("button", { name: "정답 확인하기" }).click();
			await page.getByRole("button", { name: index === fractions.length - 1 ? "결과 보기" : "다음 문제" }).click();
		}
		await expect(coach.getByText("가장 최근에는 맞혔어요.", { exact: false })).toBeVisible();
		await capture(page, `reassessment-${round}-1440`);
	}
	await expect(coach.getByText("최근 풀이 안정적", { exact: true })).toBeVisible();
	await page.getByRole("button", { name: "홈으로", exact: true }).click();
	await page.reload();
	await expect(coach.getByText("최근 풀이 안정적", { exact: true })).toBeVisible();
	const saved = await page.evaluate((storageKey) => localStorage.getItem(storageKey), key);
	expect(JSON.parse(saved ?? "[]")).toHaveLength(9);
	await capture(page, "persisted-1440");
});
