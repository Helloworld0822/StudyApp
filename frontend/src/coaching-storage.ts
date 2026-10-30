import { z } from "zod";
import { subjectSchema } from "./imported";

export const attemptSchema = z.object({
	questionId: z.string().min(1).max(250),
	subject: subjectSchema,
	topic: z.string().min(1).max(200),
	selectedAnswer: z.number().int().min(0).max(4),
	correct: z.boolean(),
	at: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
});
export type Attempt = Readonly<z.infer<typeof attemptSchema>>;
const attemptsSchema = z.array(attemptSchema).max(2000);
const storageKey = "oneul-learning-attempts-v1";

export const loadAttempts = (): {
	readonly attempts: readonly Attempt[];
	readonly notice: string | null;
} => {
	try {
		const raw = localStorage.getItem(storageKey);
		if (raw === null) return { attempts: [], notice: null };
		const value: unknown = JSON.parse(raw);
		const parsed = attemptsSchema.safeParse(value);
		return parsed.success
			? { attempts: parsed.data, notice: null }
			: { attempts: [], notice: "학습 지도 기록을 읽지 못했어요. 새 풀이부터 분석해요." };
	} catch (error) {
		if (error instanceof SyntaxError)
			return { attempts: [], notice: "학습 지도 기록이 손상되어 새 풀이부터 분석해요." };
		if (error instanceof DOMException)
			return { attempts: [], notice: "학습 지도 기록은 이번 방문 동안만 유지돼요." };
		throw error;
	}
};

export const saveAttempts = (attempts: readonly Attempt[]): string | null => {
	const parsed = attemptsSchema.safeParse(attempts.slice(-2000));
	if (!parsed.success) return "풀이 기록 형식이 올바르지 않아 저장하지 못했어요.";
	try {
		localStorage.setItem(storageKey, JSON.stringify(parsed.data));
		return null;
	} catch (error) {
		if (error instanceof DOMException)
			return "학습 지도 기록을 저장하지 못했어요. 이번 방문 동안에는 분석할 수 있어요.";
		throw error;
	}
};
