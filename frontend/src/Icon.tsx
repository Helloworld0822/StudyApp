export const Icon = ({
	name,
}: {
	readonly name: "arrow" | "book" | "check" | "home" | "refresh";
}) => {
	const paths = {
		arrow: "M5 12h14m-6-6 6 6-6 6",
		book: "M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5v-16Z M4 19.5A2.5 2.5 0 0 1 6.5 17H20",
		check: "m5 12 4 4L19 6",
		home: "m3 11 9-8 9 8v10h-6v-6H9v6H3V11Z",
		refresh: "M20 11a8 8 0 1 0 2 5.3M20 4v7h-7",
	};
	return (
		<svg
			aria-hidden="true"
			className="icon"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.8"
		>
			<path d={paths[name]} />
		</svg>
	);
};
