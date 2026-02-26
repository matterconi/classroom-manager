import { useState } from "react";
const BACKEND_URL = import.meta.env.VITE_BACKEND_BASE_URL;

export const useAi = () => {
	const [result, setResult] = useState<string | null>(null);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);


	async function generate(prompt: string) {
		setIsLoading(true);
		setError("");
		try {
			const response = await fetch(
				`${BACKEND_URL}/api/ai`,
				{
					method: "POST",
					headers: {"Content-Type": "application/json",},
					body: JSON.stringify({ prompt })
				}
			);
			if (!response.ok) throw new Error("Something went wrong");
			const json = await response.json();
			setResult(json.data);
		}
		catch (e) {
			console.error(e);
		}
		finally {
			setIsLoading(false);
		}
	}
	return { generate, result, isLoading, error }
}

