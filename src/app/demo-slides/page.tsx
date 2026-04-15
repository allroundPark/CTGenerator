export const metadata = {
  title: 'CT Generator — Demo Slides',
};

export default function DemoSlidesPage() {
  return (
    <iframe
      src="/slides/index.html"
      title="CT Generator Demo Slides"
      style={{
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100vh',
        border: 'none',
        background: '#1A1816',
      }}
    />
  );
}
