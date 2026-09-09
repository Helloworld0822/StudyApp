import type { Question, Subject } from "./questions";
import type { LearningRecord } from "./storage";
import { percentage, subjectCopy } from "./study";
import { Icon } from "./Icon";
import { ImportPanel } from "./ImportPanel";
const subjects: readonly Subject[] = [
	"math",
	"english",
	"korean",
	"discrete",
	"algorithms",
];
type Props = {
	readonly bank: readonly Question[];
	readonly record: LearningRecord;
	readonly begin: (
		subject: Subject,
		review?: boolean,
		webOnly?: boolean,
	) => void;
	readonly addImported: (items: readonly Question[]) => void;
};
export function StudyHome({ bank, record, begin, addImported }: Props) {
	return (
		<section className="page home-page">
			<div className="intro">
				<p className="eyebrow">STUDY NOTE · 오늘의 한 장</p>
				<h1>
					오늘은 무엇을
					<br />
					공부할까요?
				</h1>
				<p>
					다섯 과목, 다섯 개의 선택지.
					<br />한 번에 5문제씩, 꾸준히 공부해요.
				</p>
			</div>
			<section className="subject-grid" aria-label="과목 선택">
				{subjects.map((item) => (
					<article className={`subject-card ${item}`} key={item}>
						<span className="subject-mark">{subjectCopy[item].mark}</span>
						<p className="eyebrow">{item.toUpperCase()} NOTE</p>
						<h2>{subjectCopy[item].title}</h2>
						<p>{subjectCopy[item].subtitle}</p>
						<p className="card-meta">
							{record.stats.sessionsBySubject[item]}회 학습 완료
						</p>
						<button
							className="primary-button"
							type="button"
							onClick={() => begin(item)}
						>
							{subjectCopy[item].title} 5문제 시작 <Icon name="arrow" />
						</button>
						{bank.some(
							(question) =>
								question.subject === item &&
								(question.sourceUrl !== undefined ||
									question.aiGenerated === true),
						) && (
							<button
								className="web-study-button"
								type="button"
								onClick={() => begin(item, false, true)}
							>
								추가한 문제만 풀기
							</button>
						)}
					</article>
				))}
			</section>
			<section className="record-card">
				<div>
					<p className="eyebrow">MY LEARNING RECORD</p>
					<h2>차곡차곡 쌓인 기록</h2>
				</div>
				<div className="stats">
					<span>
						<b>{record.stats.sessions}</b>회 학습
					</span>
					<span>
						<b>{record.stats.answers}</b>문제 풀이
					</span>
					<span>
						<b>{percentage(record.stats.correct, record.stats.answers)}</b>%
						정답률
					</span>
				</div>
				<button
					className="review-link"
					type="button"
					onClick={() => begin("math", true)}
				>
					<Icon name="book" />
					오답 다시 보기 <strong>{record.wrongIds.length}</strong>
				</button>
			</section>
			<ImportPanel bank={bank} onImport={addImported} />
		</section>
	);
}
