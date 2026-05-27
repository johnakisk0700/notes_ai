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
  // Notebook pages with floating controls run underneath the see-through header,
  // so their ruled paper continues to the top edge. Chat also uses that space to
  // align an active message with the sidebar toggle.
  const chatPage = pathname === '/' || pathname.startsWith('/thread');
  const floatingPaperPage = chatPage || pathname === '/notes';

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

        {/* Page region. Notebook pages with floating controls fill <main> (absolute
            inset-0) so the paper sheet runs under the transparent header; elsewhere it sits below
            the header bar. The sheet (.nb-page) is flush-left to the seam; the spiral binding is a
            fixed overlay on the seam (anchored to the sidebar width, independent of this), so it
            sits over the sheet's left edge. */}
        <div className={cn('w-full', floatingPaperPage ? 'absolute inset-0' : 'relative flex-1 min-h-0')}>
          <div className="nb-page absolute inset-0 z-1 overflow-hidden">
            <Outlet />
          </div>
        </div>
      </main>
      <SpiralBinding />
    </ThreadsProvider>
  );
}
