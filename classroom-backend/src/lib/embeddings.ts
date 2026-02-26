import OpenAI from "openai";

const client = new OpenAI({
	apiKey: process.env.OPENAI_API_KEY,
});

export async function generateEmbedding(text: string): Promise<number[] | undefined> {
	const response = await client.embeddings.create({
		model: "text-embedding-3-small",
		input: text,
	})

	return response.data[0]?.embedding;
}