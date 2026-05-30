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
        className="relative overflow-hidden overscroll-y-none flex flex-col w-full transition-all duration-300 ease-in-out"
        style={{
          height: dynamicMainHeight,
          maxHeight: dynamicMainHeight,
        }}
      >
        {/* The sidebar toggle floats over the page (absolute overlay, see Header) and reserves
            no layout space, so every page — chat included — fills <main> and the paper sheet
            (.nb-page) runs to the top edge. The spiral binding is a fixed overlay on the
            sidebar/page seam, independent of this. */}
        <Header />
        <div className="relative flex-1 min-h-0 w-full">
          <div className="nb-page absolute inset-0 z-1 overflow-hidden">
            <Outlet />
          </div>
        </div>
      </main>
      <SpiralBinding />
    </ThreadsProvider>
  );
}
