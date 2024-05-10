import { ChatCompletionChunk, ChatCompletionInput } from '@blocklet/ai-kit/api/types';
import OpenAI from 'openai';

export async function* openaiChatCompletion(
  input: ChatCompletionInput & Required<Pick<ChatCompletionInput, 'model'>>,
  openai: OpenAI
): AsyncGenerator<ChatCompletionChunk> {
  const res = await openai.chat.completions.create({
    stream: true,
    model: input.model,
    messages: input.messages.map((msg) => {
      if (msg.role === 'user') {
        return {
          role: msg.role,
          content: Array.isArray(msg.content)
            ? msg.content.map((i) => {
                if (i.type === 'text') return { type: i.type, text: i.text };
                return { type: i.type, image_url: i.imageUrl };
              })
            : msg.content,
        };
      }
      if (msg.role === 'assistant') {
        return {
          role: msg.role,
          content: msg.content,
        };
      }
      if (msg.role === 'tool') {
        return {
          role: msg.role,
          content: msg.content,
          tool_call_id: msg.toolCallId,
        };
      }
      return msg;
    }),
    temperature: input.temperature,
    top_p: input.topP,
    presence_penalty: input.presencePenalty,
    frequency_penalty: input.frequencyPenalty,
    max_tokens: input.maxTokens,
    tools: input.tools,
    tool_choice: input.tools?.length ? input.toolChoice ?? 'auto' : undefined,
  });

  for await (const chunk of res) {
    const choice = chunk.choices[0];
    if (choice?.delta) {
      const {
        delta: { role, ...delta },
      } = choice;

      yield {
        delta: {
          role,
          content: delta.content,
          toolCalls: delta.tool_calls?.map((i) => ({
            id: i.id,
            type: i.type,
            function: i.function && { name: i.function.name, arguments: i.function.arguments },
          })),
        },
      };
    }
  }
}
