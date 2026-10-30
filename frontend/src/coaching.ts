import type { Question, Subject } from "./questions";
import type { Attempt } from "./coaching-storage";

export { loadAttempts, saveAttempts } from "./coaching-storage";
export type { Attempt } from "./coaching-storage";
export type FocusTopic = { readonly subject: Subject; readonly topic: string };
export type TopicStatus = "limited" | "weak" | "rechecking" | "steady";
export type TopicProgress = FocusTopic & {
	readonly recent: readonly Attempt[];
	readonly correct: number;
	readonly distinct: number;
	readonly accuracy: number;
	readonly status: TopicStatus;
	readonly improving: boolean;
	readonly available: number;
	readonly latestWrong: Attempt | undefined;
};

export const analyzeTopics = (
	attempts: readonly Attempt[],
	bank: readonly Question[],
): readonly TopicProgress[] => {
	const groups = new Map<string, Attempt[]>();
	for (const attempt of [...attempts].sort((left, right) => left.at - right.at)) {
		const key = JSON.stringify([attempt.subject, attempt.topic]);
		const group = groups.get(key) ?? [];
		group.push(attempt);
		groups.set(key, group);
	}
	const topics: TopicProgress[] = [];
	for (const group of groups.values()) {
		const latest = group.at(-1);
		if (latest === undefined) continue;
		const recent = group.slice(-5);
		const correct = recent.filter((attempt) => attempt.correct).length;
		const distinct = new Set(recent.map((attempt) => attempt.questionId)).size;
		const accuracy = Math.round((correct / recent.length) * 100);
		const latestWrong = group.findLast((attempt) => !attempt.correct);
		const status: TopicStatus = distinct < 3
			? "limited"
			: accuracy < 80
				? "weak"
				: correct < recent.length
					? "rechecking"
					: "steady";
		topics.push({
			subject: latest.subject,
			topic: latest.topic,
			recent,
			correct,
			distinct,
			accuracy,
			status,
			improving: latest.correct && latestWrong !== undefined,
			available: bank.filter((question) => question.subject === latest.subject && question.topic === latest.topic).length,
			latestWrong,
		});
	}
	const priority: Record<TopicStatus, number> = { weak: 0, limited: 1, rechecking: 2, steady: 3 };
	return topics.sort((left, right) => priority[left.status] - priority[right.status] || left.accuracy - right.accuracy);
};

export const selectFocusedQuestions = (
	bank: readonly Question[],
	attempts: readonly Attempt[],
	focus: FocusTopic,
): readonly Question[] => {
	const latest = new Map<string, Attempt>();
	for (const attempt of [...attempts].sort((left, right) => left.at - right.at))
		latest.set(attempt.questionId, attempt);
	const rank = (question: Question) => {
		const attempt = latest.get(question.id);
		return attempt === undefined ? 1 : attempt.correct ? 2 : 0;
	};
	return bank.filter((question) => question.subject === focus.subject && question.topic === focus.topic)
		.sort((left, right) => rank(left) - rank(right) || (latest.get(left.id)?.at ?? 0) - (latest.get(right.id)?.at ?? 0))
		.slice(0, 5);
};

export const topicGuidance = (focus: FocusTopic): readonly string[] => {
	switch (focus.subject) {
		case "korean":
			if (/문법|맞춤법|띄어쓰기/.test(focus.topic))
				return ["해설에서 적용한 문법 규칙을 한 문장으로 정리해요.", "틀린 표현을 바르게 고치고 바꾼 이유를 말해 봐요.", "같은 규칙의 다른 문장에 적용한 뒤 근거를 확인해요."];
			if (/어휘/.test(focus.topic))
				return ["헷갈린 낱말의 뜻과 반대말을 함께 적어요.", "원문 문맥에서 그 뜻이 맞는 근거를 찾아요.", "새 문장에 낱말을 넣어 보고 다른 선택지와 비교해요."];
			return ["문단마다 핵심 내용을 한 문장으로 요약해요.", "고른 답과 정답의 근거 문장을 지문에서 각각 찾아요.", "추측과 지문에 적힌 사실을 구분하며 다시 풀어요."];
		case "english":
			if (/어휘/.test(focus.topic))
				return ["모르는 단어의 뜻을 예문과 함께 적어요.", "문장 속 앞뒤 단서로 뜻을 다시 설명해 봐요.", "비슷한 단어와 구별하며 다른 문장에 적용해요."];
			if (/문법/.test(focus.topic))
				return ["문장의 주어·동사와 시제를 먼저 표시해요.", "정답에 쓰인 규칙을 정리하고 오답이 어긋난 곳을 찾아요.", "주어나 시제를 바꾼 문장에도 같은 규칙을 적용해요."];
			return ["긴 문장을 주어·동사와 수식어로 나누어 읽어요.", "연결어와 핵심 문장에서 정답의 근거를 찾아요.", "문단 요지를 한국어 한 문장으로 말한 뒤 다시 풀어요."];
		case "math":
			return [`‘${focus.topic}’에서 필요한 정의·공식과 적용 조건을 적어요.`, "해설과 내 풀이를 비교해 처음 달라진 단계를 찾아요.", "조건 정리 → 식 세우기 → 계산 → 원래 조건에 검산 순서로 다시 풀어요."];
		case "discrete":
			return ["문제의 정의와 기호를 작은 예로 바꿔 써요.", "해설의 논리와 내 풀이가 갈라지는 단계를 찾아요.", "경계 조건과 반례를 확인하며 다른 문제에 적용해요."];
		case "algorithms":
			return ["작은 입력을 손으로 따라가며 중간 상태를 적어요.", "종료 조건과 반복 횟수를 해설과 비교해요.", "빈 입력·최솟값·최댓값으로 풀이를 다시 점검해요."];
		default: {
			const unreachable: never = focus.subject;
			throw new TypeError(String(unreachable));
		}
	}
};
