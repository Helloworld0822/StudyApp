import type { ReactNode } from "react";
import { Icon } from "./Icon";
import { percentage } from "./study";

type Props = {
	readonly correct: number;
	readonly total: number;
	readonly review: boolean;
	readonly canRepeat: boolean;
	readonly onRepeat: () => void;
	readonly onHome: () => void;
	readonly children: ReactNode;
};

export function StudyResults({ correct, total, review, canRepeat, onRepeat, onHome, children }: Props) {
	return (
		<section className="page results-page">
			<p className="eyebrow">SESSION COMPLETE</p>
			<h1>{review ? "복습을 마쳤어요." : "오늘의 학습을 마쳤어요."}</h1>
			<article className="result-card">
				<p>이번 학습 정답</p>
				<strong>{correct}<small> / {total}</small></strong>
				<div className="score-bar"><span style={{ transform: `scaleX(${percentage(correct, total) / 100})` }} /></div>
				<p>{correct === total ? "완벽해요. 다음 학습도 이 리듬으로 이어가요." : "틀린 문제는 오답 노트에 모았어요."}</p>
			</article>
			<div className="result-actions">
				{canRepeat && <button className="primary-button" type="button" onClick={onRepeat}>한 번 더 풀기 <Icon name="refresh" /></button>}
				<button className="secondary-button" type="button" onClick={onHome}><Icon name="home" /> 홈으로</button>
			</div>
			{children}
		</section>
	);
}
