import Footer from '@blocklet/ui-react/lib/Footer';

export default function AppFooter() {
  return (
    <Footer
      // FIXME: remove following undefined props after issue https://github.com/ArcBlock/ux/issues/1136 solved
      meta={undefined}
      theme={undefined}
    />
  );
}
