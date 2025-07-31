import { ChatCompletionChunk, ChatCompletionInput, ChatCompletionResponse } from '@blocklet/aigne-hub/api/types';
import { CustomError } from '@blocklet/error';
import {
  FunctionCallingMode,
  FunctionDeclarationSchema,
  GenerationConfig,
  GoogleGenerativeAI,
  ResponseSchema,
  SchemaType,
  Tool,
  ToolConfig,
} from '@google/generative-ai';
import { customAlphabet } from 'nanoid';

export async function* geminiChatCompletion(
  input: ChatCompletionInput & Required<Pick<ChatCompletionInput, 'model'>>,
  config: { apiKey: string }
): AsyncGenerator<ChatCompletionResponse> {
  const client = new GoogleGenerativeAI(config.apiKey);
  const model = client.getGenerativeModel({ model: input.model });

  const res = await model.generateContentStream({
    contents: await contentsFromMessages(input.messages),
    tools: toolsFromInputTools(input.tools),
    toolConfig: toolConfigFromInputToolChoice(input.toolChoice),
    generationConfig: generationConfigFromInput(input),
  });

  const toolCalls: ChatCompletionChunk['delta']['toolCalls'] = [];

  for await (const chunk of res.stream) {
    const choice = chunk.candidates?.[0];
    if (choice?.content?.parts) {
      const calls = choice.content.parts
        .map((part) => {
          if (part.functionCall) {
            return {
              id: randomId(),
              type: 'function' as const,
              function: {
                name: part.functionCall.name,
                arguments: JSON.stringify(part.functionCall.args),
              },
            };
          }

          return undefined;
        })
        .filter((i): i is NonNullable<typeof i> => !!i);

      if (calls.length) {
        toolCalls.push(...calls);
      }

      yield {
        delta: {
          role: 'assistant',
          content: choice.content.parts
            .map((i) => i.text)
            .filter(Boolean)
            .join('\n'),
          toolCalls,
        },
      };
    }

    if (chunk.promptFeedback?.blockReason) {
      const { blockReason, blockReasonMessage } = chunk.promptFeedback;

      throw new Error(['PROMPT_BLOCKED', blockReason, blockReasonMessage].filter(Boolean).join(' '));
    }

    if (chunk.usageMetadata) {
      yield {
        usage: {
          promptTokens: chunk.usageMetadata.promptTokenCount,
          completionTokens: chunk.usageMetadata.candidatesTokenCount,
          totalTokens: chunk.usageMetadata.totalTokenCount,
        },
      };
    }
  }
}

async function contentsFromMessages([...messages]: ChatCompletionInput['messages']) {
  const contents = [];

  let prevMsg: { role: 'user' | 'model'; parts: { text: string }[] } | undefined;

  while (messages.length) {
    const message = messages.shift()!;

    if (!prevMsg || message.role !== prevMsg.role) {
      prevMsg = { role: message.role === 'assistant' ? 'model' : 'user', parts: [] };
      contents.push(prevMsg);
    }

    if (typeof message.content === 'string') {
      prevMsg.parts.push({ text: message.content });
    } else if (Array.isArray(message.content)) {
      prevMsg.parts.push(
        ...message.content
          .map((i) => ({ text: i.type === 'text' ? i.text : undefined }))
          .filter((i): i is { text: string } => !!i.text)
      );
    }
  }

  if (contents[0]?.role !== 'user') {
    contents.unshift({ role: 'user', parts: [{ text: ' ' }] });
  }
  if (contents.at(-1)?.role !== 'user') {
    contents.push({ role: 'user', parts: [{ text: ' ' }] });
  }

  return contents;
}

const randomId = customAlphabet('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789');

function generationConfigFromInput(input: ChatCompletionInput): GenerationConfig {
  const jsonSchema = input.responseFormat?.type === 'json_schema' ? input.responseFormat.jsonSchema : undefined;

  return {
    temperature: input.temperature,
    topP: input.topP,
    frequencyPenalty: input.frequencyPenalty,
    presencePenalty: input.presencePenalty,
    responseMimeType: jsonSchema ? 'application/json' : undefined,
    responseSchema: jsonSchema ? openAISchemaToGeminiSchema(jsonSchema) : undefined,
  };
}

function openAISchemaToGeminiSchema(schema: {
  // biome-ignore lint/suspicious/noExplicitAny: TODO: strict schema typing
  [key: string]: any;
}): ResponseSchema {
  if (!schema.type || schema.type === 'string') {
    return {
      type: SchemaType.STRING,
      description: schema.description,
    };
  }

  if (schema.type === 'number') {
    return {
      type: SchemaType.NUMBER,
      description: schema.description,
    };
  }

  if (schema.type === 'boolean') {
    return {
      type: SchemaType.BOOLEAN,
      description: schema.description,
    };
  }

  if (schema.type === 'object') {
    return {
      type: SchemaType.OBJECT,
      description: schema.description,
      properties: Object.fromEntries(
        // biome-ignore lint/suspicious/noExplicitAny: TODO: strict schema typing
        Object.entries(schema.properties).map(([key, s]: any) => [key, openAISchemaToGeminiSchema(s)])
      ),
      required: schema.required,
    };
  }
  if (schema.type === 'array') {
    return {
      type: SchemaType.ARRAY,
      items: openAISchemaToGeminiSchema(schema.items),
    };
  }

  throw new CustomError(400, `Unsupported schema type ${schema.type}`);
}

function toolConfigFromInputToolChoice(toolChoice?: ChatCompletionInput['toolChoice']): ToolConfig | undefined {
  if (!toolChoice) return undefined;

  const selectedToolFunctionName =
    typeof toolChoice === 'object' && toolChoice.type === 'function' ? toolChoice.function.name : undefined;

  return !toolChoice
    ? undefined
    : {
        functionCallingConfig: {
          mode:
            toolChoice === 'required' || selectedToolFunctionName
              ? FunctionCallingMode.ANY
              : toolChoice === 'none'
                ? FunctionCallingMode.NONE
                : FunctionCallingMode.AUTO,
          allowedFunctionNames: selectedToolFunctionName ? [selectedToolFunctionName] : undefined,
        },
      };
}

function toolsFromInputTools(tools?: ChatCompletionInput['tools']): Tool[] | undefined {
  return tools?.length
    ? [
        {
          functionDeclarations: tools.map((i) => ({
            name: i.function.name,
            description: i.function.description,
            parameters:
              Object.keys(i.function.parameters?.properties ?? {}).length === 0
                ? undefined
                : parameterSchemaToFunctionDeclarationSchema(i.function.parameters),
          })),
        },
      ]
    : undefined;
}

function parameterSchemaToFunctionDeclarationSchema(schema: {
  // biome-ignore lint/suspicious/noExplicitAny: TODO: strict schema typing
  [key: string]: any;
}): FunctionDeclarationSchema {
  if (schema.type === 'object') {
    return {
      type: SchemaType.OBJECT,
      description: schema.description,
      properties: Object.fromEntries(
        // biome-ignore lint/suspicious/noExplicitAny: TODO: strict schema typing
        Object.entries(schema.properties).map(([key, s]: any) => [key, openAISchemaToGeminiSchema(s)])
      ),
      required: schema.required,
    };
  }

  throw new Error(`Unsupported schema type ${schema.type}`);
}
