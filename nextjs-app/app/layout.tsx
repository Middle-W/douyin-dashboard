export const metadata = {
  title: '抖音账号数据中心',
  description: '抖音小店数据看板'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body style={{ margin: 0, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', background: '#f3f4f6' }}>
        {children}
      </body>
    </html>
  );
}
