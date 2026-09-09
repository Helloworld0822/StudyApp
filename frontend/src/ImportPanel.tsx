import { useEffect, useRef, useState } from "react";
import ky from "ky";
import {
	importResultSchema,
	subjectSchema,
	type ImportResult,
} from "./imported";
import type { Question, Subject } from "./questions";
import { subjectCopy } from "./study";
import "./ImportPanel.css";

type ImportPanelProps = {
	readonly bank: readonly Question[];
	readonly onImport: (items: readonly Question[]) => void;
};

export function ImportPanel({ bank, onImport }: ImportPanelProps) {
	const [url, setUrl] = useState("");
	const [subject, setSubject] = useState<Subject>("math");
	const [busy, setBusy] = useState(false);
	const [result, setResult] = useState<ImportResult | null>(null);
	const [message, setMessage] = useState("");
	const [messageKind, setMessageKind] = useState<"error" | "success">("error");
	const request = useRef<AbortController | null>(null);
	useEffect(() => () => request.current?.abort(), []);
	const importedCount = bank.filter(
		(question) => question.sourceUrl !== undefined,
	).length;
	const savedCount = bank.filter(
		(question) =>
			question.sourceUrl !== undefined || question.aiGenerated === true,
	).length;
	const fresh =
		result?.questions.filter(
			(question) => !bank.some((saved) => saved.id === question.id),
		) ?? [];

	const crawl = async () => {
		setMessageKind("error");
		setBusy(true);
		setMessage("");
		setResult(null);
		const controller = new AbortController();
		request.current = controller;
		try {
			const response = await ky.post("/api/import/questions", {
				json: { url: url.trim(), subject },
				signal: controller.signal,
				timeout: 20000,
				retry: 0,
				throwHttpErrors: false,
			});
			if (response.status >= 500) {
				setMessage(
					"수집 서버에 연결하지 못했어요. 백엔드 실행 상태를 확인하고 잠시 후 다시 시도해 주세요.",
				);
				return;
			}
			const payload: unknown = await response.json();
			if (!response.ok) {
				const description =
					typeof payload === "object" &&
					payload !== null &&
					"error" in payload &&
					typeof payload.error === "string"
						? payload.error
						: "페이지에서 문제를 가져오지 못했어요. URL과 공개 여부를 확인해 주세요.";
				setMessage(description);
				return;
			}
			const parsed = importResultSchema.safeParse(payload);
			if (
				!parsed.success ||
				parsed.data.questions.some((question) => question.subject !== subject)
			) {
				setMessage(
					"가져온 문제 형식이 올바르지 않아요. 선택지 5개와 정답이 있는 페이지를 사용해 주세요.",
				);
				return;
			}
			setResult(parsed.data);
		} catch (error) {
			if (controller.signal.aborted) return;
			if (error instanceof Error)
				setMessage(
					"수집 요청을 완료하지 못했어요. 서버 연결과 페이지 주소를 확인한 뒤 다시 시도해 주세요.",
				);
			else throw error;
		} finally {
			if (!controller.signal.aborted) setBusy(false);
		}
	};

	return (
		<section className="import-panel" aria-labelledby="import-title">
			<div className="import-heading">
				<div>
					<p className="eyebrow">WEB QUESTION LIBRARY</p>
					<h2 id="import-title">웹에서 문제 가져오기</h2>
				</div>
				<span className="import-count">저장한 웹 문제 {importedCount}개</span>
			</div>
			<p className="import-description">
				공개 문제 페이지의 주소를 넣어 주세요. 선택지 5개와 정답이 있는 문제를
				찾아, 확인 후 내 문제집에 추가해요.
			</p>
			<form
				onSubmit={(event) => {
					event.preventDefault();
					void crawl();
				}}
			>
				<div className="import-fields">
					<label>
						과목
						<select
							value={subject}
							disabled={busy}
							onChange={(event) => {
								const parsed = subjectSchema.safeParse(event.target.value);
								if (parsed.success) {
									setSubject(parsed.data);
									setResult(null);
									setMessage("");
								}
							}}
						>
							{subjectSchema.options.map((item) => (
								<option key={item} value={item}>
									{subjectCopy[item].title}
								</option>
							))}
						</select>
					</label>
					<label className="url-field">
						문제 페이지 URL
						<input
							type="url"
							required
							maxLength={2048}
							placeholder="https://…"
							value={url}
							disabled={busy}
							onChange={(event) => {
								setUrl(event.target.value);
								setResult(null);
								setMessage("");
							}}
						/>
					</label>
				</div>
				<div className="import-action">
					<p>이용이 허용된 자료만 입력하세요.</p>
					<button
						className="secondary-button"
						type="submit"
						disabled={busy || url.trim().length === 0}
					>
						{busy ? "문제를 가져오는 중…" : "문제 미리보기"}
					</button>
				</div>
			</form>
			<details className="import-help">
				<summary>어떤 페이지를 가져올 수 있나요?</summary>
				<p>
					문항, A~E 또는 ①~⑤ 선택지, 정답이 본문에 적힌 HTML과 구조화된 Quiz
					데이터를 지원해요. 로그인 페이지, PDF·이미지, 자바스크립트로만
					표시되는 문제는 아직 지원하지 않아요. 사이트 구조에 따라 추출되지 않을
					수 있어요.
				</p>
			</details>
			<p
				className={`import-message ${messageKind}`}
				role="status"
				aria-live="polite"
			>
				{message}
			</p>
			{result !== null && (
				<div className="import-preview">
					<div className="preview-heading">
						<h3>{result.questions.length}문제를 찾았어요</h3>
						<a
							href={result.sourceUrl}
							target="_blank"
							rel="noopener noreferrer"
						>
							{result.sourceTitle || "원문 페이지"} ↗
						</a>
					</div>
					{result.warnings.map((warning) => (
						<p className="import-description" key={warning}>
							{warning}
						</p>
					))}
					<div className="preview-list">
						{result.questions.map((question, index) => (
							<details key={question.id} open={index === 0}>
								<summary>
									{index + 1}. {question.prompt}
								</summary>
								<ol type="A">
									{question.options.map((option, optionIndex) => (
										<li key={option}>
											{option}
											{optionIndex === question.answer && (
												<strong> · 정답</strong>
											)}
										</li>
									))}
								</ol>
								<p>{question.explanation || "원문에 별도 해설이 없어요."}</p>
							</details>
						))}
					</div>
					<button
						className="primary-button"
						type="button"
						disabled={fresh.length === 0 || savedCount + fresh.length > 500}
						onClick={() => {
							onImport(fresh);
							setMessageKind("success");
							setMessage(
								`${fresh.length}문제를 추가했어요. 해당 과목에서 학습을 시작해 보세요.`,
							);
							setResult(null);
						}}
					>
						{fresh.length === 0
							? "이미 추가한 문제예요"
							: `${fresh.length}문제 추가하기`}
					</button>
					{savedCount + fresh.length > 500 && (
						<p role="status">
							웹·AI 추가 문제는 합계 500개까지 저장할 수 있어요.
						</p>
					)}
				</div>
			)}
		</section>
	);
}
