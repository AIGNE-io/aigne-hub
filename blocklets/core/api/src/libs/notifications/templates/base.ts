export interface BaseNotificationTemplateContext {
  locale: string;
  userDid: string;
}

export interface BaseNotificationTemplateOptions {
  [key: string]: any;
}

export interface BaseNotificationTemplateType {
  title: string;
  body: string;
  actions?: Array<{
    name: string;
    title: string;
    link: string;
  }>;
  attachments?: Array<{
    type: string;
    data?: any;
    fields?: Array<{
      type: string;
      data: {
        type: string;
        color?: string;
        text: string;
      };
    }>;
  }>;
}

export abstract class BaseNotificationTemplate<
  TContext extends BaseNotificationTemplateContext = BaseNotificationTemplateContext,
  TOptions extends BaseNotificationTemplateOptions = BaseNotificationTemplateOptions,
> {
  options: TOptions;

  constructor(options: TOptions) {
    this.options = options;
  }

  abstract getContext(): Promise<TContext>;
  abstract getTemplate(): Promise<BaseNotificationTemplateType>;
}
