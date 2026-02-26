import OpenAI from "openai";

const client = new OpenAI({
	baseURL: "https://api.deepseek.com",
	apiKey: process.env.DEEPSEEK_API_KEY,
})

export async function generate(prompt: string): Promise<string | undefined> {
	const result = await client.chat.completions.create({
		model: "deepseek-chat",
		messages: [{
			role: "user",
			content: prompt,
		}]
	})
	if (result?.choices[0]?.message.content === null) {
		throw new Error("DeepSeek returned empty response");
	}
	return result?.choices[0]?.message.content;
}