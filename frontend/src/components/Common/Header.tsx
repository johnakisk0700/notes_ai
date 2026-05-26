import { useLocation } from 'react-router';
import { SidebarTrigger } from '../ui/sidebar';
import { NoteSearch } from '../Notes/NoteSearch';
import { cn } from '@/lib/utils';

export const Header = () => {
  const { pathname } = useLocation();
  const css = pathname === '/notes' ? 'grid-cols-[auto_1fr]' : 'grid-cols-[auto] w-fit';
  return (
    <div
      className={cn(
        'z-50 h-14 relative p-2.5 rounded-lg grid xl:grid-cols-[auto_minmax(0,1fr)_auto] gap-2 max-w-full items-center',
        css
      )}
    >
      {/* Left Column: Sidebar Trigger */}
      <div>
        <SidebarTrigger />
      </div>

      {pathname === '/notes' ? (
        <>
          {/* Center Column: Search Bar */}
          {/* min-w-0 ensures the search bar can shrink below its intrinsic content size if needed */}
          <div className="flex justify-center min-w-0">
            <div className="w-full max-w-5xl ">
              <NoteSearch className="h-9" />
            </div>
          </div>

          {/* Right Column: Spacer - only visible and active on medium screens and up */}
          {/* On small screens, this div is hidden and does not participate in the grid layout due to the parent's grid-cols-[auto_1fr] */}
          <div className="hidden xl:block" style={{ visibility: 'hidden' }}>
            <SidebarTrigger />
          </div>
        </>
      ) : null}
    </div>
  );
};
