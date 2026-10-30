import { useState } from "react";
import { z } from "zod";
import type { Question, Subject } from "./questions";
import { subjectCopy } from "./study";
import {
	analyzeTopics, topicGuidance,
	type Attempt, type FocusTopic, type TopicStatus,
} from "./coaching";
import "./CoachPanel.css";

const filterSchema = z.enum(["all", "korean", "english", "math"]);
const statusCopy: Record<TopicStatus, string> = {
	limited: "확인 필요",
	weak: "보완 추천",
	rechecking: "다시 확인 중",
	steady: "최근 풀이 안정적",
};
type Props = {
	readonly bank: readonly Question[];
	readonly attempts: readonly Attempt[];
	readonly onPractice: (focus: FocusTopic) => void;
	readonly onDiagnose?: (subject: Subject) => void;
};

export function CoachPanel({ bank, attempts, onPractice, onDiagnose }: Props) {
	const [filter, setFilter] = useState<z.infer<typeof filterSchema>>("all");
	const topics = analyzeTopics(attempts, bank).filter(
		(topic) => filter === "all" || topic.subject === filter,
	);
	return (
		<section className="coach-panel" aria-label="맞춤 학습 지도">
			<div className="coach-heading">
				<div>
					<p className="eyebrow">MY NEXT STEP</p>
					<h2>부족한 부분부터, 한 걸음씩</h2>
				</div>
				<label>
					학습 지도 과목
					<select value={filter} onChange={(event) => {
						const parsed = filterSchema.safeParse(event.target.value);
						if (parsed.success) setFilter(parsed.data);
					}}>
						<option value="all">전체 과목</option>
						<option value="korean">국어</option>
						<option value="english">영어</option>
						<option value="math">수학</option>
					</select>
				</label>
			</div>
			<p className="coach-description">실제로 푼 문제를 주제별로 살펴보고, 다음 연습을 안내해요. 최근 5회 풀이를 사용하며 같은 문제의 반복 정답만으로 이해를 확정하지 않아요.</p>
			{topics.length === 0 ? (
				<div className="coach-empty">
					<h3>먼저 풀어 보면, 함께 방향을 찾을 수 있어요</h3>
					<p>아직 이 과목의 풀이 기록이 없어요. 한 번의 오답만으로 원인을 단정하지 않고, 여러 문제의 결과를 모아 확인해요.</p>
					{onDiagnose !== undefined && (
						<div className="coach-diagnose">
							{(["korean", "english", "math"] as const)
								.filter((subject) => filter === "all" || subject === filter)
								.map((subject) => (
									<button className="secondary-button" key={subject} type="button"
										onClick={() => onDiagnose(subject)}>
										{subjectCopy[subject].title} 진단 시작
									</button>
								))}
						</div>
					)}
				</div>
			) : <div className="coach-topics">{topics.slice(0, 3).map((topic) => {
				const wrong = topic.latestWrong;
				const example = wrong === undefined ? undefined : bank.find(
					(question) => question.id === wrong.questionId &&
						question.subject === topic.subject && question.topic === topic.topic,
				);
				return <article className="coach-topic" key={`${topic.subject}:${topic.topic}`}>
					<div className="coach-topic-heading">
						<h3>{subjectCopy[topic.subject].title} · {topic.topic}</h3>
						<span className={`coach-status ${topic.status}`}>{statusCopy[topic.status]}</span>
					</div>
					<p className="coach-evidence">최근 {topic.recent.length}회 중 {topic.correct}회 정답 · 정답률 {topic.accuracy}% · 서로 다른 문제 {topic.distinct}개</p>
					{topic.distinct < 3 && <p className="coach-calibration">아직 근거가 적어요. 다른 문제를 포함해 최소 3개 이상 풀며 확인해요.</p>}
					{topic.improving && <p className="coach-improving">가장 최근에는 맞혔어요. 다른 문제에서도 적용할 수 있는지 확인해요.</p>}
					<ol className="coach-plan">{topicGuidance(topic).map((step) => <li key={step}>{step}</li>)}</ol>
					{example !== undefined && wrong !== undefined && (
						<details className="coach-example">
							<summary>최근 오답의 근거 되짚기</summary>
							{example.sourceLabel && <p className="coach-evidence">자료: {example.sourceLabel}</p>}
							{example.passage && <p className="coach-passage">{example.passage}</p>}
							<p>{example.prompt}</p>
							<p>내 선택: {example.options[wrong.selectedAnswer]}</p>
							<p>정답: {example.options[example.answer]}</p>
							<p>{example.explanation || "원문 해설을 확인하고 정답의 근거를 직접 적어 보세요."}</p>
						</details>
					)}
					<button className="secondary-button" type="button" disabled={topic.available === 0}
						onClick={() => onPractice({ subject: topic.subject, topic: topic.topic })}>
						{topic.topic} 보완 연습
					</button>
					<p className="coach-availability">{topic.available === 0 ? "이 주제의 자료로 문제를 만들어 추가해 주세요." : `같은 주제 ${topic.available}문제 중 오답과 안 푼 문제부터 최대 5문제를 풀어요.`}</p>
				</article>;
			})}</div>}
			{topics.length > 3 && <p className="coach-description">현재 선택한 과목에서 우선 확인할 3개 주제를 표시했어요. 연습 결과에 따라 순서가 바뀝니다.</p>}
			<p className="coach-footnote">정답률은 풀이 결과의 신호예요. 틀린 원인과 학년 수준을 확정하는 검사는 아니며, 새로 채점한 풀이부터 이 브라우저에 최대 2,000회 기록해요.</p>
		</section>
	);
}
