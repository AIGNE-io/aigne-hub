import { flatten } from 'flat';

export default flatten({
  usage: '使用情况',
  aiProvider: 'AI 提供商',
  aiProviderSubscription: '订阅 AIGNE Hub 服务',
  aiProviderLocalAIKit: '本地 AIGNE Hub 组件',
  selectMonth: '选择月份',
  subscribeAITip: '现在订阅 AIGNE Hub 来获得 AI 能力吧！',
  unsubscribe: '取消订阅',
  unsubscribeTip: '取消订阅后将无法继续使用我们提供的 AI 服务！',
  cancel: '取消',
  unsubscribeAt: '订阅失效于',
  cancelled: '取消成功',
  recoverSubscription: '恢复订阅',
  recoverSubscriptionTip: '恢复订阅后即可使用我们提供的 AI 服务！',
  recoverSubscriptionSucceed: '恢复订阅成功！',
  total: '合计',
  monthlySpend: '月度消费',
  viewSubscriptionDetail: '查看订阅详情',
  subscriptionPastDueTip: '您的订阅已欠费，请及时支付欠款以恢复订阅服务。',
  payNow: '立即支付',

  // AIGNE Hub integrations
  welcome: '欢迎使用 AIGNE Hub',
  welcomeDesc: '开始使用前，请先配置 AI 提供商来启用 AI 服务。您也可以启用 Credits 计费功能来管理用户使用额度。',

  aiConfig: 'AI 配置',
  quickStarts: '快速开始',
  // AI Provider features
  aiProviderSettings: 'AI 提供商设置',
  aiProviderSettingsDesc: '配置和管理您的 AI 服务提供商和 API 凭证',
  usageAnalytics: '使用分析',
  usageAnalyticsDesc: '监控 AI 服务使用情况、成本和性能指标',
  userManagement: '用户管理',
  userManagementDesc: '管理用户对 AI 服务的访问权限',
  enableCredits: '启用 Credits 计费',
  configCredits: '配置 Credits 计费',
  enableCreditsDesc: '配置 Credits 计费模型以管理用户使用配额',
  creditsConfigTitle: '启用 Credits 计费功能',
  creditsConfigDesc: '启用此功能后，用户需要购买 Credits 才能使用 AI 服务。请按照以下步骤进行配置：',
  gotoConfig: '前往配置',

  // Configuration section
  config: {
    // AI Providers
    aiProviders: 'AI 提供商',

    // Model Rates
    modelRates: {
      title: '模型费率',
      description: '配置不同 AI 模型和提供商的定价费率',

      // Actions
      actions: {
        add: '添加模型费率',
        edit: '编辑模型费率',
        delete: '删除',
        save: '保存',
        cancel: '取消',
      },

      // Fields
      fields: {
        modelName: '模型名称',
        provider: '提供商',
        type: '类型',
        inputRate: '输入',
        outputRate: '输出',
        description: '描述',
        actions: '操作',
      },

      // Types
      types: {
        chatCompletion: '文本',
        imageGeneration: '图像',
        embedding: '嵌入',
      },

      // Form
      form: {
        modelName: {
          label: '模型名称',
          placeholder: '例如：gpt-4o',
          required: '模型名称是必填项',
        },
        modelDisplay: {
          label: '显示名称',
          placeholder: '将根据模型名称自动生成',
          description: '用于界面展示的模型名称（可选）',
        },
        rateType: {
          label: '费率类型',
          required: '费率类型是必填项',
          options: {
            chatCompletion: '文本生成',
            imageGeneration: '图像生成',
            embedding: '文本嵌入',
          },
        },
        inputRate: {
          label: '输入每 Token 消耗 AIGNE Hub Credits 数量',
          placeholder: '0',
          required: '输入费率是必填项',
        },
        outputRate: {
          label: '输出每 Token 消耗 AIGNE Hub Credits 数量',
          placeholder: '0',
          required: '输出费率是必填项',
        },
        providers: {
          label: '提供商',
          tooltip: '选择支持此模型的 AI 提供商',
          required: '请至少选择一个提供商',
        },
        description: {
          label: '描述',
          placeholder: '关于此模型费率的附加说明...',
        },
      },

      // Messages
      createSuccess: '模型费率创建成功',
      updateSuccess: '模型费率更新成功',
      deleteSuccess: '模型费率删除成功',
      createFailed: '创建模型费率失败',
      updateFailed: '更新模型费率失败',
      deleteFailed: '删除模型费率失败',
      fetchFailed: '获取模型费率失败',

      // Configuration info
      configInfo: {
        title: '模型费率偏好配置',
        creditValue: 'AIGNE Hub Credits 价格：',
        profitMargin: '目标利润率：',
        formula: '定价公式',
        adjustSettings: '如需调整基准价格和利润率，请前往',
        settingsLink: 'AIGNE Hub 偏好设置',
        autoCalculate: '自动计算',
        actualCost: 'Token 成本：',
        creditCost: 'AIGNE Hub Credits 成本：',
        profitRate: '收益率：',
        formulaTitle: '计算公式',
        variableExplanation: '变量说明：',
        creditPrice: 'AIGNE Hub Credits 单价',
        targetProfitMargin: '目标利润率',
        modelTokenCost: '模型每 Token 成本',
        actualProviderCost: 'AI 提供商实际收费',
        formulaExample: '示例',
        pricingFormula: '定价计算公式',
        tokenConsumption: '每 Token 消耗 AIGNE Hub Credits 数量',
        creditPriceDesc: '1 个 AIGNE Hub Credits 的价格（美元）',
        profitMarginDesc: '在成本基础上的加价百分比',
        modelCostDesc: 'AI 提供商对该模型每 Token 的实际收费',
        aicRateConfig: 'AIGNE Hub Credits 费率配置',
        inputTokenConsumption: '每个输入 Token 消耗的 AIGNE Hub Credits 数量',
        outputTokenConsumption: '每个输出 Token 消耗的 AIGNE Hub Credits 数量',
        currentModelCost: '当前模型成本',
        estimatedProfitRate: '预估收益率',
        inputCost: '输入成本',
        outputCost: '输出成本',
        perToken: ' / Token',
        explanation: {
          title: '定价说明',
          creditExplain: 'AIGNE Hub Credits 是 AI 服务的计费单位',
          formulaExplain: '根据模型实际成本和目标利润率自动计算每 Token 消耗的 AIGNE Hub Credits 数量',
          profitExplain: '系统会在模型成本基础上加上目标利润率来确定最终价格',
        },
        customModelCost: '模型成本',
        customModelCostDesc: '输入和输出成本将用于计算每 Token 消耗的 AIGNE Hub Credits 数量',
        viewPricing: '查看定价',
        pricingTooltip: '点击查看官方定价信息',
        pricingMenuTitle: '查看各模型定价信息',
        unitTooltip: {
          credit: '1M 表示每百万 AIGNE Hub Credits',
          token: '1M 表示每百万 Token',
        },
        search: {
          placeholder: '搜索模型名称、显示名称或描述',
        },
        sort: {
          createdAt: '创建时间',
        },
        pagination: {
          showing: '显示第 {from}-{to} 条，共 {total} 条',
        },
      },

      // Delete dialog
      deleteDialog: {
        title: '删除模型费率',
        message: '确定要删除此模型费率吗？此操作不可撤销。',
        confirm: '删除',
        cancel: '取消',
      },
    },
  },

  // Common actions
  edit: '编辑',
  delete: '删除',
  create: '创建',
  update: '更新',
  save: '保存',
  close: '关闭',
  confirm: '确认',
  yes: '是',
  no: '否',
  loading: '加载中...',
  noData: '暂无数据',
  required: '此字段为必填项',
  optional: '可选',

  // AI Providers page
  aiProviders: 'AI 提供商配置',
  aiProvidersDesc: '管理您的 AI 服务提供商和 API 凭证',
  addProvider: '添加提供商',
  editProvider: '编辑提供商',
  awsRegionDesc: '您的 Bedrock 服务所在的 AWS 区域',
  provider: '提供商',
  providerName: '提供商',
  providerNameRequired: '请选择提供商',
  providerInfo: '提供商信息',
  baseUrl: 'Base URL',
  region: '区域',
  regionRequired: '请输入区域',
  endpointRegion: '端点 / 区域',
  enabled: '已启用',
  disabled: '已禁用',
  connected: '已连接',
  disconnected: '未连接',
  status: '状态',
  enableStatus: '启用状态',
  actions: '操作',
  configureCredentials: '配置凭证',

  // Credentials
  credentials: '凭证',
  credentialCount: '个凭证',
  addCredential: '添加凭证',
  editCredential: '编辑凭证',
  deleteCredential: '删除凭证',
  manageCredentials: '管理凭证',
  noCredentials: '暂无凭证配置',
  credentialName: '凭证名称',
  credentialNameRequired: '凭证名称是必填项',
  credentialValue: 'API Key',
  credentialValueRequired: 'API Key 是必填项',
  credentialType: '凭证类型',
  credentialTypeRequired: '凭证类型是必填项',
  enterCredentialValue: '输入凭证值',
  apiKey: 'API 密钥',
  accessKeyPair: '访问密钥对',
  custom: '自定义',
  accessKeyId: 'Access Key ID',
  secretAccessKey: 'Secret Access Key',
  usageCount: '使用次数',
  lastUsed: '最后使用',
  created: '创建时间',
  deleteCredentialConfirm: '确定要删除凭证',

  // Messages
  providerCreated: '提供商创建成功',
  providerUpdated: '提供商更新成功',
  providerEnabled: '提供商启用成功',
  providerDisabled: '提供商禁用成功',
  createProviderFailed: '创建提供商失败',
  updateProviderFailed: '更新提供商失败',
  fetchProvidersFailed: '获取提供商失败',

  createCredentialFailed: '创建凭证失败',
  updateCredentialFailed: '更新凭证失败',
  deleteCredentialFailed: '删除凭证失败',

  selectProviders: '选择提供商',
  submitFailed: '提交失败',
  installPaymentKit: '步骤 1：安装 Payment Kit',
  updatePreferences: '步骤 2：更新 AIGNE Hub 偏好设置',
  installPaymentKitDesc:
    '在 Blocklet Store 中搜索并安装 Payment Kit 组件，这是启用 Credits 计费功能的前提条件。通过 Payment Kit，您可以管理多种支付方式和相关配置，为用户提供便捷的充值体验。',

  // Home page
  homeSubtitle: '为 blocklets 提供的去中心化 AI 接入解决方案',
  creditBillingInfo: 'AIGNE Hub 已启用基于 Credit 的计费功能，您可以选择充值或前往账单管理自己的 Credits 额度。',
  loginToAccess: '登录',
  configuration: '配置管理',
  playground: '沙盒环境',
  integration: '集成示例',
  manageCredits: '管理 Credits',
  quickIntegration: '快速集成',
  integrationDesc: '使用 AIGNE Framework 开始集成 AIGNE Hub：',
  codeCopied: '代码已复制到剪贴板！',
});
