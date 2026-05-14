import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

export const metadata: Metadata = {
  title: '抖音数据中心 - 移动端',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

function isMobileDevice(userAgent: string): boolean {
  const mobileRegex = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|mobile/i;
  return mobileRegex.test(userAgent);
}

export default function MobileLayout({ children }: { children: React.ReactNode }) {
  const headersList = headers();
  const userAgent = headersList.get('user-agent') || '';

  // 桌面端访问 /mobile 自动跳回首页
  if (!isMobileDevice(userAgent)) {
    redirect('/');
  }

  return (
    <div style={{ background: '#f5f5f7', minHeight: '100vh' }}>
      {children}
    </div>
  );
}
