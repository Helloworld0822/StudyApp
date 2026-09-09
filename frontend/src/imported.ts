import { z } from "zod";
import type { Question } from "./questions";

const sourceUrlSchema = z
	.string()
	.url()
	.refine((value) => new URL(value).protocol === "https:");
export const subjectSchema = z.enum([
	"math",
	"english",
	"korean",
	"discrete",
	"algorithms",
]);
export const questionSchema = z.object({
	id: z.string().min(1).max(250),
	subject: subjectSchema,
	topic: z.string().min(1).max(200),
	prompt: z.string().min(1).max(10000),
	options: z
		.array(z.string().min(1).max(3000))
		.length(5)
		.refine((items) => new Set(items).size === 5),
	answer: z.number().int().min(0).max(4),
	explanation: z.string().max(10000),
	sourceUrl: sourceUrlSchema.optional(),
	aiGenerated: z.boolean().optional(),
});

export const importResultSchema = z.object({
	sourceUrl: sourceUrlSchema,
	sourceTitle: z.string().max(1000),
	questions: z
		.array(questionSchema.extend({ sourceUrl: sourceUrlSchema }))
		.min(1)
		.max(30)
		.refine(
			(items) => new Set(items.map((item) => item.id)).size === items.length,
		),
	warnings: z.array(z.string()),
});

export type ImportResult = z.infer<typeof importResultSchema>;
const savedQuestionsSchema = z.array(questionSchema).max(500);
const storageKey = "oneul-imported-questions-v1";

export const loadImported = (): {
	readonly questions: readonly Question[];
	readonly notice: string | null;
} => {
	try {
		const raw = localStorage.getItem(storageKey);
		if (raw === null) return { questions: [], notice: null };
		const value: unknown = JSON.parse(raw);
		const parsed = savedQuestionsSchema.safeParse(value);
		if (parsed.success) return { questions: parsed.data, notice: null };
		return {
			questions: [],
			notice:
				"저장된 웹 문제 형식을 읽을 수 없어요. 원문 URL로 다시 가져와 주세요.",
		};
	} catch (error) {
		if (error instanceof SyntaxError)
			return {
				questions: [],
				notice:
					"저장된 웹 문제를 읽을 수 없어요. 원문 URL로 다시 가져와 주세요.",
			};
		if (error instanceof DOMException)
			return {
				questions: [],
				notice:
					"브라우저 저장소를 사용할 수 없어 웹 문제는 이번 방문 동안만 유지돼요.",
			};
		throw error;
	}
};

export const saveImported = (items: readonly Question[]): string | null => {
	try {
		localStorage.setItem(storageKey, JSON.stringify(items));
		return null;
	} catch (error) {
		if (error instanceof DOMException)
			return "웹 문제를 저장하지 못했어요. 이번 방문 동안에는 학습할 수 있어요.";
		throw error;
	}
};
