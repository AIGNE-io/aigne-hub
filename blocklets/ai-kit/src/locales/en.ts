import { flatten } from 'flat';

export default flatten({
  usage: 'Usage',
  aiProvider: 'AI Provider',
  aiProviderSubscription: 'Subscribe to AI Service',
  aiProviderLocalAIKit: 'Local AIKit component',
  selectMonth: 'Select Month',
  subscribeAITip: 'Subscribe to AI Kit now to unlock the power of AI!',
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

  // AI Kit integrations
  welcome: 'Welcome to Agent Hub',
  welcomeDesc:
    'Get started by configuring AI providers to enable AI services. You can also enable Credits billing to manage user usage quotas.',

  // AI Provider features
  aiProviderSettings: 'AI Provider Settings',
  aiProviderSettingsDesc: 'Configure and manage your AI service providers and API credentials',
  usageAnalytics: 'Usage Analytics',
  usageAnalyticsDesc: 'Monitor AI service usage, costs, and performance metrics',
  userManagement: 'User Management',
  userManagementDesc: 'Manage user access and permissions for AI services',

  // Credits configuration
  enableCredits: 'Enable Credits Billing',
  enableCreditsDesc: 'Configure credit-based billing model to manage user usage quotas',
  creditsConfigTitle: 'Enable Credits Billing Feature',
  creditsConfigDesc:
    'After enabling this feature, users need to purchase Credits to use AI services. Please follow these steps to configure:',
  gotoConfig: 'Go to Configuration',

  // AI Providers page
  aiProviders: 'AI Providers Settings',
  aiProvidersDesc: 'Manage your AI service providers and API credentials',
  addProvider: 'Add Provider',
  provider: 'Provider',
  endpoint: 'Endpoint',
  credentials: 'Credentials',
  status: 'Status',
  enableStatus: 'Enable Status',
  enabled: 'Enabled',
  disabled: 'Disabled',
  connected: 'Connected',
  disconnected: 'Disconnected',
  actions: 'Actions',
  deleteProvider: 'Delete AI Provider',
  deleteProviderConfirm:
    'Are you sure you want to delete the provider "{name}"? This action cannot be undone and will remove all associated credentials.',
  noProvidersConfigured: 'No AI providers configured',

  // Provider form
  providerInfo: 'Provider Info',
  providerName: 'Provider Name',
  providerNameRequired: 'Provider name is required',
  displayName: 'Display Name',
  displayNameRequired: 'Display name is required',
  baseUrl: 'Base URL',
  region: 'Region',
  regionRequired: 'Region is required',
  editProvider: 'Edit Provider',
  create: 'Create',
  update: 'Update',

  // Credentials
  credentialName: 'Credential Name',
  credentialNameRequired: 'Credential name is required',
  credentialValue: 'Credential Value',
  credentialValueRequired: 'Credential value is required',
  credentialType: 'Credential Type',
  credentialTypeRequired: 'Credential type is required',
  addCredential: 'Add Credential',
  editCredential: 'Edit Credential',
  manageCredentials: 'Manage Credentials',
  noCredentials: 'No credentials',
  accessKeyId: 'Access Key ID',
  secretAccessKey: 'Secret Access Key',
  enterCredentialValue: 'Enter credential value',
  usageCount: 'Usage Count',
  lastUsed: 'Last Used',
  created: 'Created',
  delete: 'Delete',
  deleteCredential: 'Delete Credential',
  deleteCredentialConfirm: 'Are you sure you want to delete credential',

  // Messages
  providerCreated: 'Provider created successfully',
  providerUpdated: 'Provider updated successfully',
  providerEnabled: 'Provider enabled',
  providerDisabled: 'Provider disabled',
  fetchProvidersFailed: 'Failed to fetch providers',
  createProviderFailed: 'Failed to create provider',
  updateProviderFailed: 'Failed to update provider',
  createCredentialFailed: 'Failed to create credential',
  updateCredentialFailed: 'Failed to update credential',
  deleteCredentialFailed: 'Failed to delete credential',
  submitFailed: 'Submit failed',

  // Table actions
  edit: 'Edit',
  configureCredentials: 'Configure Credentials',
  credentialCount: 'credentials',
  endpointRegion: 'Endpoint / Region',
});
