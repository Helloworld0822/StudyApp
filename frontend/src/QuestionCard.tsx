import type { Question } from "./questions";
import { subjectCopy } from "./study";
import { Icon } from "./Icon";
import { AiPanel } from "./AiPanel";
type Props = {
	readonly current: Question;
	readonly selected: number | null;
	readonly checked: boolean;
	readonly index: number;
	readonly session: { readonly items: readonly Question[] };
	readonly setSelected: (value: number) => void;
	readonly check: () => void;
	readonly next: () => void;
	readonly onSave: (question: Question) => void;
	readonly savedCount: number;
};
export function QuestionCard({
	current,
	selected,
	checked,
	index,
	session,
	setSelected,
	check,
	next,
	onSave,
	savedCount,
}: Props) {
	return (
		<article className="question-card">
			<p className="topic">
				{subjectCopy[current.subject].title} · {current.topic}
			</p>
			<h2>{current.prompt}</h2>
			{current.aiGenerated && (
				<p className="topic">AI 생성 문제 · 정답과 해설을 함께 확인해 주세요</p>
			)}
			{current.sourceUrl !== undefined && (
				<a
					className="source-link"
					href={current.sourceUrl}
					target="_blank"
					rel="noopener noreferrer"
				>
					원문 출처 보기 ↗
				</a>
			)}
			<div className="options">
				{current.options.map((option, optionIndex) => {
					const chosen = selected === optionIndex;
					const state = checked
						? optionIndex === current.answer
							? "correct"
							: chosen
								? "incorrect"
								: ""
						: chosen
							? "selected"
							: "";
					return (
						<button
							className={`option ${state}`}
							type="button"
							key={option}
							disabled={checked}
							onClick={() => setSelected(optionIndex)}
							aria-pressed={chosen}
						>
							<span>{String.fromCharCode(65 + optionIndex)}</span>
							{option}
						</button>
					);
				})}
			</div>
			{checked && (
				<div
					className={`feedback ${selected === current.answer ? "correct" : "incorrect"}`}
					role="status"
				>
					<Icon name={selected === current.answer ? "check" : "refresh"} />
					<div>
						<b>
							{selected === current.answer ? "정답이에요!" : "조금 아쉬워요."}
						</b>
						<p>{current.explanation}</p>
					</div>
				</div>
			)}
			<div className="question-actions">
				{checked ? (
					<button className="primary-button" type="button" onClick={next}>
						{index + 1 === session?.items.length ? "결과 보기" : "다음 문제"}{" "}
						<Icon name="arrow" />
					</button>
				) : (
					<button
						className="primary-button"
						type="button"
						disabled={selected === null}
						onClick={check}
					>
						정답 확인하기 <Icon name="check" />
					</button>
				)}
			</div>
			{checked && (
				<AiPanel
					key={current.id}
					question={current}
					selectedAnswer={selected}
					onSave={onSave}
					savedCount={savedCount}
				/>
			)}
		</article>
	);
}
