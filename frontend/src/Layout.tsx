import { debounce } from 'lodash';
import { useCallback, useEffect, useState } from 'react';
import { AppSidebar } from './components/AppSidebar';
import { Header } from './components/Common/Header';
import { Outlet } from 'react-router';

export default function Layout() {
  const [dynamicMainHeight, setDynamicMainHeight] = useState<string>('100dvh');

  // The keyboardHeight state might be kept if other components rely on it.
  // If it was solely for sizing the main element, this new approach might make it redundant for that specific purpose.
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  const viewportChangeHandler = useCallback(
    debounce(() => {
      if (window.visualViewport) {
        setDynamicMainHeight(`${window.visualViewport.height}px`);
        // You can still calculate and set keyboardHeight if it's used elsewhere
        const kh = window.innerHeight - window.visualViewport.height;
        setKeyboardHeight(Math.max(0, kh));
      } else {
        // Fallback if visualViewport is not supported
        setDynamicMainHeight('100dvh');
        setKeyboardHeight(0);
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
    <>
      <AppSidebar />
      <main
        className="relative overflow-hidden overscroll-y-none  flex flex-col w-full transition-all duration-300 ease-in-out"
        style={{
          height: dynamicMainHeight,
          maxHeight: dynamicMainHeight,
        }}
      >
        <Header />

        <div className="px-2.5 h-full w-full">
          <Outlet />
        </div>
      </main>
    </>
  );
}
