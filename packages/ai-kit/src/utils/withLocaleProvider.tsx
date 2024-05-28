import { LocaleProvider, useLocaleContext } from '@arcblock/ux/lib/Locale/context';
import { ComponentType } from 'react';

export default function withLocaleProvider<T>(
  C: ComponentType<T>,
  {
    translations,
    fallbackLocale = 'en',
  }: { fallbackLocale?: string; translations: { [locale: string]: { [key: string]: string } } }
): ComponentType<T> {
  return ((...args: any) => {
    const { locale } = useLocaleContext();

    return (
      <LocaleProvider translations={translations} fallbackLocale={fallbackLocale} locale={locale}>
        <C {...args} />
      </LocaleProvider>
    );
  }) as any;
}
