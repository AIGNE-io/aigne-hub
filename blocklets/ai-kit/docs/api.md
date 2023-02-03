# AI Kit api references

## status

Get AI Kit status, it would return `available: true` if it is available.

```ts
const res = await Component.call({
  name: 'ai-kit',
  path: '/api/v1/sdk/status',
  data: {}
})

res // { available: boolean }
```

## completions

Autocomplete given text by AI.

```ts
const res = await Component.call({
  name: 'ai-kit',
  path: '/api/v1/sdk/completions',
  data: {
	prompt: 'Say hi'
  }
})

res // { choices: { text: string }[] }
```
