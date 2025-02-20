import { ChatCompletionChunk, ChatCompletionInput, ChatCompletionResponse } from '@blocklet/ai-kit/api/types';
import OpenAI from 'openai';

export async function* openaiChatCompletion(
  input: ChatCompletionInput & Required<Pick<ChatCompletionInput, 'model'>>,
  openai: OpenAI
): AsyncGenerator<ChatCompletionResponse> {
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
    tool_choice: input.tools?.length ? (input.toolChoice ?? 'auto') : undefined,
    response_format:
      input.responseFormat?.type === 'json_schema'
        ? { type: 'json_schema', json_schema: input.responseFormat.jsonSchema }
        : input.responseFormat?.type
          ? { type: input.responseFormat.type }
          : undefined,
    stream_options: { include_usage: true },
  });

  const toolCalls: ChatCompletionChunk['delta']['toolCalls'] = [];

  for await (const chunk of res) {
    const choice = chunk.choices[0];
    if (choice?.delta) {
      const {
        delta: { role, ...delta },
      } = choice;

      if (delta.tool_calls) {
        for (const call of delta.tool_calls) {
          toolCalls[call.index] ??= {};
          const c = toolCalls[call.index]!;
          if (call.id) c.id = call.id;
          if (call.type) c.type = call.type;
          c.function ??= {};
          if (call.function?.name) c.function.name = call.function.name;
          if (call.function?.arguments) c.function.arguments = (c.function.arguments || '') + call.function.arguments;
        }
      }

      yield {
        delta: {
          role,
          content: delta.content,
          toolCalls,
        },
      };
    }
    if (chunk.usage) {
      yield {
        usage: {
          promptTokens: chunk.usage.prompt_tokens,
          completionTokens: chunk.usage.completion_tokens,
          totalTokens: chunk.usage.total_tokens,
        },
      };
    }
  }
}
