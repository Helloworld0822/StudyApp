import type { Subject } from "./questions";
import { z } from "zod";

export type LearningStats = {
	readonly sessions: number;
	readonly answers: number;
	readonly correct: number;
	readonly sessionsBySubject: Record<Subject, number>;
};

export type LearningRecord = {
	readonly stats: LearningStats;
	readonly wrongIds: readonly string[];
};

const key = "oneul-study-record-v1";

const emptyRecord: LearningRecord = {
	stats: {
		sessions: 0,
		answers: 0,
		correct: 0,
		sessionsBySubject: {
			math: 0,
			english: 0,
			korean: 0,
			discrete: 0,
			algorithms: 0,
		},
	},
	wrongIds: [],
};

const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const statsSchema = z
	.object({
		sessions: count,
		answers: count,
		correct: count,
		sessionsBySubject: z.object({
			math: count,
			english: count,
			korean: count,
			discrete: count,
			algorithms: count,
		}),
	})
	.refine(
		(stats) =>
			stats.correct <= stats.answers &&
			stats.sessions <= stats.answers &&
			Object.values(stats.sessionsBySubject).reduce(
				(sum, value) => sum + value,
				0,
			) === stats.sessions,
	);
const recordSchema = z.object({
	stats: statsSchema,
	wrongIds: z.array(z.string()).max(10000),
});
const legacySchema = z
	.object({
		stats: z.object({
			sessions: count,
			answers: count,
			correct: count,
			mathSessions: count,
			englishSessions: count,
		}),
		wrongIds: z.array(z.string()).max(10000),
	})
	.transform(({ stats, wrongIds }) => ({
		stats: {
			sessions: stats.sessions,
			answers: stats.answers,
			correct: stats.correct,
			sessionsBySubject: {
				math: stats.mathSessions,
				english: stats.englishSessions,
				korean: 0,
				discrete: 0,
				algorithms: 0,
			},
		},
		wrongIds,
	}))
	.pipe(recordSchema);

export const loadRecord = (): {
	readonly record: LearningRecord;
	readonly notice: string | null;
} => {
	try {
		const raw = window.localStorage.getItem(key);
		if (raw === null) return { record: emptyRecord, notice: null };
		const parsed: unknown = JSON.parse(raw);
		const result = z.union([recordSchema, legacySchema]).safeParse(parsed);
		if (result.success) return { record: result.data, notice: null };
		return {
			record: emptyRecord,
			notice: "저장된 학습 기록을 읽을 수 없어 새 기록으로 시작했어요.",
		};
	} catch (error) {
		if (error instanceof SyntaxError)
			return {
				record: emptyRecord,
				notice: "저장된 학습 기록이 손상되어 새 기록으로 시작했어요.",
			};
		if (error instanceof DOMException)
			return {
				record: emptyRecord,
				notice: "이 브라우저에서는 학습 기록을 저장할 수 없어요.",
			};
		throw error;
	}
};

export const saveRecord = (record: LearningRecord): string | null => {
	try {
		window.localStorage.setItem(key, JSON.stringify(record));
		return null;
	} catch (error) {
		if (error instanceof DOMException)
			return "이 브라우저에서는 학습 기록을 저장할 수 없어요.";
		throw error;
	}
};

export const completeSession = (
	record: LearningRecord,
	subject: Subject,
	answers: readonly { readonly id: string; readonly correct: boolean }[],
): LearningRecord => {
	const wrong = new Set(record.wrongIds);
	for (const answer of answers) {
		if (answer.correct) wrong.delete(answer.id);
		else wrong.add(answer.id);
	}
	return {
		stats: {
			sessions: record.stats.sessions + 1,
			answers: record.stats.answers + answers.length,
			correct:
				record.stats.correct +
				answers.filter((answer) => answer.correct).length,
			sessionsBySubject: {
				...record.stats.sessionsBySubject,
				[subject]: record.stats.sessionsBySubject[subject] + 1,
			},
		},
		wrongIds: [...wrong],
	};
};

export const resolveWrongAnswer = (
	record: LearningRecord,
	id: string,
): LearningRecord => ({
	...record,
	wrongIds: record.wrongIds.filter((wrongId) => wrongId !== id),
});
