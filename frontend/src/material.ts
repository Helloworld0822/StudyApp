import ky from "ky";
import { z } from "zod";
import { questionSchema } from "./imported";

export const materialSubjectSchema = z.enum(["korean", "english", "math"]);
export type MaterialSubject = z.infer<typeof materialSubjectSchema>;
export const difficultySchema = z.enum(["basic", "standard", "challenge"]);
export const countSchema = z.coerce.number().int().min(1).max(5);
export const materialTopics = {
	korean: ["읽기", "문법", "어휘", "문학", "추론", "맞춤법", "띄어쓰기"],
	english: ["독해", "어휘", "기초 문법", "빈칸 추론", "문장 순서"],
	math: ["방정식", "함수", "덧셈", "뺄셈", "곱셈", "나눗셈", "분수", "문장제", "연산 순서", "기하", "확률과 통계"],
} as const satisfies Record<MaterialSubject, readonly string[]>;
export const aiStatusSchema = z.object({ configured: z.boolean() });
const httpsUrl = z.string().url().refine((value) => new URL(value).protocol === "https:");
const sourceSchema = z.object({
	text: z.string().trim().min(20).max(12000),
	sourceUrl: httpsUrl,
	sourceTitle: z.string().max(200),
});
const generatedSchema = z.object({
	questions: z.array(z.object({
		subject: materialSubjectSchema,
		topic: questionSchema.shape.topic,
		prompt: questionSchema.shape.prompt,
		options: questionSchema.shape.options,
		answer: questionSchema.shape.answer,
		explanation: z.string().trim().min(1).max(10000),
		passage: z.string().trim().min(1).max(12000).optional(),
	})).min(1).max(5),
});
const requestSchema = z.object({
	subject: materialSubjectSchema,
	topic: z.string().trim().min(1).max(100),
	text: z.string().trim().min(20).max(12000),
	difficulty: difficultySchema,
	count: countSchema,
});
export type MaterialInput = z.infer<typeof requestSchema>;

export class MaterialError extends Error {}

export async function loadMaterial(url: string, signal: AbortSignal) {
	const validUrl = httpsUrl.safeParse(url.trim());
	if (!validUrl.success) throw new MaterialError("공개 HTTPS 페이지 주소를 입력해 주세요.");
	const response = await ky.post("/api/import/material", {
		json: { url: validUrl.data }, signal, timeout: 20000, retry: 0, throwHttpErrors: false,
	});
	const payload: unknown = await response.json();
	if (!response.ok) throw new MaterialError(errorMessage(payload, "본문을 가져오지 못했어요. 공개 HTML 페이지인지 확인해 주세요."));
	const parsed = sourceSchema.safeParse(payload);
	if (!parsed.success) throw new MaterialError("본문 형식을 읽지 못했어요. 20~12,000자의 자료를 직접 붙여 넣어 주세요.");
	return parsed.data;
}

export async function generateMaterial(input: MaterialInput, signal: AbortSignal) {
	const validInput = requestSchema.safeParse(input);
	if (!validInput.success) throw new MaterialError("과목·학습 주제와 20~12,000자의 자료를 확인해 주세요.");
	const response = await ky.post("/api/ai/material", {
		json: validInput.data, signal, timeout: 100000, retry: 0, throwHttpErrors: false,
	});
	const payload: unknown = await response.json();
	if (!response.ok) throw new MaterialError(errorMessage(payload, "문제를 만들지 못했어요. 잠시 후 다시 시도해 주세요."));
	const parsed = generatedSchema.safeParse(payload);
	if (!parsed.success || parsed.data.questions.length !== input.count
		|| parsed.data.questions.some((question) => question.subject !== input.subject || question.topic !== input.topic)
		|| new Set(parsed.data.questions.map((question) => question.prompt.trim())).size !== input.count) {
		throw new MaterialError("생성된 문제 형식이 올바르지 않아요. 다시 만들어 주세요.");
	}
	return parsed.data.questions;
}

function errorMessage(payload: unknown, fallback: string): string {
	const parsed = z.object({ error: z.string().min(1).max(1000) }).safeParse(payload);
	return parsed.success ? parsed.data.error : fallback;
}
