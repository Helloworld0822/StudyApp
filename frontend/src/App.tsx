import { useState } from "react";
import { questions, type Question, type Subject } from "./questions";
import {
	completeSession,
	loadRecord,
	resolveWrongAnswer,
	saveRecord,
	type LearningRecord,
} from "./storage";
import {
	percentage,
	pickQuestions,
	subjectCopy,
	type StudyAnswer,
} from "./study";
import { StudyHome } from "./StudyHome";
import { QuestionCard } from "./QuestionCard";
import { Icon } from "./Icon";
import { loadImported, saveImported } from "./imported";
import "./App.css";

type Page = "home" | "session" | "results" | "review";

type ActiveSession = {
	readonly subject: Subject;
	readonly items: readonly Question[];
	readonly review: boolean;
	readonly webOnly: boolean;
};

const initial = loadRecord();
const initialImported = loadImported();

export function App() {
	const [page, setPage] = useState<Page>("home");
	const [bank, setBank] = useState<readonly Question[]>([
		...questions,
		...initialImported.questions,
	]);
	const [record, setRecord] = useState<LearningRecord>(initial.record);
	const [notice, setNotice] = useState<string | null>(
		initial.notice ?? initialImported.notice,
	);
	const [session, setSession] = useState<ActiveSession | null>(null);
	const [index, setIndex] = useState(0);
	const [selected, setSelected] = useState<number | null>(null);
	const [checked, setChecked] = useState(false);
	const [answers, setAnswers] = useState<readonly StudyAnswer[]>([]);

	const current = session?.items[index];
	const correct = answers.filter((answer) => answer.correct).length;
	const persist = (next: LearningRecord) => {
		setRecord(next);
		setNotice(saveRecord(next));
	};

	const begin = (subject: Subject, review = false, webOnly = false) => {
		const pool = review
			? bank.filter((question) => record.wrongIds.includes(question.id))
			: bank.filter(
					(question) =>
						question.subject === subject &&
						(!webOnly ||
							question.sourceUrl !== undefined ||
							question.aiGenerated === true),
				);
		if (pool.length === 0) {
			setNotice(
				review
					? "아직 다시 볼 문제가 없어요. 새 문제를 풀어보세요."
					: "이 과목의 문제를 준비하고 있어요.",
			);
			return;
		}
		setSession({
			subject,
			items: pickQuestions(pool, Math.min(5, pool.length)),
			review,
			webOnly,
		});
		setIndex(0);
		setSelected(null);
		setChecked(false);
		setAnswers([]);
		setPage(review ? "review" : "session");
	};

	const check = () => {
		if (current === undefined || selected === null || checked) return;
		const isCorrect = current.answer === selected;
		setAnswers([...answers, { id: current.id, correct: isCorrect }]);
		setChecked(true);
		if (session?.review && isCorrect)
			persist(resolveWrongAnswer(record, current.id));
	};

	const next = () => {
		if (session === null || !checked) return;
		if (index + 1 < session.items.length) {
			setIndex(index + 1);
			setSelected(null);
			setChecked(false);
			return;
		}
		if (!session.review)
			persist(completeSession(record, session.subject, answers));
		setPage("results");
	};

	const home = () => {
		setPage("home");
		setSession(null);
	};
	const subject = session?.subject ?? "math";
	const remainingReview = bank.filter((question) =>
		record.wrongIds.includes(question.id),
	).length;
	const addImported = (items: readonly Question[]) => {
		const nextBank = [
			...bank,
			...items.filter(
				(item) => !bank.some((existing) => existing.id === item.id),
			),
		];
		setBank(nextBank);
		setNotice(
			saveImported(
				nextBank.filter(
					(item) => item.sourceUrl !== undefined || item.aiGenerated === true,
				),
			),
		);
	};

	return (
		<main className="app-shell">
			<header className="topbar">
				<button
					className="brand"
					type="button"
					onClick={home}
					aria-label="홈으로 이동"
				>
					<span className="brand-dot" />
					오늘의 공부
				</button>
				<span className="date-label">매일 조금씩, 분명하게</span>
			</header>
			{notice !== null && (
				<p className="storage-notice" role="status">
					{notice}
				</p>
			)}

			{page === "home" && (
				<StudyHome
					bank={bank}
					record={record}
					begin={begin}
					addImported={addImported}
				/>
			)}

			{(page === "session" || page === "review") && current !== undefined && (
				<section className="page session-page">
					<button className="back-button" type="button" onClick={home}>
						<Icon name="home" /> 학습 나가기
					</button>
					<div className="session-head">
						<div>
							<p className={`eyebrow ${subject}`}>
								{session?.review
									? "WRONG ANSWER REVIEW"
									: subjectCopy[subject].title.toUpperCase()}
							</p>
							<h1>
								{session?.review
									? "다시 만나서 반가워요"
									: subjectCopy[subject].title}
							</h1>
						</div>
						<span className="question-count">
							{index + 1} <i>/</i> {session?.items.length}
						</span>
					</div>
					<div className="progress-track">
						<span
							style={{
								transform: `scaleX(${(index + 1) / (session?.items.length ?? 1)})`,
							}}
						/>
					</div>
					<QuestionCard
						current={current}
						selected={selected}
						checked={checked}
						index={index}
						session={{ items: session?.items ?? [] }}
						setSelected={setSelected}
						check={check}
						next={next}
						onSave={(item) => addImported([item])}
						savedCount={bank.length - questions.length}
					/>
				</section>
			)}

			{page === "results" && (
				<section className="page results-page">
					<p className="eyebrow">SESSION COMPLETE</p>
					<h1>
						{session?.review ? "복습을 마쳤어요." : "오늘의 학습을 마쳤어요."}
					</h1>
					<article className="result-card">
						<p>이번 학습 정답</p>
						<strong>
							{correct}
							<small> / {session?.items.length}</small>
						</strong>
						<div className="score-bar">
							<span
								style={{
									transform: `scaleX(${percentage(correct, session?.items.length ?? 0) / 100})`,
								}}
							/>
						</div>
						<p>
							{correct === session?.items.length
								? "완벽해요. 다음 학습도 이 리듬으로 이어가요."
								: "틀린 문제는 오답 노트에 모았어요."}
						</p>
					</article>
					<div className="result-actions">
						{(!session?.review || remainingReview > 0) && (
							<button
								className="primary-button"
								type="button"
								onClick={() =>
									begin(subject, session?.review, session?.webOnly)
								}
							>
								한 번 더 풀기 <Icon name="refresh" />
							</button>
						)}
						<button className="secondary-button" type="button" onClick={home}>
							<Icon name="home" /> 홈으로
						</button>
					</div>
				</section>
			)}
			{page === "home" && record.wrongIds.length === 0 && (
				<p className="empty-review">
					<Icon name="check" /> 아직 다시 볼 문제가 없어요. 아주 좋아요!
				</p>
			)}
		</main>
	);
}
