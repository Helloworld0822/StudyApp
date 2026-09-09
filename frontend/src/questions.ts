export type Subject = "math" | "english" | "korean" | "discrete" | "algorithms";

export type Question = Readonly<{
	readonly id: string;
	readonly subject: Subject;
	readonly topic: string;
	readonly prompt: string;
	readonly options: readonly string[];
	readonly answer: number;
	readonly explanation: string;
	readonly sourceUrl?: string;
	readonly aiGenerated?: boolean;
}>;

import { algorithmsQuestions } from "./data/algorithms";
import { discreteQuestions } from "./data/discrete";
import { englishQuestions } from "./data/english";
import { koreanQuestions } from "./data/korean";
import { mathQuestions } from "./data/math";

export const questions: readonly Question[] = [
	...mathQuestions,
	...englishQuestions,
	...koreanQuestions,
	...discreteQuestions,
	...algorithmsQuestions,
];
