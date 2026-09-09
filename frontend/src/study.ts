import type { Question, Subject } from "./questions";

export type StudyAnswer = { readonly id: string; readonly correct: boolean };

export const subjectCopy: Record<
	Subject,
	{ readonly title: string; readonly subtitle: string; readonly mark: string }
> = {
	math: { title: "수학", subtitle: "개념을 차분히 풀어보기", mark: "∑" },
	english: { title: "영어", subtitle: "문장 감각을 키워보기", mark: "Aa" },
	korean: { title: "국어", subtitle: "문법·어휘·독해를 다져보기", mark: "가" },
	discrete: {
		title: "이산수학",
		subtitle: "집합·논리·조합을 이해하기",
		mark: "⊂",
	},
	algorithms: {
		title: "알고리즘",
		subtitle: "탐색·정렬·복잡도를 익히기",
		mark: "⌘",
	},
};

export const pickQuestions = (
	pool: readonly Question[],
	count: number,
): readonly Question[] => {
	const shuffled = [...pool];
	for (let index = shuffled.length - 1; index > 0; index -= 1) {
		const randomIndex = Math.floor(Math.random() * (index + 1));
		const current = shuffled[index];
		const replacement = shuffled[randomIndex];
		if (current !== undefined && replacement !== undefined) {
			shuffled[index] = replacement;
			shuffled[randomIndex] = current;
		}
	}
	return shuffled.slice(0, count);
};

export const percentage = (correct: number, total: number): number =>
	total === 0 ? 0 : Math.round((correct / total) * 100);
