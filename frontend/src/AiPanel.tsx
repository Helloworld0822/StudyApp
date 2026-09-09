import { useEffect, useRef, useState } from "react";
import ky from "ky";
import { z } from "zod";
import type { Question } from "./questions";
import { questionSchema } from "./imported";
import "./AiPanel.css";

const statusSchema = z.object({ configured: z.boolean(), model: z.string() });
const explanationSchema = z.object({
	explanation: z.string().min(1).max(20000),
});
const generatedSchema = z.object({
	question: questionSchema.omit({
		id: true,
		sourceUrl: true,
		aiGenerated: true,
	}),
});
type Props = {
	readonly question: Question;
	readonly selectedAnswer: number | null;
	readonly onSave: (question: Question) => void;
	readonly savedCount: number;
};

export function AiPanel({
	question,
	selectedAnswer,
	onSave,
	savedCount,
}: Props) {
	const [configured, setConfigured] = useState(false);
	const [model, setModel] = useState("");
	const [notice, setNotice] = useState("AI 연결을 확인하고 있어요…");
	const [busy, setBusy] = useState(false);
	const [explanation, setExplanation] = useState("");
	const [generated, setGenerated] = useState<Question | null>(null);
	const [saved, setSaved] = useState(false);
	const request = useRef<AbortController | null>(null);

	useEffect(() => {
		const controller = new AbortController();
		void ky
			.get("/api/ai/status", {
				signal: controller.signal,
				timeout: 5000,
				retry: 0,
			})
			.json<unknown>()
			.then((value) => {
				const result = statusSchema.safeParse(value);
				if (!result.success) {
					setNotice("AI 연결 정보를 확인할 수 없어요.");
					return;
				}
				setConfigured(result.data.configured);
				setModel(result.data.model);
				setNotice(
					result.data.configured
						? ""
						: "AI 연결 설정이 필요해요. 실행 안내에 따라 서버 API 키를 설정해 주세요.",
				);
			})
			.catch((error: unknown) => {
				if (controller.signal.aborted) return;
				if (error instanceof Error)
					setNotice(
						"AI 서버에 연결할 수 없어요. 백엔드 실행 상태를 확인해 주세요.",
					);
				else throw error;
			});
		return () => {
			controller.abort();
			request.current?.abort();
		};
	}, []);

	const askAi = async (action: "explain" | "generate") => {
		setBusy(true);
		setNotice("");
		const controller = new AbortController();
		request.current = controller;
		const input = {
			subject: question.subject,
			topic: question.topic,
			prompt: question.prompt,
			options: question.options,
			answer: question.answer,
			explanation: question.explanation,
		};
		try {
			const response = await ky.post(`/api/ai/${action}`, {
				json: {
					question: input,
					...(action === "explain" && selectedAnswer !== null
						? { selectedAnswer }
						: {}),
				},
				signal: controller.signal,
				timeout: 40000,
				retry: 0,
				throwHttpErrors: false,
			});
			const payload: unknown = await response.json();
			if (!response.ok) {
				setNotice(
					typeof payload === "object" &&
						payload !== null &&
						"error" in payload &&
						typeof payload.error === "string"
						? payload.error
						: "AI 응답을 받지 못했어요. 잠시 후 다시 시도해 주세요.",
				);
				return;
			}
			switch (action) {
				case "explain": {
					const result = explanationSchema.safeParse(payload);
					if (result.success) setExplanation(result.data.explanation);
					else setNotice("AI 해설 형식이 올바르지 않아요. 다시 요청해 주세요.");
					break;
				}
				case "generate": {
					const result = generatedSchema.safeParse(payload);
					if (
						result.success &&
						result.data.question.subject === question.subject
					) {
						setGenerated({
							...result.data.question,
							id: `ai-${crypto.randomUUID()}`,
							aiGenerated: true,
							...(question.sourceUrl === undefined
								? {}
								: { sourceUrl: question.sourceUrl }),
						});
						setSaved(false);
					} else
						setNotice("5지선다 문제를 확인하지 못했어요. 다시 요청해 주세요.");
					break;
				}
				default: {
					const unreachable: never = action;
					throw new TypeError(String(unreachable));
				}
			}
		} catch (error) {
			if (controller.signal.aborted) return;
			if (error instanceof Error)
				setNotice(
					"AI 요청을 완료하지 못했어요. 연결 상태를 확인하고 다시 시도해 주세요.",
				);
			else throw error;
		} finally {
			if (!controller.signal.aborted) setBusy(false);
		}
	};

	return (
		<section className="ai-panel" aria-label="AI 학습 도우미">
			<div className="ai-heading">
				<h3>조금 더 깊이 이해하기</h3>
				<span>AI 학습 도우미{configured ? ` · ${model}` : ""}</span>
			</div>
			<p className="ai-description">
				문제와 선택한 답을 AI에 전송합니다.
				<br />
				AI 답변은 틀릴 수 있습니다.
			</p>
			<div className="ai-actions">
				<button
					type="button"
					className="secondary-button"
					disabled={!configured || busy}
					onClick={() => void askAi("explain")}
				>
					AI 추가 해설
				</button>
				<button
					type="button"
					className="secondary-button"
					disabled={!configured || busy}
					onClick={() => void askAi("generate")}
				>
					5지선다 유사 문제 만들기
				</button>
			</div>
			<p className="ai-notice" role="status">
				{busy ? "AI가 문제를 살펴보고 있어요…" : notice}
			</p>
			{explanation && (
				<div className="ai-explanation">
					<h4>AI 추가 해설</h4>
					<p>{explanation}</p>
				</div>
			)}
			{generated !== null && (
				<article className="ai-generated">
					<p className="eyebrow">AI 생성 · 확인 후 저장</p>
					<h4>{generated.prompt}</h4>
					<ol type="A">
						{generated.options.map((option, index) => (
							<li key={option}>
								{option}
								{generated.answer === index && <strong> · 정답</strong>}
							</li>
						))}
					</ol>
					<p>{generated.explanation}</p>
					<button
						className="secondary-button"
						type="button"
						disabled={saved || savedCount >= 500}
						onClick={() => {
							onSave(generated);
							setSaved(true);
						}}
					>
						{saved ? "문제집에 추가했어요" : "확인하고 문제집에 추가"}
					</button>
					{savedCount >= 500 && (
						<p>추가 문제는 최대 500개까지 저장할 수 있어요.</p>
					)}
				</article>
			)}
		</section>
	);
}
