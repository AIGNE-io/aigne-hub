import { flatten } from 'flat';

export default flatten({
  usage: 'Usage',
  aiProvider: 'AI Provider',
  aiProviderSubscription: 'Subscribe to AI Service',
  aiProviderLocalAIKit: 'Local AIKit component',
  selectMonth: 'Select Month',
  subscribeAITip: 'Subscribe to AIGNE Hub now to unlock the power of AI!',
  unsubscribe: 'Unsubscribe',
  unsubscribeTip: 'After unsubscribing, you will no longer be able to continue using the AI services we provide!',
  cancel: 'Cancel',
  unsubscribeAt: 'Unsubscribe at',
  cancelled: 'Cancelled',
  recoverSubscription: 'Recover Subscription',
  recoverSubscriptionTip: 'After recover the subscription, you can use the AI services we provide!',
  recoverSubscriptionSucceed: 'Subscription recover successful!',
  total: 'Total',
  monthlySpend: 'Monthly Spend',
  viewSubscriptionDetail: 'View subscription details',
  subscriptionPastDueTip:
    'Your subscription is overdue. Please make a payment promptly to restore your subscription service.',
  payNow: 'Pay Now',

  // AIGNE Hub integrations
  welcome: 'Welcome to AIGNE Hub',
  welcomeDesc:
    'Get started by configuring AI providers to enable AI services. You can also enable Credits billing to manage user usage quotas.',

  aiConfig: 'AI Config',
  quickStarts: 'Quick Starts',
  // AI Provider features
  aiProviderSettings: 'AI Provider Settings',
  aiProviderSettingsDesc: 'Configure and manage your AI service providers and API credentials',
  usageAnalytics: 'Usage Analytics',
  usageAnalyticsDesc: 'Monitor AI service usage, costs, and performance metrics',
  userManagement: 'User Management',
  userManagementDesc: 'Manage user access and permissions for AI services',

  // Credits configuration
  enableCredits: 'Enable Credits Billing',
  configCredits: 'Configure Credits Billing',
  enableCreditsDesc: 'Configure credit-based billing model to manage user usage quotas',
  creditsConfigTitle: 'Enable Credits Billing Feature',
  creditsConfigDesc:
    'After enabling this feature, users need to purchase Credits to use AI services. Please follow these steps to configure:',
  gotoConfig: 'Go to Configuration',
  installPaymentKit: 'Step 1: Install Payment Kit',
  updatePreferences: 'Step 2: Update AIGNE Hub Preferences',
  installPaymentKitDesc:
    'Search and install the Payment Kit component from Blocklet Store. This is a prerequisite for enabling Credits billing. With Payment Kit, you can manage multiple payment methods and related configurations, providing users with a convenient top-up experience.',

  // Configuration section
  config: {
    // AI Providers
    aiProviders: 'AI Providers',

    // Model Rates
    modelRates: {
      title: 'Model Rates',
      description: 'Configure pricing rates for different AI models and providers',

      // Actions
      actions: {
        add: 'Add Model Rate',
        edit: 'Edit Model Rate',
        delete: 'Delete',
        save: 'Save',
        cancel: 'Cancel',
      },

      // Fields
      fields: {
        modelName: 'Model',
        provider: 'Provider',
        type: 'Type',
        inputRate: 'Input',
        outputRate: 'Output',
        description: 'Description',
        actions: 'Actions',
      },

      // Types
      types: {
        chatCompletion: 'Text',
        imageGeneration: 'Image',
        embedding: 'Embedding',
      },

      // Form
      form: {
        modelName: {
          label: 'Model Name',
          placeholder: 'For example: gpt-4o',
          required: 'Model Name is required',
        },
        modelDisplay: {
          label: 'Display Name',
          placeholder: 'Auto-generated from model name',
          description: 'Model display name for UI presentation (optional)',
        },
        rateType: {
          label: 'Rate Type',
          required: 'Rate type is required',
          options: {
            chatCompletion: 'Text',
            imageGeneration: 'Image',
            embedding: 'Embedding',
          },
        },
        inputRate: {
          label: 'Input AIC Per Token',
          placeholder: '0.005',
          required: 'Input rate is required',
        },
        outputRate: {
          label: 'Output AIC Per Token',
          placeholder: '0.015',
          required: 'Output rate is required',
        },
        providers: {
          label: 'Providers',
          tooltip: 'Select which AI providers support this model',
          required: 'Please select at least one provider',
        },
        description: {
          label: 'Description',
          placeholder: 'Additional notes about this model rate...',
        },
      },

      // Messages
      createSuccess: 'Model rate created successfully',
      updateSuccess: 'Model rate updated successfully',
      deleteSuccess: 'Model rate deleted successfully',
      createFailed: 'Failed to create model rate',
      updateFailed: 'Failed to update model rate',
      deleteFailed: 'Failed to delete model rate',
      fetchFailed: 'Failed to fetch model rates',

      // Configuration info
      configInfo: {
        title: 'Model Rate Preferences',
        creditValue: '1 AIC = $',
        profitMargin: 'Target Profit Margin: ',
        formula: 'Pricing Formula',
        adjustSettings: 'To adjust base price and profit margin, go to',
        settingsLink: 'AIGNE Hub Preferences',
        autoCalculate: 'Auto Calculate',
        actualCost: 'Token Cost: ',
        creditCost: 'AIC Cost: ',
        profitRate: 'Profit Rate: ',
        formulaTitle: 'Calculation Formula',
        variableExplanation: 'Variable Explanation:',
        creditPrice: 'AIC Price',
        targetProfitMargin: 'Target Profit Margin',
        modelTokenCost: 'Model Cost per Token',
        actualProviderCost: 'Actual Provider Cost',
        formulaExample: 'Example',
        pricingFormula: 'Pricing Calculation Formula',
        tokenConsumption: 'AIC Consumption per Token',
        creditPriceDesc: 'Price of 1 AIC',
        profitMarginDesc: 'Percentage added on top of cost',
        modelCostDesc: 'Actual cost per token charged by AI providers',
        aicRateConfig: 'AIC Rate Configuration',
        inputTokenConsumption: 'AIC consumption per input token',
        outputTokenConsumption: 'AIC consumption per output token',
        currentModelCost: 'Current Model Cost',
        estimatedProfitRate: 'Estimated Profit Rate',
        inputCost: 'Input Cost',
        outputCost: 'Output Cost',
        perToken: ' / Token',
        explanation: {
          title: 'Pricing Explanation',
          creditExplain: 'AIC is the billing unit used for AI services',
          formulaExplain:
            'Auto-calculate AIC consumption per token based on actual model cost and target profit margin',
          profitExplain: 'The system adds target profit margin to the model cost to determine final pricing',
        },
      },

      // Delete dialog
      deleteDialog: {
        title: 'Delete Model Rate',
        message: 'Are you sure you want to delete this model rate? This action cannot be undone.',
        confirm: 'Delete',
        cancel: 'Cancel',
      },
    },
  },

  // Common actions
  edit: 'Edit',
  delete: 'Delete',
  create: 'Create',
  update: 'Update',
  save: 'Save',
  close: 'Close',
  confirm: 'Confirm',
  yes: 'Yes',
  no: 'No',
  loading: 'Loading...',
  noData: 'No data available',
  required: 'This field is required',
  optional: 'Optional',

  // AI Providers page
  aiProviders: 'AI Providers Settings',
  aiProvidersDesc: 'Manage your AI service providers and API credentials',
  addProvider: 'Add Provider',
  editProvider: 'Edit Provider',
  awsRegionDesc: 'AWS region where your Bedrock service is located',
  provider: 'Provider',
  providerName: 'Provider',
  providerNameRequired: 'Please select provider',
  providerInfo: 'Provider Information',
  baseUrl: 'Base URL',
  region: 'Region',
  regionRequired: 'Please enter region',
  endpointRegion: 'Endpoint / Region',
  enabled: 'Enabled',
  disabled: 'Disabled',
  connected: 'Connected',
  disconnected: 'Disconnected',
  status: 'Status',
  enableStatus: 'Enable Status',
  actions: 'Actions',
  configureCredentials: 'Configure Credentials',

  // Credentials
  credentials: 'Credentials',
  credentialCount: 'credentials',
  addCredential: 'Add Credential',
  editCredential: 'Edit Credential',
  deleteCredential: 'Delete Credential',
  manageCredentials: 'Manage Credentials',
  noCredentials: 'No credentials configured',
  credentialName: 'Credential Name',
  credentialNameRequired: 'Credential name is required',
  credentialValue: 'API Key',
  credentialValueRequired: 'API Key is required',
  credentialType: 'Credential Type',
  credentialTypeRequired: 'Credential type is required',
  enterCredentialValue: 'Enter credential value',
  apiKey: 'API Key',
  accessKeyPair: 'Access Key Pair',
  custom: 'Custom',
  accessKeyId: 'Access Key ID',
  secretAccessKey: 'Secret Access Key',
  usageCount: 'Usage Count',
  lastUsed: 'Last Used',
  created: 'Created',
  deleteCredentialConfirm: 'Are you sure you want to delete credential',

  // Messages
  providerCreated: 'Provider created successfully',
  providerUpdated: 'Provider updated successfully',
  providerEnabled: 'Provider enabled successfully',
  providerDisabled: 'Provider disabled successfully',
  createProviderFailed: 'Failed to create provider',
  updateProviderFailed: 'Failed to update provider',
  fetchProvidersFailed: 'Failed to fetch providers',

  createCredentialFailed: 'Failed to create credential',
  updateCredentialFailed: 'Failed to update credential',
  deleteCredentialFailed: 'Failed to delete credential',

  selectProviders: 'Select Providers',
  submitFailed: 'Submit failed',
});
