import { useState } from "react";
import { questions, type Question, type Subject } from "./questions";
import {
	completeSession,
	loadRecord,
	resolveWrongAnswer,
	saveRecord,
	type LearningRecord,
} from "./storage";
import { pickQuestions, type StudyAnswer } from "./study";
import { StudyHome } from "./StudyHome";
import { StudySession } from "./StudySession";
import { Icon } from "./Icon";
import { loadImported, saveImported } from "./imported";
import { StudyResults } from "./StudyResults";
import { CoachPanel } from "./CoachPanel";
import {
	loadAttempts, saveAttempts, selectFocusedQuestions,
	type Attempt, type FocusTopic,
} from "./coaching";
import "./App.css";
import "./Learning.css";

type Page = "home" | "session" | "results" | "review";

type ActiveSession = {
	readonly subject: Subject;
	readonly items: readonly Question[];
	readonly review: boolean;
	readonly webOnly: boolean;
	readonly focus?: FocusTopic;
};

const initial = loadRecord();
const initialImported = loadImported();
const initialAttempts = loadAttempts();

export function App() {
	const [page, setPage] = useState<Page>("home");
	const [bank, setBank] = useState<readonly Question[]>([
		...questions,
		...initialImported.questions,
	]);
	const [record, setRecord] = useState<LearningRecord>(initial.record);
	const [notice, setNotice] = useState<string | null>(
		initial.notice ?? initialImported.notice ?? initialAttempts.notice,
	);
	const [attempts, setAttempts] = useState<readonly Attempt[]>(initialAttempts.attempts);
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

	const startSession = (active: ActiveSession) => {
		setSession(active);
		setIndex(0);
		setSelected(null);
		setChecked(false);
		setAnswers([]);
		setPage(active.review ? "review" : "session");
		window.scrollTo(0, 0);
	};

	const practice = (focus: FocusTopic) => {
		const items = selectFocusedQuestions(bank, attempts, focus);
		if (items.length === 0) {
			setNotice("이 개념의 연습 문제를 먼저 추가해 주세요.");
			return;
		}
		startSession({ subject: focus.subject, items, review: false, webOnly: false, focus });
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
		startSession({
			subject,
			items: pickQuestions(pool, Math.min(5, pool.length)),
			review,
			webOnly,
		});
	};

	const check = () => {
		if (current === undefined || selected === null || checked) return;
		const isCorrect = current.answer === selected;
		setAnswers([...answers, { id: current.id, correct: isCorrect }]);
		setChecked(true);
		const updated = [...attempts, {
			questionId: current.id, subject: current.subject, topic: current.topic,
			selectedAnswer: selected, correct: isCorrect, at: Date.now(),
		}].slice(-2000);
		setAttempts(updated);
		setNotice(saveAttempts(updated));
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
					attempts={attempts}
					onPractice={practice}
				/>
			)}

			{(page === "session" || page === "review") && current !== undefined && session !== null && (
				<StudySession
					subject={subject}
					review={session.review}
					focusTopic={session.focus?.topic}
					current={current}
					items={session.items}
					index={index}
					selected={selected}
					checked={checked}
					setSelected={setSelected}
					check={check}
					next={next}
					onSave={(item) => addImported([item])}
					savedCount={bank.length - questions.length}
					onHome={home}
				/>
			)}

			{page === "results" && (
				<StudyResults
					correct={correct}
					total={session?.items.length ?? 0}
					review={session?.review ?? false}
					canRepeat={!session?.review || remainingReview > 0}
					onRepeat={() => session?.focus ? practice(session.focus) : begin(subject, session?.review, session?.webOnly)}
					onHome={home}
				>
					<CoachPanel bank={bank} attempts={attempts} onPractice={practice} onDiagnose={begin} />
				</StudyResults>
			)}
			{page === "home" && record.wrongIds.length === 0 && (
				<p className="empty-review">
					<Icon name="check" /> 아직 다시 볼 문제가 없어요. 아주 좋아요!
				</p>
			)}
		</main>
	);
}
