import type { Question } from "./questions";

type Props = {
	readonly questions: readonly Question[];
	readonly saved: boolean;
	readonly capacity: boolean;
	readonly onSave: () => void;
};

export function MaterialPreview({ questions, saved, capacity, onSave }: Props) {
	if (questions.length === 0) return null;
	return (
		<div className="import-preview material-preview">
			<p className="eyebrow">AI 생성 · 학습 전에 확인하기</p>
			<h3>{questions.length}문제를 만들었어요</h3>
			<p className="import-description">정답과 해설은 펼쳐서 확인할 수 있어요. 문제집에 추가한 뒤 해당 과목에서 풀어보세요.</p>
			<div className="material-preview-list">
				{questions.map((question, index) => (
					<article key={question.id}>
						<p className="topic">{question.topic} · {index + 1}번</p>
						{question.passage && <p className="material-passage">{question.passage}</p>}
						<h4>{question.prompt}</h4>
						<ol type="A">{question.options.map((option) => <li key={option}>{option}</li>)}</ol>
						<details>
							<summary>정답·해설 확인</summary>
							<p><strong>정답 {String.fromCharCode(65 + question.answer)}</strong></p>
							<p className="material-explanation">{question.explanation}</p>
						</details>
					</article>
				))}
			</div>
			<button type="button" className="primary-button" disabled={saved || !capacity} onClick={onSave}>
				{saved ? "생성 문제를 추가했어요" : `${questions.length}문제 문제집에 추가`}
			</button>
			{!capacity && !saved && <p role="status">웹·AI 추가 문제는 합계 500개까지 저장할 수 있어요.</p>}
		</div>
	);
}
