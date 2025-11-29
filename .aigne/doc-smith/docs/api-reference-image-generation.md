# Image Generation

This document provides the technical specifications for the image generation endpoint. By following this guide, you will be able to integrate AI-powered image creation into your applications by structuring requests, specifying models and parameters, and handling the resulting image data.

The AIGNE Hub API allows you to generate new images from a text prompt or edit existing images. For details on other AI functionalities, see the [Chat Completions](./api-reference-chat-completions.md) and [Embeddings](./api-reference-embeddings.md) documentation.

## Create Image

Generates an image based on a textual description (prompt). You can also provide an existing image to be edited.

**Endpoint**

```sh
POST /api/images/generations
```

This endpoint creates a new image or edits an existing one, returning the image data in the specified format.

### Request Body

<x-field-group>
  <x-field data-name="prompt" data-type="string" data-required="true">
    <x-field-desc markdown>A detailed text description of the desired image. The maximum length depends on the model, but shorter, precise prompts often yield better results.</x-field-desc>
  </x-field>
  <x-field data-name="model" data-type="string" data-required="false" data-default="dall-e-2">
    <x-field-desc markdown>The model ID to use for image generation. If not specified, the system defaults to `dall-e-2`. Other models like `dall-e-3` or Google's `gemini` models may be available depending on provider configurations.</x-field-desc>
  </x-field>
  <x-field data-name="image" data-type="string or array" data-required="false">
    <x-field-desc markdown>The source image or images for editing. This can be a URL or a Base64 encoded string. Currently, this parameter is utilized by the `gpt-image-1` model for image editing tasks.</x-field-desc>
  </x-field>
  <x-field data-name="n" data-type="integer" data-required="false" data-default="1">
    <x-field-desc markdown>The number of images to generate. Must be an integer between `1` and `10`.</x-field-desc>
  </x-field>
  <x-field data-name="size" data-type="string" data-required="false" data-default="1024x1024">
    <x-field-desc markdown>The desired dimensions of the generated image. Supported sizes depend on the selected model. Common values include `256x256`, `512x512`, and `1024x1024` for DALL·E 2, and `1024x1024`, `1792x1024`, or `1024x1792` for DALL·E 3.</x-field-desc>
  </x-field>
  <x-field data-name="response_format" data-type="string" data-required="false" data-default="url">
    <x-field-desc markdown>The format in which the generated images are returned. Must be one of `url` or `b64_json`. A `url` will be accessible for one hour, while `b64_json` provides the image data encoded in Base64.</x-field-desc>
  </x-field>
  <x-field data-name="quality" data-type="string" data-required="false" data-default="standard">
    <x-field-desc markdown>The quality of the generated image. Only supported by `dall-e-3`. Can be `standard` for faster generation or `hd` for enhanced detail and higher quality, which may have increased cost.</x-field-desc>
  </x-field>
  <x-field data-name="style" data-type="string" data-required="false" data-default="vivid">
    <x-field-desc markdown>The artistic style of the generated image. Only supported by `dall-e-3`. Can be `vivid` for hyper-realistic and dramatic results or `natural` for a more photorealistic and less processed look.</x-field-desc>
  </x-field>
</x-field-group>

### Response Body

The API returns an object containing the creation timestamp and an array of generated image data.

<x-field-group>
  <x-field data-name="created" data-type="integer">
    <x-field-desc markdown>A UNIX timestamp indicating when the image generation was initiated.</x-field-desc>
  </x-field>
  <x-field data-name="data" data-type="array">
    <x-field-desc markdown>An array of objects, where each object contains one generated image. The structure of the objects inside the array depends on the `response_format` parameter.</x-field-desc>
    <x-field data-name="object" data-type="object">
      <x-field-desc markdown>Contains either a `url` or `b64_json` field with the image data.</x-field-desc>
      <x-field data-name="url" data-type="string">
        <x-field-desc markdown>The URL where the generated image can be accessed. This URL is temporary and will expire.</x-field-desc>
      </x-field>
      <x-field data-name="b64_json" data-type="string">
        <x-field-desc markdown>The Base64-encoded JSON string of the generated image.</x-field-desc>
      </x-field>
    </x-field>
  </x-field>
</x-field-group>

### Examples

#### Basic Image Generation

This example demonstrates a standard request to generate a single image using the default `dall-e-2` model.

```bash Request icon=lucide:terminal
curl --location 'https://your-aigne-hub-instance.com/api/images/generations' \
--header 'Content-Type: application/json' \
--header 'Authorization: Bearer YOUR_API_KEY' \
--data '{
    "prompt": "A photorealistic image of a cat programming on a laptop",
    "n": 1,
    "size": "1024x1024"
}'
```

The server returns the URL for the generated image.

```json Response
{
  "created": 1678886400,
  "data": [
    {
      "url": "https://example.com/generated-images/image-xyz.png"
    }
  ]
}
```

#### Generating with DALL·E 3 and Base64 Response

This example uses the `dall-e-3` model to create a high-quality, vivid image and returns the result as a Base64 encoded string.

```bash Request icon=lucide:terminal
curl --location 'https://your-aigne-hub-instance.com/api/images/generations' \
--header 'Content-Type: application/json' \
--header 'Authorization: Bearer YOUR_API_KEY' \
--data '{
    "model": "dall-e-3",
    "prompt": "An oil painting of a futuristic city skyline at sunset, with flying cars",
    "n": 1,
    "size": "1792x1024",
    "quality": "hd",
    "style": "vivid",
    "response_format": "b64_json"
}'
```

The response contains the Base64 data, which can be directly decoded and saved as an image file.

```json Response
{
  "created": 1678886400,
  "data": [
    {
      "b64_json": "iVBORw0KGgoAAAANSUhEUgAAB...rest_of_base64_string"
    }
  ]
}
```

## Summary

You now have the necessary information to use the image generation endpoint. This includes understanding the request parameters for creating and editing images, as well as handling the different response formats.

For further reading on related API functionalities, please refer to the following documents:
<x-cards data-columns="2">
  <x-card data-title="Chat Completions API" data-icon="lucide:message-square" data-href="/api-reference/chat-completions">
    Learn how to build conversational experiences with our chat models.
  </x-card>
  <x-card data-title="Embeddings API" data-icon="lucide:ruler" data-href="/api-reference/embeddings">
    Discover how to create numerical representations of text for machine learning tasks.
  </x-card>
</x-cards>