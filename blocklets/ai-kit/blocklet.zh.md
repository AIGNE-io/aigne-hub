# AI Kit

AI Kit 是一个能够快速集成 AI 的 blocklet。使用 AI Kit，开发者能够轻松的将 AI 功能集成到他们的项目中，并创造强大的应用。

## 特点

- 简单的接口，易于集成 AI 功能到应用中
- 支持常用的 AI 服务提供商，如 OpenAI

## 安装和运行

- 点击 Launch 按钮
- 你需要首先购买一个 blocklet 服务器（如果你还没有的话）
- 按照安装向导在 blocklet 服务器上安装 blocklet
- 在 blocklet 服务器控制台启动已安装的 blocklet
- 在 **Blocklets -> AI Kit -> Components -> AI Kit -> Settings -> Environment** 设置 `OPENAI_API_KEY` 并重启 blocklet
  ![setting-api-key](docs/setting-api-key.jpg)
- 访问 AI Kit 的公网地址，你可以从管理员账户菜单中打开 Playground
  ![playground](docs/playground.jpg)

## 集成到你的 blocklet

- 将 AI Kit 作为 component 添加到你的 blocklet 中
- 在 `AI Kit` 组件设置中设置 `OPENAI_API_KEY`，并重启你的 blocklet
- 调用 AI Kit 的 api

## AI Kit 接口

### status

获取 AI Kit 状态

```ts
const res = await Component.call({
  name: 'ai-kit',
  path: '/api/v1/sdk/status',
  data: {}
})

res // { available: boolean }
```

### completions

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

## 获取 OpenAI 的 api key

1. 在 <https://openai.com/api> 创建 OpenAI 账户

2. 获取 api key

   登录到您的 OpenAI 帐户后，您将需要请求一个 API 密钥。 为此，请单击页面顶部的“我的帐户”选项卡。 在“我的帐户”页面上，您会看到“请求 API 密钥”的链接。 单击此链接，您将被带到一个页面，您可以在其中请求 API 密钥。

## 支持

如果您有任何问题或需要帮助，请随时与我们联系 <liyechao@arcblock.io>。 我们很乐意提供帮助！
