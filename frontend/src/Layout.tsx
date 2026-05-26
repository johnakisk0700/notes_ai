import { debounce } from 'lodash';
import { useCallback, useEffect, useState } from 'react';
import { AppSidebar } from './components/AppSidebar';
import { Header } from './components/Common/Header';
import { SpiralBinding } from './components/Common/SpiralBinding';
import { Outlet } from 'react-router';
import { ThreadsProvider } from './context/ThreadsContext';

export default function Layout() {
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

        {/* Page region: the coil sits in the gutter, its loops centered on the page
            sheet's left edge. The sheet (.nb-page) is opaque and inset by left-5
            (= the coil's cut line E), so it covers the right half of each loop —
            the loops read as skewed half-circles tucking under the page edge. */}
        <div className="relative flex-1 min-h-0 w-full">
          <SpiralBinding />
          <div className="nb-page absolute top-0 right-0 bottom-0 left-5 z-[1] overflow-hidden">
            <Outlet />
          </div>
        </div>
      </main>
    </ThreadsProvider>
  );
}
