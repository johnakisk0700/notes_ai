import { debounce } from 'lodash';
import { useCallback, useEffect, useState } from 'react';
import { AppSidebar } from './components/AppSidebar';
import { Header } from './components/Common/Header';
import { SpiralBinding } from './components/Common/SpiralBinding';
import { Outlet, useLocation } from 'react-router';
import { ThreadsProvider } from './context/ThreadsContext';
import { cn } from '@/lib/utils';

export default function Layout() {
  const { pathname } = useLocation();
  // Chat ("/" and "/thread/:id") uses a SEE-THROUGH header: the page region fills
  // <main> (under the transparent, floating header) so the notebook paper runs to the
  // very top and the active message can scroll up to line up with the toggle/title.
  // Other routes keep their content below the header bar.
  const chatPage = pathname === '/' || pathname.startsWith('/thread');

  const [dynamicMainHeight, setDynamicMainHeight] = useState<string>('100dvh');

  const viewportChangeHandler = useCallback(
    debounce(() => {
      if (window.visualViewport) {
        setDynamicMainHeight(`${window.visualViewport.height}px`);
      } else {
        // Fallback if visualViewport is not supported
        setDynamicMainHeight('100dvh');
      }
    }, 30),
    []
  );

  useEffect(() => {
    // Initial call to set height correctly
    viewportChangeHandler();

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', viewportChangeHandler);
      return () => {
        window.visualViewport?.removeEventListener('resize', viewportChangeHandler);
        viewportChangeHandler.cancel(); // Cancel any pending debounced calls
      };
    }
  }, [viewportChangeHandler]);

  return (
    <ThreadsProvider>
      <AppSidebar />
      <main
        className="relative overflow-hidden overscroll-y-none  flex flex-col w-full transition-all duration-300 ease-in-out"
        style={{
          height: dynamicMainHeight,
          maxHeight: dynamicMainHeight,
        }}
      >
        <Header />

        {/* Page region. On chat it fills <main> (absolute inset-0) so the paper sheet
            runs up under the transparent floating header; elsewhere it sits below the
            header bar. The sheet (.nb-page) is inset a touch from the left so its lifted
            edge sits just inside the spiral binding (a fixed overlay on the seam). */}
        <div className={cn('w-full', chatPage ? 'absolute inset-0' : 'relative flex-1 min-h-0')}>
          <div className="nb-page absolute top-0 right-0 bottom-0 left-3 z-[1] overflow-hidden">
            <Outlet />
          </div>
        </div>
      </main>
      <SpiralBinding />
    </ThreadsProvider>
  );
}
