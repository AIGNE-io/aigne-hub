# Embeddings

This document provides a detailed specification for the AIGNE Hub Embeddings API endpoint. By following this guide, you will learn how to convert text into numerical vector representations, a foundational step for tasks like semantic search, text clustering, and similarity analysis.

## Create embedding

Generates a vector representation for a given text input. This is useful for machine learning applications that require a numerical representation of text.

**POST** `/api/embeddings`

### Request Body

<x-field-group>
  <x-field data-name="model" data-type="string" data-required="true">
    <x-field-desc markdown>The ID of the model to use for generating the embeddings. The model must be compatible with embedding tasks.</x-field-desc>
  </x-field>
  <x-field data-name="input" data-type="string or array" data-required="true">
    <x-field-desc markdown>The input text or tokens to embed. This can be a single string, an array of strings, an array of integers (tokens), or an array of integer arrays (batched tokens).</x-field-desc>
  </x-field>
</x-field-group>

### Example Request

Here is an example of how to call the embeddings endpoint using cURL.

```bash Create an embedding request icon=lucide:terminal
curl https://your-aigne-hub-instance.com/api/embeddings \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "model": "text-embedding-3-small",
    "input": "AIGNE Hub is a unified AI gateway."
  }'
```

### Response Body

The API returns an object containing the list of embedding data.

<x-field-group>
  <x-field data-name="data" data-type="array" data-required="true">
    <x-field-desc markdown>An array of embedding objects, where each object corresponds to an input item.</x-field-desc>
    <x-field data-name="embedding" data-type="array" data-required="true">
      <x-field-desc markdown>The vector representation of the input text, returned as an array of floating-point numbers.</x-field-desc>
    </x-field>
    <x-field data-name="index" data-type="number" data-required="true">
      <x-field-desc markdown>The index of the embedding in the list, corresponding to the order of the input items.</x-field-desc>
    </x-field>
    <x-field data-name="object" data-type="string" data-required="true">
      <x-field-desc markdown>The type of object, which is always `embedding`.</x-field-desc>
    </x-field>
  </x-field>
  <x-field data-name="model" data-type="string" data-required="true">
    <x-field-desc markdown>The model that was used to generate the embeddings.</x-field-desc>
  </x-field>
  <x-field data-name="object" data-type="string" data-required="true">
    <x-field-desc markdown>The type of the top-level object, which is always `list`.</x-field-desc>
  </x-field>
  <x-field data-name="usage" data-type="object" data-required="true">
    <x-field-desc markdown>An object detailing the token usage for the request.</x-field-desc>
    <x-field data-name="prompt_tokens" data-type="number" data-required="true">
      <x-field-desc markdown>The number of tokens in the input prompt.</x-field-desc>
    </x-field>
    <x-field data-name="total_tokens" data-type="number" data-required="true">
      <x-field-desc markdown>The total number of tokens consumed by the request.</x-field-desc>
    </x-field>
  </x-field>
</x-field-group>

### Example Response

```json Example Response
{
  "object": "list",
  "data": [
    {
      "object": "embedding",
      "embedding": [
        -0.006929283495992422,
        -0.005336422007530928,
        ...
        -4.547132266452536e-05
      ],
      "index": 0
    }
  ],
  "model": "text-embedding-3-small",
  "usage": {
    "prompt_tokens": 8,
    "total_tokens": 8
  }
}
```

## Summary

The Embeddings API provides a straightforward method for converting text into high-dimensional vectors, enabling a wide range of natural language processing applications. For building more complex conversational or generative AI, you may also want to explore the [Chat Completions API](./api-reference-chat-completions.md).