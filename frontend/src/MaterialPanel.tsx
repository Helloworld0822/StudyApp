import { useEffect, useRef, useState } from "react";
import ky from "ky";
import type { Question } from "./questions";
import { subjectCopy } from "./study";
import {
	aiStatusSchema, countSchema, difficultySchema, generateMaterial,
	loadMaterial, MaterialError, materialSubjectSchema, materialTopics, type MaterialSubject,
} from "./material";
import { MaterialPreview } from "./MaterialPreview";
import "./ImportPanel.css";
import "./MaterialPanel.css";

type Props = {
	readonly bank: readonly Question[];
	readonly onImport: (items: readonly Question[]) => void;
};

export function MaterialPanel({ bank, onImport }: Props) {
	const [subject, setSubject] = useState<MaterialSubject>("korean");
	const [topic, setTopic] = useState<string>(materialTopics.korean[0]);
	const [difficulty, setDifficulty] = useState<"basic" | "standard" | "challenge">("standard");
	const [count, setCount] = useState(3);
	const [text, setText] = useState("");
	const [url, setUrl] = useState("");
	const [sourceUrl, setSourceUrl] = useState<string | undefined>();
	const [sourceLabel, setSourceLabel] = useState("");
	const [configured, setConfigured] = useState(false);
	const [connection, setConnection] = useState("AI 연결을 확인하고 있어요…");
	const [busy, setBusy] = useState<"source" | "generate" | null>(null);
	const [message, setMessage] = useState("");
	const [preview, setPreview] = useState<readonly Question[]>([]);
	const [saved, setSaved] = useState(false);
	const request = useRef<AbortController | null>(null);
	const savedCount = bank.filter((item) => item.sourceUrl !== undefined || item.aiGenerated === true).length;
	const textLength = [...text.trim()].length;
	const invalidate = () => { setPreview([]); setSaved(false); setMessage(""); };

	useEffect(() => {
		const controller = new AbortController();
		void ky.get("/api/ai/status", { signal: controller.signal, timeout: 5000, retry: 0 }).json<unknown>()
			.then((value) => {
				const parsed = aiStatusSchema.safeParse(value);
				if (!parsed.success) { setConnection("AI 연결 정보를 확인할 수 없어요."); return; }
				setConfigured(parsed.data.configured);
				setConnection(parsed.data.configured ? "" : "문제 생성을 위해 서버 API 키 설정이 필요해요. 실행 안내를 확인해 주세요.");
			}).catch((error: unknown) => {
				if (controller.signal.aborted) return;
				if (error instanceof Error) setConnection("AI 서버에 연결할 수 없어요. 백엔드 실행 상태를 확인해 주세요.");
				else throw error;
			});
		return () => { controller.abort(); request.current?.abort(); };
	}, []);

	const perform = async (action: "source" | "generate") => {
		if (request.current !== null) return;
		invalidate();
		setBusy(action);
		const controller = new AbortController();
		request.current = controller;
		try {
			switch (action) {
				case "source": {
					const result = await loadMaterial(url, controller.signal);
					setText(result.text); setSourceUrl(result.sourceUrl); setSourceLabel(result.sourceTitle);
					setMessage("본문을 가져왔어요. 필요한 지문이나 문제만 남긴 뒤 문제를 만들어 주세요.");
					break;
				}
				case "generate": {
					const items = await generateMaterial({ subject, topic, text, difficulty, count }, controller.signal);
					setPreview(items.map((item) => ({
						...item, id: `ai-material-${crypto.randomUUID()}`, aiGenerated: true,
						...(sourceUrl === undefined ? {} : { sourceUrl }),
						...(sourceLabel.trim() === "" ? {} : { sourceLabel: sourceLabel.trim() }),
					})));
					break;
				}
				default: { const unreachable: never = action; throw new TypeError(String(unreachable)); }
			}
		} catch (error) {
			if (controller.signal.aborted) return;
			if (error instanceof Error) setMessage(error instanceof MaterialError ? error.message : "요청을 완료하지 못했어요. 연결 상태를 확인하고 다시 시도해 주세요.");
			else throw error;
		} finally {
			if (!controller.signal.aborted) { setBusy(null); request.current = null; }
		}
	};

	return (
		<section className="import-panel material-panel" aria-labelledby="material-title">
			<div className="import-heading"><div><p className="eyebrow">MY MATERIAL · NEW QUESTIONS</p><h2 id="material-title">내 자료로 문제 만들기</h2></div><span className="import-count">국어 · 영어 · 수학</span></div>
			<p className="import-description">모의고사 지문이나 문제집의 내용을 붙여 넣어 주세요. 학습할 개념을 골라 새로운 문제와 풀이 해설을 만들어요.</p>
			<details className="material-source"><summary>공개 웹페이지에서 본문 가져오기</summary>
				<div className="import-fields"><label className="url-field">자료 페이지 URL<input type="url" maxLength={2048} value={url} disabled={busy !== null} placeholder="https://…" onChange={(event) => { setUrl(event.target.value); invalidate(); }} /></label>
					<button type="button" className="secondary-button" disabled={busy !== null || url.trim() === ""} onClick={() => void perform("source")}>{busy === "source" ? "본문 가져오는 중…" : "자료 본문 가져오기"}</button></div>
				<p className="import-description">공개 HTML 본문만 가져올 수 있어요. PDF·사진은 텍스트를 복사해 붙여 넣어 주세요.</p>
			</details>
			<form onSubmit={(event) => { event.preventDefault(); void perform("generate"); }}>
				<fieldset disabled={busy !== null} className="material-fieldset">
					<div className="import-fields material-settings">
						<label>문제 생성 과목<select value={subject} onChange={(event) => { const parsed = materialSubjectSchema.safeParse(event.target.value); if (parsed.success) { setSubject(parsed.data); setTopic(materialTopics[parsed.data][0]); invalidate(); } }}>{materialSubjectSchema.options.map((item) => <option key={item} value={item}>{subjectCopy[item].title}</option>)}</select></label>
						<label>학습할 개념<select value={topic} onChange={(event) => { setTopic(event.target.value); invalidate(); }}>{materialTopics[subject].map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
						<label>문제 난이도<select value={difficulty} onChange={(event) => { const parsed = difficultySchema.safeParse(event.target.value); if (parsed.success) { setDifficulty(parsed.data); invalidate(); } }}><option value="basic">기초 · 개념 확인</option><option value="standard">보통 · 개념 적용</option><option value="challenge">도전 · 심화 추론</option></select></label>
						<label>생성 문항 수<select value={count} onChange={(event) => { const parsed = countSchema.safeParse(event.target.value); if (parsed.success) { setCount(parsed.data); invalidate(); } }}>{[1, 2, 3, 4, 5].map((item) => <option key={item} value={item}>{item}문제</option>)}</select></label>
					</div>
					<div className="import-fields material-text-fields">
						<label>자료 이름 · 출처 (선택)<input maxLength={200} value={sourceLabel} placeholder="예: 9월 모의고사 국어 1번 지문" onChange={(event) => { setSourceLabel(event.target.value); invalidate(); }} /></label>
						<label>지문 또는 원문 문제<textarea required minLength={20} maxLength={12000} rows={8} value={text} placeholder="국어·영어 지문이나 수학 문제의 조건을 붙여 넣어 주세요." onChange={(event) => { setText(event.target.value); invalidate(); }} /><span className="material-character-count">{textLength.toLocaleString()} / 12,000자 · 최소 20자</span></label>
					</div>
					{sourceUrl && <a className="source-link" href={sourceUrl} target="_blank" rel="noopener noreferrer">가져온 자료 출처 보기 ↗</a>}
					<div className="import-action"><p>이용이 허용된 자료만 넣어 주세요. 생성 시 자료를 AI에 전송하며, AI 문제와 해설은 틀릴 수 있어요.</p><button className="primary-button" type="submit" disabled={!configured || busy !== null || textLength < 20 || textLength > 12000}>{busy === "generate" ? "문제를 만드는 중…" : "자료로 문제 만들기"}</button></div>
				</fieldset>
			</form>
			<p className="import-message" role="status">{busy === null ? message || connection : busy === "source" ? "자료 본문을 가져오고 있어요…" : "지문과 개념을 살펴 문제와 해설을 만들고 있어요…"}</p>
			<MaterialPreview questions={preview} saved={saved} capacity={savedCount + preview.length <= 500} onSave={() => { if (saved || savedCount + preview.length > 500) return; onImport(preview); setSaved(true); }} />
		</section>
	);
}
