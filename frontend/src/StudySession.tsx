import type { Question, Subject } from "./questions";
import { subjectCopy } from "./study";
import { Icon } from "./Icon";
import { QuestionCard } from "./QuestionCard";

type Props = {
	readonly subject: Subject;
	readonly review: boolean;
	readonly focusTopic?: string;
	readonly current: Question;
	readonly items: readonly Question[];
	readonly index: number;
	readonly selected: number | null;
	readonly checked: boolean;
	readonly setSelected: (value: number) => void;
	readonly check: () => void;
	readonly next: () => void;
	readonly onSave: (question: Question) => void;
	readonly savedCount: number;
	readonly onHome: () => void;
};

export function StudySession(props: Props) {
	const title = props.review
		? "다시 만나서 반가워요"
		: `${subjectCopy[props.subject].title}${props.focusTopic ? ` · ${props.focusTopic} 보완` : ""}`;
	return (
		<section className="page session-page">
			<button className="back-button" type="button" onClick={props.onHome}>
				<Icon name="home" /> 학습 나가기
			</button>
			<div className="session-head">
				<div>
					<p className={`eyebrow ${props.subject}`}>
						{props.review ? "WRONG ANSWER REVIEW" : subjectCopy[props.subject].title}
					</p>
					<h1>{title}</h1>
				</div>
				<span className="question-count">{props.index + 1} <i>/</i> {props.items.length}</span>
			</div>
			<div className="progress-track">
				<span style={{ transform: `scaleX(${(props.index + 1) / props.items.length})` }} />
			</div>
			<QuestionCard
				current={props.current}
				selected={props.selected}
				checked={props.checked}
				index={props.index}
				session={{ items: props.items }}
				setSelected={props.setSelected}
				check={props.check}
				next={props.next}
				onSave={props.onSave}
				savedCount={props.savedCount}
			/>
		</section>
	);
}
